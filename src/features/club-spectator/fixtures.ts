import type { MeetingSpectatorSnapshot } from "./types";
/** 공개 가능한 합성 데이터. 실제 계정·위치·코스 조회를 수행하지 않는다. */
export function spectatorFixture(now: number): MeetingSpectatorSnapshot {
  return {eventId: "fixture", groupId: "fixture-club", title: "저녁 한강 가상라이딩", status: "LIVE", serverNowMs: now,
    course: {courseId: "fixture-course", name: "한강 함께 달리기", distanceM: 12000,
      points: [{lat: 37.52, lon: 126.94}, {lat: 37.53, lon: 126.96}, {lat: 37.525, lon: 126.98}]},
    locations: [{uid: "rider-one", displayName: "솔바람", lat: 37.527, lng: 126.972, sampledAtMs: now - 2000, courseId: "fixture-course", progressM: 2400, speedMps: 8, powerWatts: 210, powerExpiresAtMs: now + 15000, status: "RIDING"},
      {uid: "rider-two", displayName: "나래", lat: 37.529, lng: 126.967, sampledAtMs: now - 3000, courseId: "fixture-course", progressM: 2280, speedMps: 7, powerWatts: 0, powerExpiresAtMs: now + 15000, status: "RIDING"},
      {uid: "rider-three", displayName: "여울", lat: 37.529, lng: 126.963, sampledAtMs: now - 40000, courseId: "fixture-course", progressM: null, speedMps: null, powerWatts: null, powerExpiresAtMs: null, status: "LOST_SIGNAL"}]};
}
