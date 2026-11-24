import type { WorldEventFrame, WorldEventMarker } from "../ride-world/useWorldEvent";
import type { MeetingSpectatorSnapshot, SpectatorRider } from "./types";

type ServerProgress = Pick<SpectatorRider, "progressM" | "gapToLeaderM" | "leaderGapExpiresAtMs" | "gapToSelectedM" | "selectedGapExpiresAtMs">;
const progressKeys = ["progressM", "gapToLeaderM", "leaderGapExpiresAtMs", "gapToSelectedM", "selectedGapExpiresAtMs"] as const;

/** 마커에 서버 계산 진행·격차(g1-web#4005) 5개 필드가 모두 숫자 또는 null로 있으면 그 값을 그대로 돌려준다. */
function serverProgress(marker: WorldEventMarker): ServerProgress | null {
  if (!progressKeys.every(key => marker[key] === null || typeof marker[key] === "number" && Number.isFinite(marker[key]))) return null;
  if (typeof marker.gapToLeaderM === "number" && marker.gapToLeaderM < 0) return null;
  return {progressM: marker.progressM!, gapToLeaderM: marker.gapToLeaderM!, leaderGapExpiresAtMs: marker.leaderGapExpiresAtMs!,
    gapToSelectedM: marker.gapToSelectedM!, selectedGapExpiresAtMs: marker.selectedGapExpiresAtMs!};
}

/** 이 화면에 반영할 수 있는 마커인지 확인한다. 명단 밖 계정·다른 코스·잘못된 값·미래 시각은 버린다. */
function acceptable(snapshot: MeetingSpectatorSnapshot, names: Map<string, string>, rows: Map<string, SpectatorRider>, marker: WorldEventMarker, now: number) {
  const uid = marker.uid;
  if (!uid || !snapshot.course) return false;
  const prior = rows.get(uid);
  return (prior ? prior.courseId === snapshot.course.courseId : names.has(uid)) &&
    Number.isFinite(marker.lat) && Number.isFinite(marker.lon) && Number.isFinite(marker.capturedAt) && marker.capturedAt <= now + 2000;
}

/** 명단에서 주행 중(RIDING)인 참가자 집합. */
const ridingUids = (snapshot: MeetingSpectatorSnapshot) => new Set(snapshot.participants?.filter(p => p.status === "RIDING").map(p => p.uid) ?? []);

/** 서버 진행·격차를 반영한다. 선택 격차는 프레임의 track이 화면의 선택 대상과 같을 때만 쓴다. */
function withProgress(row: SpectatorRider, server: ServerProgress, selectedMatches: boolean): SpectatorRider {
  return {...row, progressM: server.progressM, gapToLeaderM: server.gapToLeaderM, leaderGapExpiresAtMs: server.leaderGapExpiresAtMs,
    ...(selectedMatches ? {gapToSelectedM: server.gapToSelectedM, selectedGapExpiresAtMs: server.selectedGapExpiresAtMs} : {})};
}

const sameProgress = (a: SpectatorRider, b: SpectatorRider) => progressKeys.every(key => a[key] === b[key]);

/**
 * 월드(Redis) 위치·진행·격차를 받은 즉시 반영한다(P11 Redis 실시간 경로 예외).
 * 위치·속도·파워·상태는 더 최신 표본일 때만 옮긴다. 화면 위치보다 오래된 표본은 위치도 진행도 되돌리지 않는다.
 * 진행·격차는 P6(다시 계산하지 않음): 명단의 주행(RIDING) 참가자 마커에 서버 진행 필드가 있으면 그대로 쓴다.
 * 월드가 정상일 때만 호출한다(장애·정지·미연결 시 호출하지 않음).
 */
export function applyWorldFrame(snapshot: MeetingSpectatorSnapshot, frame: WorldEventFrame, now: number): MeetingSpectatorSnapshot {
  const course = snapshot.course;
  if (frame.eventId !== snapshot.eventId || !course) return snapshot;
  const names = new Map(snapshot.participants?.map(p => [p.uid, p.displayName]) ?? []);
  const rows = new Map(snapshot.locations.map(r => [r.uid, r]));
  const riding = ridingUids(snapshot);
  const selectedMatches = !frame.trackUnknown && (frame.track ?? null) === snapshot.selectedUid;
  let changed = false;
  for (const marker of frame.markers) {
    if (!acceptable(snapshot, names, rows, marker, now)) continue;
    const uid = marker.uid!;
    const prior = rows.get(uid);
    // 화면 위치보다 오래된 표본은 위치도 진행도 되돌리지 않는다.
    if (prior && prior.sampledAtMs > marker.capturedAt) continue;
    const powerLive = typeof marker.power === "number" && typeof marker.powerExpiresAtMs === "number" && marker.powerExpiresAtMs > now;
    const ended = prior?.status === "FINISHED" || prior?.status === "DNF";
    const server = riding.has(uid) ? serverProgress(marker) : null;
    // 같은 표본이면 위치는 그대로 두고 서버 진행·격차만 갱신한다(선두 이동 재전송 포함).
    // 더 최신 표본이면 위치·속도·파워·상태를 옮기고 진행·격차는 직전 값을 남겼다가 서버 필드가 있으면 덮는다.
    let row: SpectatorRider = prior && prior.sampledAtMs === marker.capturedAt ? prior : {
      uid, displayName: prior?.displayName ?? names.get(uid) ?? "회원", courseId: course.courseId,
      lat: marker.lat, lng: marker.lon, sampledAtMs: marker.capturedAt, progressM: prior?.progressM ?? null,
      speedMps: typeof marker.speedMps === "number" && marker.speedMps >= 0 && marker.speedMps <= 100 ? marker.speedMps : null,
      powerWatts: powerLive ? marker.power! : null, powerExpiresAtMs: powerLive ? marker.powerExpiresAtMs! : null,
      gapToLeaderM: prior?.gapToLeaderM ?? null, leaderGapExpiresAtMs: prior?.leaderGapExpiresAtMs ?? null,
      gapToSelectedM: prior?.gapToSelectedM ?? null, selectedGapExpiresAtMs: prior?.selectedGapExpiresAtMs ?? null,
      status: ended ? prior.status : marker.eventStatus === "lost_signal" ? "LOST_SIGNAL" : marker.status === "paused" ? "STOPPED" : "RIDING",
    };
    if (server) row = withProgress(row, server, selectedMatches);
    if (row === prior) continue;
    if (prior && row.sampledAtMs === prior.sampledAtMs && sameProgress(prior, row)) continue;
    rows.set(uid, row);
    changed = true;
  }
  return changed ? {...snapshot, locations: [...rows.values()]} : snapshot;
}

