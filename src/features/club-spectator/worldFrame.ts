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

/** 서버 진행·격차를 반영한다. 선택 격차는 프레임의 track이 화면의 선택 대상과 같을 때만 쓴다. */
function withProgress(row: SpectatorRider, server: ServerProgress, selectedMatches: boolean): SpectatorRider {
  return {...row, progressSampledAtMs: undefined, progressM: server.progressM, gapToLeaderM: server.gapToLeaderM, leaderGapExpiresAtMs: server.leaderGapExpiresAtMs,
    ...(selectedMatches ? {gapToSelectedM: server.gapToSelectedM, selectedGapExpiresAtMs: server.selectedGapExpiresAtMs} : {})};
}

const sameProgress = (a: SpectatorRider, b: SpectatorRider) =>
  progressKeys.every(key => a[key] === b[key]) && a.progressSampledAtMs === b.progressSampledAtMs;

/**
 * 월드(Redis) 위치를 받은 즉시 반영한다(P11 Redis 실시간 경로 예외). 위치·속도·파워·상태와, 마커에 있으면
 * 서버가 계산한 코스 진행·격차(P6, 다시 계산하지 않음)를 그대로 옮긴다. 서버 필드가 없는 마커는 직전 값을 남기고
 * 다음 회원 전용 API 결과로 갱신한다. 표본 시각이 같은 마커도 선두 이동으로 격차가 바뀌면 다시 오므로 격차만 갱신한다.
 */
export function applyWorldFrame(snapshot: MeetingSpectatorSnapshot, frame: WorldEventFrame, now: number): MeetingSpectatorSnapshot {
  const course = snapshot.course;
  if (frame.eventId !== snapshot.eventId || !course) return snapshot;
  const names = new Map(snapshot.participants?.map(p => [p.uid, p.displayName]) ?? []);
  const rows = new Map(snapshot.locations.map(r => [r.uid, r]));
  const selectedMatches = !frame.trackUnknown && (frame.track ?? null) === snapshot.selectedUid;
  let changed = false;
  for (const marker of frame.markers) {
    if (!acceptable(snapshot, names, rows, marker, now)) continue;
    const uid = marker.uid!;
    const prior = rows.get(uid);
    const server = serverProgress(marker);
    if (prior && prior.sampledAtMs > marker.capturedAt) continue;
    if (prior && prior.sampledAtMs === marker.capturedAt) {
      if (!server) continue;
      const next = withProgress(prior, server, selectedMatches);
      if (sameProgress(prior, next)) continue;
      rows.set(uid, next);
      changed = true;
      continue;
    }
    const powerLive = typeof marker.power === "number" && typeof marker.powerExpiresAtMs === "number" && marker.powerExpiresAtMs > now;
    const ended = prior?.status === "FINISHED" || prior?.status === "DNF";
    const row: SpectatorRider = {
      uid, displayName: prior?.displayName ?? names.get(uid) ?? "회원", courseId: course.courseId,
      lat: marker.lat, lng: marker.lon, sampledAtMs: marker.capturedAt, progressM: prior?.progressM ?? null,
      speedMps: typeof marker.speedMps === "number" && marker.speedMps >= 0 && marker.speedMps <= 100 ? marker.speedMps : null,
      powerWatts: powerLive ? marker.power! : null, powerExpiresAtMs: powerLive ? marker.powerExpiresAtMs! : null,
      gapToLeaderM: prior?.gapToLeaderM ?? null, leaderGapExpiresAtMs: prior?.leaderGapExpiresAtMs ?? null,
      gapToSelectedM: prior?.gapToSelectedM ?? null, selectedGapExpiresAtMs: prior?.selectedGapExpiresAtMs ?? null,
      status: ended ? prior.status : marker.eventStatus === "lost_signal" ? "LOST_SIGNAL" : marker.status === "paused" ? "STOPPED" : "RIDING",
      // 서버 필드가 없으면 직전 진행·격차를 남기되 그 값이 계산된 표본 시각을 기억한다(콜러블 병합 때 되살리지 않도록).
      // 직전 행이 없으면 진행·격차는 미계산(0)이라 어떤 콜러블 값도 덮지 않는다.
      progressSampledAtMs: prior ? prior.progressSampledAtMs ?? prior.sampledAtMs : 0,
    };
    rows.set(uid, server ? withProgress(row, server, selectedMatches) : row);
    changed = true;
  }
  return changed ? {...snapshot, locations: [...rows.values()]} : snapshot;
}

