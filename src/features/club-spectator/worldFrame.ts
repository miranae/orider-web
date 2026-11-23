import type { WorldEventFrame, WorldEventMarker } from "../ride-world/useWorldEvent";
import type { MeetingSpectatorSnapshot, SpectatorRider } from "./types";

/** 이 화면에 반영할 수 있는 마커인지 확인한다. 명단 밖 계정·다른 코스·잘못된 값·미래 시각은 버린다. */
function acceptable(snapshot: MeetingSpectatorSnapshot, names: Map<string, string>, rows: Map<string, SpectatorRider>, marker: WorldEventMarker, now: number) {
  const uid = marker.uid;
  if (!uid || !snapshot.course) return false;
  const prior = rows.get(uid);
  return (prior ? prior.courseId === snapshot.course.courseId : names.has(uid)) &&
    Number.isFinite(marker.lat) && Number.isFinite(marker.lon) && Number.isFinite(marker.capturedAt) && marker.capturedAt <= now + 2000;
}

/**
 * 월드(Redis) 위치를 받은 즉시 반영한다(P11 Redis 실시간 경로 예외). 위치·속도·파워·상태만 덮어쓰는 보조 경로다.
 * 명단·코스·이름과 코스 진행·순위·격차는 서버 정본(P6)이므로 화면에서 다시 계산하거나 지우지 않고,
 * 다음 회원 전용 API 결과로 갱신한다(위치 변경 신호 구독은 월드와 무관하게 유지된다).
 */
export function applyWorldFrame(snapshot: MeetingSpectatorSnapshot, frame: WorldEventFrame, now: number): MeetingSpectatorSnapshot {
  const course = snapshot.course;
  if (frame.eventId !== snapshot.eventId || !course) return snapshot;
  const names = new Map(snapshot.participants?.map(p => [p.uid, p.displayName]) ?? []);
  const rows = new Map(snapshot.locations.map(r => [r.uid, r]));
  let changed = false;
  for (const marker of frame.markers) {
    if (!acceptable(snapshot, names, rows, marker, now)) continue;
    const uid = marker.uid!;
    const prior = rows.get(uid);
    if (prior && prior.sampledAtMs >= marker.capturedAt) continue;
    const powerLive = typeof marker.power === "number" && typeof marker.powerExpiresAtMs === "number" && marker.powerExpiresAtMs > now;
    const ended = prior?.status === "FINISHED" || prior?.status === "DNF";
    rows.set(uid, {
      uid, displayName: prior?.displayName ?? names.get(uid) ?? "회원", courseId: course.courseId,
      lat: marker.lat, lng: marker.lon, sampledAtMs: marker.capturedAt, progressM: prior?.progressM ?? null,
      speedMps: typeof marker.speedMps === "number" && marker.speedMps >= 0 && marker.speedMps <= 100 ? marker.speedMps : null,
      powerWatts: powerLive ? marker.power! : null, powerExpiresAtMs: powerLive ? marker.powerExpiresAtMs! : null,
      gapToLeaderM: prior?.gapToLeaderM ?? null, leaderGapExpiresAtMs: prior?.leaderGapExpiresAtMs ?? null,
      gapToSelectedM: prior?.gapToSelectedM ?? null, selectedGapExpiresAtMs: prior?.selectedGapExpiresAtMs ?? null,
      status: ended ? prior.status : marker.eventStatus === "lost_signal" ? "LOST_SIGNAL" : marker.status === "paused" ? "STOPPED" : "RIDING",
    });
    changed = true;
  }
  return changed ? {...snapshot, locations: [...rows.values()]} : snapshot;
}

/**
 * 월드 모드에서 회원 전용 API 결과를 합친다. 월드가 이미 더 최신 위치를 반영한 참가자는 위치·속도·파워·상태만
 * 남기고, 서버 진행·격차·명단은 새 결과를 그대로 쓴다(지우지 않는다).
 */
export function retainWorldPositions(previous: MeetingSpectatorSnapshot | null, next: MeetingSpectatorSnapshot): MeetingSpectatorSnapshot {
  if (!previous || previous.eventId !== next.eventId || previous.course?.courseId !== next.course?.courseId) return next;
  const old = new Map(previous.locations.map(r => [r.uid, r]));
  return {...next, locations: next.locations.map(r => {
    const prior = old.get(r.uid);
    if (!prior || prior.sampledAtMs <= r.sampledAtMs) return r;
    return {...r, lat: prior.lat, lng: prior.lng, sampledAtMs: prior.sampledAtMs, speedMps: prior.speedMps, powerWatts: prior.powerWatts,
      powerExpiresAtMs: prior.powerExpiresAtMs, status: r.status === "FINISHED" || r.status === "DNF" ? r.status : prior.status};
  })};
}