/**
 * 콜러블→월드 전환 순간에 호출한다. 출처 단일화: 월드 정상 중 진행·격차는 월드 값만 쓰므로
 * 콜러블에서 받은 진행·격차를 지우고 이후 월드 프레임이 채우게 한다. 완주·DNF는 콜러블이 최종 권한이라 둔다.
 */
export function enterWorldMode(snapshot: MeetingSpectatorSnapshot): MeetingSpectatorSnapshot {
  let changed = false;
  const locations = snapshot.locations.map(row => {
    if (row.status === "FINISHED" || row.status === "DNF" || progressKeys.every(key => row[key] === null)) return row;
    changed = true;
    return {...row, progressM: null, gapToLeaderM: null, leaderGapExpiresAtMs: null, gapToSelectedM: null, selectedGapExpiresAtMs: null};
  });
  return changed ? {...snapshot, locations} : snapshot;
}

/**
 * 월드 프레임이 이 화면의 출처가 될 수 있는지 확인한다.
 * - 명단의 주행(RIDING) 참가자가 1명 이상이고 이벤트 ID가 일치한다.
 * - 선택 대상이 있으면 프레임의 선택 기준이 확인되어(trackUnknown 아님) 현재 선택과 같아야 한다.
 *   화면 데이터의 선택도 현재 선택이어야 한다.
 * 프레임 신선도(5초)는 호출부의 정지 판정이 확인한다.
 * 마커가 없거나 서버 진행 필드가 없는 주행자는 미커버로 보지 않는다(진행·격차가 없는 상태로 표시).
 */
export function worldFrameCoversRiders(snapshot: MeetingSpectatorSnapshot | null, frame: WorldEventFrame | null, _now: number,
  selectedUid: string | null = snapshot?.selectedUid ?? null): boolean {
  if (!snapshot || !frame || frame.eventId !== snapshot.eventId || !snapshot.course) return false;
  if (selectedUid !== snapshot.selectedUid) return false;
  if (selectedUid !== null && (frame.trackUnknown || frame.track !== selectedUid)) return false;
  const riding = ridingUids(snapshot);
  if (riding.size === 0) return false;
  // 프레임 마커에 주행 중 참가자가 1명 이상 있어야 커버로 판정한다.
  // 마커가 없는 프레임은 위치 신호를 계속 열어 콜러블로 따라잡는다.
  return frame.markers.some(m => m.uid != null && riding.has(m.uid));
}

/**
 * 월드가 정상일 때 회원 전용 API 결과를 합친다. 명단·이름·완주·DNF 상태는 새 결과를 쓴다.
 * 완주·DNF가 아닌 참가자의 위치·진행·격차는 월드의 최신 값을 유지한다.
 * 월드 장애(worldHealthy=false)면 새 결과를 그대로 쓴다(콜러블이 단독 출처).
 * 전환 순간(월드→콜러블)에는 새 결과로 한 번 덮어쓰고, 복구(콜러블→월드)는 applyWorldFrame이 처리한다.
 */
export function retainWorldPositions(previous: MeetingSpectatorSnapshot | null, next: MeetingSpectatorSnapshot, worldHealthy = false): MeetingSpectatorSnapshot {
  if (!previous || !worldHealthy || previous.eventId !== next.eventId || previous.course?.courseId !== next.course?.courseId) return next;
  const old = new Map(previous.locations.map(r => [r.uid, r]));
  return {...next, locations: next.locations.map(r => {
    const prior = old.get(r.uid);
    // 완주·DNF는 콜러블이 최종 권한이다.
    if (r.status === "FINISHED" || r.status === "DNF") return r;
    // 월드 정상 중 새로 들어온 참가자도 진행·격차는 월드 값만 쓴다(마커가 오기 전까지 비워 둔다, 출처 단일화).
    if (!prior) return {...r, progressM: null, gapToLeaderM: null, leaderGapExpiresAtMs: null, gapToSelectedM: null, selectedGapExpiresAtMs: null};
    // 나머지는 월드의 위치·진행·격차를 유지하고 명단(displayName)만 콜러블에서 가져온다.
    return {...r, lat: prior.lat, lng: prior.lng, sampledAtMs: prior.sampledAtMs, speedMps: prior.speedMps,
      powerWatts: prior.powerWatts, powerExpiresAtMs: prior.powerExpiresAtMs, status: prior.status,
      progressM: prior.progressM, gapToLeaderM: prior.gapToLeaderM, leaderGapExpiresAtMs: prior.leaderGapExpiresAtMs,
      gapToSelectedM: prior.gapToSelectedM, selectedGapExpiresAtMs: prior.selectedGapExpiresAtMs};
  })};
}