/** 커버리지에 셀 마커 표본의 최대 나이. 월드 마커 신선도(8초)에 여유를 둔다. */
export const WORLD_MARKER_FRESH_MS = 10000;

/**
 * 월드 프레임이 이 화면에서 보이는 주행자를 모두 담고 서버 진행·격차를 싣는지 확인한다. 실제로 반영할 수 있는
 * (명단·코스·값·시각 검사를 통과한) 서버 진행 마커 수가 주행 수 이상이고 주행 수가 1 이상일 때만 참이다.
 */
export function worldFrameCoversRiders(snapshot: MeetingSpectatorSnapshot | null, frame: WorldEventFrame | null, now: number): boolean {
  if (!snapshot || !frame || frame.eventId !== snapshot.eventId || !snapshot.course) return false;
  const riding = frame.counts?.riding;
  if (!Number.isSafeInteger(riding) || riding <= 0) return false;
  const names = new Map(snapshot.participants?.map(p => [p.uid, p.displayName]) ?? []);
  const rows = new Map(snapshot.locations.map(r => [r.uid, r]));
  const covered = new Set<string>();
  for (const marker of frame.markers) {
    // 이전 delta에서 남은 오래된 마커는 세지 않는다(새 표본이 끊긴 참가자는 콜러블로 확인).
    if (acceptable(snapshot, names, rows, marker, now) && marker.capturedAt >= now - WORLD_MARKER_FRESH_MS && serverProgress(marker)) covered.add(marker.uid!);
  }
  return covered.size >= riding;
}

/**
 * 월드 모드에서 회원 전용 API 결과를 합친다. 월드가 이미 더 최신 위치를 반영한 참가자는 위치·속도·파워·상태를 남기고,
 * 진행·격차는 계산 기준 표본이 더 최신인 쪽을 쓴다(오래된 값을 되살리지 않는다). 명단은 새 결과를 그대로 쓴다.
 * 월드가 보이는 주행자를 모두 담지 못하는(폴백) 동안은 `keepWorldProgress=false`로 콜러블의 진행·격차를 우선한다
 * (선두 변경 등은 정본 최신 응답이 맞다).
 */
export function retainWorldPositions(previous: MeetingSpectatorSnapshot | null, next: MeetingSpectatorSnapshot, keepWorldProgress = true): MeetingSpectatorSnapshot {
  if (!previous || previous.eventId !== next.eventId || previous.course?.courseId !== next.course?.courseId) return next;
  const old = new Map(previous.locations.map(r => [r.uid, r]));
  return {...next, locations: next.locations.map(r => {
    const prior = old.get(r.uid);
    if (!prior || prior.sampledAtMs <= r.sampledAtMs) return r;
    const position = {...r, lat: prior.lat, lng: prior.lng, sampledAtMs: prior.sampledAtMs, speedMps: prior.speedMps, powerWatts: prior.powerWatts,
      powerExpiresAtMs: prior.powerExpiresAtMs, status: r.status === "FINISHED" || r.status === "DNF" ? r.status : prior.status};
    if (!keepWorldProgress || (prior.progressSampledAtMs ?? prior.sampledAtMs) <= r.sampledAtMs) return {...position, progressSampledAtMs: r.sampledAtMs};
    // 월드가 더 최신 표본으로 계산한 진행·격차를 남긴다. 선택 격차는 같은 선택 대상일 때만 남긴다.
    const selected = previous.selectedUid === next.selectedUid ? prior : r;
    return {...position, progressM: prior.progressM, gapToLeaderM: prior.gapToLeaderM, leaderGapExpiresAtMs: prior.leaderGapExpiresAtMs,
      gapToSelectedM: selected.gapToSelectedM, selectedGapExpiresAtMs: selected.selectedGapExpiresAtMs, progressSampledAtMs: prior.progressSampledAtMs};
  })};
}
