import type { WorldEventFrame, WorldEventMarker } from "../ride-world/useWorldEvent";
import type { MeetingSpectatorSnapshot, SpectatorRider } from "./types";

type ServerProgress = Pick<SpectatorRider, "progressM" | "gapToLeaderM" | "leaderGapExpiresAtMs" | "gapToSelectedM" | "selectedGapExpiresAtMs" | "progressComputedAtMs">;
const progressKeys = ["progressM", "gapToLeaderM", "leaderGapExpiresAtMs", "gapToSelectedM", "selectedGapExpiresAtMs"] as const;

/** 마커에 서버 계산 진행·격차(g1-web#4005) 5개 필드가 모두 숫자 또는 null로 있으면 그 값을 그대로 돌려준다. */
function serverProgress(marker: WorldEventMarker): ServerProgress | null {
  if (!progressKeys.every(key => marker[key] === null || typeof marker[key] === "number" && Number.isFinite(marker[key]))) return null;
  if (typeof marker.gapToLeaderM === "number" && marker.gapToLeaderM < 0) return null;
  return {progressM: marker.progressM!, gapToLeaderM: marker.gapToLeaderM!, leaderGapExpiresAtMs: marker.leaderGapExpiresAtMs!,
    gapToSelectedM: marker.gapToSelectedM!, selectedGapExpiresAtMs: marker.selectedGapExpiresAtMs!, progressComputedAtMs: computedAt(marker.progressComputedAtMs)};
}

