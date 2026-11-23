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

const index = (snapshot: MeetingSpectatorSnapshot) => ({
  names: new Map(snapshot.participants?.map(p => [p.uid, p.displayName]) ?? []),
  rows: new Map(snapshot.locations.map(r => [r.uid, r])),
});

/**
 * 월드 프레임이 이 화면의 주행자를 모두 담았는지 확인한다. 실제로 반영할 수 있는 마커만 센다.
 * 주행자가 없거나(이전 위치를 정리할 근거가 없다) 표시 제한(최대 10개)·버린 표본으로 모자라면 완전하지 않다.
 */
export function worldFrameComplete(snapshot: MeetingSpectatorSnapshot, frame: WorldEventFrame, now: number): boolean {
  if (frame.eventId !== snapshot.eventId || frame.counts.riding <= 0) return false;
  const {names, rows} = index(snapshot);
  return frame.markers.filter(marker => acceptable(snapshot, names, rows, marker, now)).length >= frame.counts.riding;
}

/**
 * 월드(Redis) 위치를 받은 즉시 반영한다(P11 Redis 실시간 경로 예외).
 * 명단·코스·이름은 회원 전용 API 값을 유지한다. 코스 진행·순위·격차는 서버 정본만 쓰므로(P6) 화면에서 다시
 * 계산하지 않는다. 위치가 바뀐 참가자는 서버 값이 그 위치를 설명하지 않으므로 비워 두고, 다음 서버 조회에서 채운다.
 */
export function applyWorldFrame(snapshot: MeetingSpectatorSnapshot, frame: WorldEventFrame, now: number): MeetingSpectatorSnapshot {
  const course = snapshot.course;
  if (frame.eventId !== snapshot.eventId || !course) return snapshot;
  const {names, rows} = index(snapshot);
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
      lat: marker.lat, lng: marker.lon, sampledAtMs: marker.capturedAt, progressM: null,
      speedMps: typeof marker.speedMps === "number" && marker.speedMps >= 0 && marker.speedMps <= 100 ? marker.speedMps : null,
      powerWatts: powerLive ? marker.power! : null, powerExpiresAtMs: powerLive ? marker.powerExpiresAtMs! : null,
      gapToLeaderM: null, leaderGapExpiresAtMs: null, gapToSelectedM: null, selectedGapExpiresAtMs: null,
      status: ended ? prior.status : marker.eventStatus === "lost_signal" ? "LOST_SIGNAL" : marker.status === "paused" ? "STOPPED" : "RIDING",
    });
    changed = true;
  }
  if (!changed) return snapshot;
  // 다른 참가자의 격차는 바뀐 참가자 위치를 기준으로 계산된 값일 수 있으므로 함께 비운다(서버 순서는 유지).
  return {...snapshot, locations: [...rows.values()].map(r => ({...r, gapToLeaderM: null, leaderGapExpiresAtMs: null, gapToSelectedM: null, selectedGapExpiresAtMs: null}))};
}
