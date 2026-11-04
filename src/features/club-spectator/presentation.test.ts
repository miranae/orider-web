import { describe, expect, it } from "vitest";
import { spectatorFixture } from "./fixtures";
import { liveRiders, retainNewerSamples } from "./presentation";
describe("코스 위 관전 표시", () => {
  it("같은 코스만 진행순으로 정렬하고 0W와 만료를 구분한다", () => {
    const snapshot = spectatorFixture(100000);
    snapshot.locations.push({...snapshot.locations[0], uid: "wrong", courseId: "other"});
    expect(liveRiders(snapshot, 100000).map(r => r.uid)).toEqual(["rider-one", "rider-two", "rider-three"]);
    expect(liveRiders(snapshot, 100000)[1].powerWatts).toBe(0);
    expect(liveRiders(snapshot, 120000)[0].powerWatts).toBeNull();
  });
  it("새 서버 응답 시각으로 개별 위치를 신선하게 만들지 않는다", () => {
    const snapshot = spectatorFixture(100000);
    expect(liveRiders(snapshot, 140000).every(r => r.progressM === null && r.speedMps === null && r.powerWatts === null && r.status === "LOST_SIGNAL")).toBe(true);
    snapshot.locations[0].status = "FINISHED";
    expect(liveRiders(snapshot, 140000).find(r => r.uid === "rider-one")?.status).toBe("FINISHED");
  });
});

it("역순 위치를 되돌리지 않고 현재 응답에서 빠진 탈퇴 멤버를 부활시키지 않는다", () => {
  const previous = spectatorFixture(100000);
  const next = spectatorFixture(100100);
  next.locations = [{...next.locations[0], sampledAtMs: 90000, progressM: 10}];
  const merged = retainNewerSamples(previous, next);
  expect(merged.locations).toHaveLength(1);
  expect(merged.locations[0].progressM).toBe(2400);
  expect(merged.locations[0].sampledAtMs).toBe(98000);
});