const computedAt = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * 진행·격차 계산 시각 비교(g1-web#4037). 양쪽 모두 시각이 있으면 candidate가 current보다 늦게 계산됐는지 돌려주고,
 * 한쪽이라도 없으면(배포 전 서버) null을 돌려 호출부가 기존 표본 시각 규칙을 따르게 한다.
 */
function computedLater(candidate: {progressComputedAtMs?: number | null}, current: {progressComputedAtMs?: number | null}): boolean | null {
  const a = computedAt(candidate.progressComputedAtMs), b = computedAt(current.progressComputedAtMs);
  // 기준 시각(입력 표본 시각 최댓값, g1-web#4037)이 같으면 같은 입력이라 판단할 수 없으므로 기존 위치 표본 규칙에 맡긴다.
  return a === null || b === null || a === b ? null : a > b;
}

/** 이 화면에 반영할 수 있는 마커인지 확인한다. 명단 밖 계정·다른 코스·잘못된 값·미래 시각은 버린다. */
function acceptable(snapshot: MeetingSpectatorSnapshot, names: Map<string, string>, rows: Map<string, SpectatorRider>, marker: WorldEventMarker, now: number) {
  const uid = marker.uid;
  if (!uid || !snapshot.course) return false;
  const prior = rows.get(uid);
  return (prior ? prior.courseId === snapshot.course.courseId : names.has(uid)) &&
    Number.isFinite(marker.lat) && Number.isFinite(marker.lon) && Number.isFinite(marker.capturedAt) && marker.capturedAt <= now + 2000;
}

/** 진행·격차 출처가 월드인 참가자: 명단에서 주행 중(RIDING)인 참가자. 커버리지도 이 집합으로 판정한다. */
const ridingUids = (snapshot: MeetingSpectatorSnapshot) => new Set(snapshot.participants?.filter(p => p.status === "RIDING").map(p => p.uid) ?? []);

/** 서버 진행·격차를 반영한다. 선택 격차는 프레임의 track이 화면의 선택 대상과 같을 때만 쓴다. */
function withProgress(row: SpectatorRider, server: ServerProgress, selectedMatches: boolean): SpectatorRider {
  return {...row, progressM: server.progressM, gapToLeaderM: server.gapToLeaderM, leaderGapExpiresAtMs: server.leaderGapExpiresAtMs,
    progressComputedAtMs: server.progressComputedAtMs,
    ...(selectedMatches ? {gapToSelectedM: server.gapToSelectedM, selectedGapExpiresAtMs: server.selectedGapExpiresAtMs} : {})};
}

const sameProgress = (a: SpectatorRider, b: SpectatorRider) =>
  progressKeys.every(key => a[key] === b[key]) && (a.progressComputedAtMs ?? null) === (b.progressComputedAtMs ?? null);

/**
 * 월드(Redis) 위치를 받은 즉시 반영한다(P11 Redis 실시간 경로 예외). 위치·속도·파워·상태는 표본이 더 최신일 때만 옮긴다.
 * 진행·격차 출처는 단순 규칙을 따른다(P6, 다시 계산하지 않음):
 * - 커버(`covered=true`): 명단의 주행 참가자는 화면 위치보다 오래되지 않은 마커의 서버 진행·격차를 항상 그대로 쓴다
 *   (같은 표본이어도 서버의 최신 값 — 선두 이동 재전송 포함). 커버로 바뀌는 순간 호출부가 최신 프레임으로 다시 불러 즉시 덮는다.
 * - 미커버(폴백) 또는 주행 중이 아닌 참가자: 월드는 위치만 갱신하고 진행·격차는 회원 전용 API 값을 그대로 둔다.
 * - 계산 시각(g1-web#4037): 화면 값과 마커 모두 `progressComputedAtMs`가 있으면 위 표본 규칙 대신 더 늦게 계산된 쪽
 *   진행·격차를 쓴다(늦게 온 프레임이 콜러블의 더 최신 격차를 되돌리지 않고, 화면 위치보다 오래된 표본이어도 더 늦게
 *   계산된 격차는 반영). 위치는 계속 표본 시각으로 고른다.
 */
export function applyWorldFrame(snapshot: MeetingSpectatorSnapshot, frame: WorldEventFrame, now: number, covered = true): MeetingSpectatorSnapshot {
  const course = snapshot.course;
  if (frame.eventId !== snapshot.eventId || !course) return snapshot;
  const names = new Map(snapshot.participants?.map(p => [p.uid, p.displayName]) ?? []);
  const rows = new Map(snapshot.locations.map(r => [r.uid, r]));
  const riding = covered ? ridingUids(snapshot) : new Set<string>();
  const selectedMatches = !frame.trackUnknown && (frame.track ?? null) === snapshot.selectedUid;
  let changed = false;
  for (const marker of frame.markers) {
    if (!acceptable(snapshot, names, rows, marker, now)) continue;
    const uid = marker.uid!;
    const prior = rows.get(uid);
    const server = riding.has(uid) ? serverProgress(marker) : null;
    const later = server && prior ? computedLater(server, prior) : null;
    // 화면 위치보다 오래된 표본은 위치를 되돌리지 않는다. 진행·격차는 양쪽 계산 시각이 있고 마커가 더 늦게 계산됐을 때만 옮긴다.
    if (prior && prior.sampledAtMs > marker.capturedAt) {
      if (later !== true) continue;
      rows.set(uid, withProgress(prior, server!, selectedMatches));
      changed = true;
      continue;
    }
    const powerLive = typeof marker.power === "number" && typeof marker.powerExpiresAtMs === "number" && marker.powerExpiresAtMs > now;
    const ended = prior?.status === "FINISHED" || prior?.status === "DNF";
    // 같은 표본이면 위치는 그대로 두고, 더 최신 표본이면 위치·속도·파워·상태를 옮기고 진행·격차는 직전 값을 남긴다.
    let row: SpectatorRider = prior && prior.sampledAtMs === marker.capturedAt ? prior : {
      uid, displayName: prior?.displayName ?? names.get(uid) ?? "회원", courseId: course.courseId,
      lat: marker.lat, lng: marker.lon, sampledAtMs: marker.capturedAt, progressM: prior?.progressM ?? null,
      speedMps: typeof marker.speedMps === "number" && marker.speedMps >= 0 && marker.speedMps <= 100 ? marker.speedMps : null,
      powerWatts: powerLive ? marker.power! : null, powerExpiresAtMs: powerLive ? marker.powerExpiresAtMs! : null,
      gapToLeaderM: prior?.gapToLeaderM ?? null, leaderGapExpiresAtMs: prior?.leaderGapExpiresAtMs ?? null,
      gapToSelectedM: prior?.gapToSelectedM ?? null, selectedGapExpiresAtMs: prior?.selectedGapExpiresAtMs ?? null,
      ...(prior?.progressComputedAtMs == null ? {} : {progressComputedAtMs: prior.progressComputedAtMs}),
      status: ended ? prior.status : marker.eventStatus === "lost_signal" ? "LOST_SIGNAL" : marker.status === "paused" ? "STOPPED" : "RIDING",
    };
    // 화면 값이 더 늦게 계산됐으면(늦게 온 프레임) 진행·격차는 화면 값을 둔다.
    if (server && later !== false) row = withProgress(row, server, selectedMatches);
    if (row === prior || prior && row.sampledAtMs === prior.sampledAtMs && sameProgress(prior, row)) continue;
    rows.set(uid, row);
    changed = true;
  }
  return changed ? {...snapshot, locations: [...rows.values()]} : snapshot;
}

/** 커버리지에 셀 마커 표본의 최대 나이. 월드 마커 신선도(8초)에 여유를 둔다. */
export const WORLD_MARKER_FRESH_MS = 10000;

/**
 * 월드 프레임이 이 화면의 진행·격차 출처가 될 수 있는지 확인한다(보수적 규칙).
 * - 명단의 주행(RIDING) 참가자 uid가 1명 이상이고, 그 전원이 각각 신선한(최근 10초) 서버 진행 필드 포함 마커를 가진다.
 *   마커 개수는 비교하지 않으며 주행 중이 아닌 참가자(완주·DNF 등)의 마커는 기여하지 않는다.
 * - 선택 대상이 있으면 프레임의 선택 기준이 확인되어(trackUnknown 아님) 현재 선택과 같아야 한다. 화면 데이터의 선택도
 *   현재 선택이어야 한다. 프레임 신선도(5초)는 호출부의 정지 판정이 확인한다.
 */
export function worldFrameCoversRiders(snapshot: MeetingSpectatorSnapshot | null, frame: WorldEventFrame | null, now: number,
  selectedUid: string | null = snapshot?.selectedUid ?? null): boolean {
  if (!snapshot || !frame || frame.eventId !== snapshot.eventId || !snapshot.course) return false;
  if (selectedUid !== snapshot.selectedUid) return false;
  if (selectedUid !== null && (frame.trackUnknown || frame.track !== selectedUid)) return false;
  const riding = ridingUids(snapshot);
  if (riding.size === 0) return false;
  // 월드 명단에 콜러블 명단이 모르는 참가자나 콜러블이 아직 주행으로 보지 않는 주행자가 있으면 미커버로 두어 콜러블로 명단을 따라잡는다.
  const known = new Set(snapshot.participants?.map(p => p.uid) ?? []);
  if (frame.roster?.some(r => !known.has(r.uid) || (r.state === "RIDING" && !riding.has(r.uid)))) return false;
  const names = new Map(snapshot.participants?.map(p => [p.uid, p.displayName]) ?? []);
  const rows = new Map(snapshot.locations.map(r => [r.uid, r]));
  const covered = new Set<string>();
  for (const marker of frame.markers) {
    // 이전 delta에서 남은 오래된 마커는 세지 않는다(새 표본이 끊긴 참가자는 콜러블로 확인).
    if (acceptable(snapshot, names, rows, marker, now) && marker.capturedAt >= now - WORLD_MARKER_FRESH_MS && serverProgress(marker)) covered.add(marker.uid!);
  }
  return [...riding].every(uid => covered.has(uid));
}

/**
 * 월드 모드에서 회원 전용 API 결과를 합친다. 명단은 새 결과를 그대로 쓴다. 새 결과의 위치가 같거나 더 최신인 참가자는
 * 새 결과를 모두 쓰고, 월드가 더 최신 표본을 반영한 참가자는 위치·속도·파워·상태를 남긴다(완주·DNF는 새 결과).
 * 진행·격차는 위치 표본을 따른다: 월드 표본이 더 최신이고 커버(`covered=true`) 중이며 직전·새 명단 모두에서 주행 중인
 * 참가자만 월드 값을 남기고(선택 격차는 같은 선택 대상일 때만), 같은 표본이면 응답 시점에 계산된 콜러블 값을 쓴다
 * (월드 마커가 콜러블 위치보다 오래돼 버려진 동안에도 같은 표본의 최신 선두 격차가 반영되게, #1865).
 * 계산 시각(g1-web#4037): 그 참가자의 화면 값과 새 결과 모두 `progressComputedAtMs`가 있으면 진행·격차는 표본 대신
 * 더 늦게 계산된 쪽을 쓴다(늦게 도착했지만 더 일찍 계산된 콜러블은 월드 값을 되돌리지 않는다). 위치 규칙은 그대로다.
 */
export function retainWorldPositions(previous: MeetingSpectatorSnapshot | null, next: MeetingSpectatorSnapshot, covered = false): MeetingSpectatorSnapshot {
  if (!previous || previous.eventId !== next.eventId || previous.course?.courseId !== next.course?.courseId) return next;
  const old = new Map(previous.locations.map(r => [r.uid, r]));
  // 직전에도 주행 중이던 참가자만: 커버 판정이 그들의 월드 진행 반영을 보장한다(새로 주행을 시작한 참가자는 콜러블 값).
  const before = ridingUids(previous);
  const riding = covered ? new Set([...ridingUids(next)].filter(uid => before.has(uid))) : new Set<string>();
  return {...next, locations: next.locations.map(r => {
    const prior = old.get(r.uid);
    if (!prior) return r;
    const later = riding.has(r.uid) ? computedLater(r, prior) : null;
    const selected = previous.selectedUid === next.selectedUid ? prior : r;
    const kept = (row: SpectatorRider): SpectatorRider => ({...row, progressM: prior.progressM, gapToLeaderM: prior.gapToLeaderM,
      leaderGapExpiresAtMs: prior.leaderGapExpiresAtMs, gapToSelectedM: selected.gapToSelectedM, selectedGapExpiresAtMs: selected.selectedGapExpiresAtMs,
      progressComputedAtMs: prior.progressComputedAtMs});
    // 새 결과의 위치가 같거나 더 최신이면 그 표본의 값을 모두 쓴다(진행·격차가 위치보다 오래되지 않게). 단 화면 값이 더 늦게 계산됐으면 진행·격차는 남긴다.
    if (prior.sampledAtMs <= r.sampledAtMs) return later === false ? kept(r) : r;
    const position = {...r, lat: prior.lat, lng: prior.lng, sampledAtMs: prior.sampledAtMs, speedMps: prior.speedMps,
      powerWatts: prior.powerWatts, powerExpiresAtMs: prior.powerExpiresAtMs, status: r.status === "FINISHED" || r.status === "DNF" ? r.status : prior.status};
    // 새 결과가 더 늦게 계산됐으면 진행·격차는 새 결과를 쓴다.
    if (!riding.has(r.uid) || later === true) return position;
    return kept(position);
  })};
}
