import type { MeetingSpectatorSnapshot, SpectatorRider } from "./types";
export const staleRider = (rider: SpectatorRider, now: number) => now - rider.sampledAtMs > 30000 || rider.sampledAtMs > now + 2000;
export function liveRiders(snapshot: MeetingSpectatorSnapshot, now: number) {
  return snapshot.locations.filter(r => r.courseId === snapshot.course?.courseId).map(r => {
    const stale = staleRider(r, now);
    const comparable = !stale && r.progressM !== null && Number.isFinite(r.progressM) && r.progressM >= 0 && r.status !== "DNF" && r.status !== "FINISHED";
    return {...r, progressM: comparable ? r.progressM : null,
      gapToLeaderM: stale || r.leaderGapExpiresAtMs === null || now >= r.leaderGapExpiresAtMs ? null : r.gapToLeaderM,
      gapToSelectedM: stale || r.selectedGapExpiresAtMs === null || now >= r.selectedGapExpiresAtMs ? null : r.gapToSelectedM,
      speedMps: stale ? null : r.speedMps,
      powerWatts: stale || r.powerExpiresAtMs === null || now >= r.powerExpiresAtMs ? null : r.powerWatts,
      status: stale && !["FINISHED", "DNF"].includes(r.status) ? "LOST_SIGNAL" as const : r.status};
  });
}

/** 응답 자체가 최신이어도 역순으로 도착한 개별 위치가 선수를 뒤로 이동시키지 않는다. */
export function retainNewerSamples(previous: MeetingSpectatorSnapshot | null, next: MeetingSpectatorSnapshot): MeetingSpectatorSnapshot {
  if (!previous || previous.eventId !== next.eventId || previous.course?.courseId !== next.course?.courseId) return next;
  const old = new Map(previous.locations.map(r => [r.uid, r]));
  let regressed = false;
  const locations = next.locations.map(r => {
    const prior = old.get(r.uid);
    if (!prior || prior.sampledAtMs <= r.sampledAtMs) return r;
    regressed = true;
    return {...prior, gapToLeaderM: null, gapToSelectedM: null, status: r.status === "FINISHED" || r.status === "DNF" ? r.status : prior.status};
  });
  return {...next, locations: regressed ? locations.map(r => ({...r, gapToLeaderM: null, gapToSelectedM: null})) : locations};
}
