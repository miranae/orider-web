import { describe, expect, it } from "vitest";
import type { WorldEventFrame, WorldEventMarker } from "../ride-world/useWorldEvent";
import { spectatorFixture } from "./fixtures";
import { applyWorldFrame, worldFrameComplete } from "./worldFrame";

const now = 1_800_000_000_000;
const frame = (markers: Partial<WorldEventMarker>[], riding = markers.length): WorldEventFrame => ({
  v: 1, type: "event_snapshot", eventId: "fixture", revision: 1, updatedAt: now, viewers: 1,
  counts: {riding, total: riding}, roster: [],
  markers: markers.map((m, i) => ({id: `m${i}`, kind: "virtual", lat: 37.53, lon: 126.96, status: "riding", capturedAt: now, ...m})),
});

describe("월드 관전 프레임 반영", () => {
  it("새 위치를 바로 반영하되 진행·순위·격차를 화면에서 다시 계산하지 않는다(P6)", () => {
    const base = spectatorFixture(now);
    const next = applyWorldFrame(base, frame([{uid: "rider-two", lat: 37.525, lon: 126.98, speedMps: 9, power: 250, powerExpiresAtMs: now + 5000}]), now);
    expect(next.locations.map(r => r.uid)).toEqual(base.locations.map(r => r.uid));
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({displayName: "나래", sampledAtMs: now, speedMps: 9, powerWatts: 250, progressM: null, status: "RIDING"});
    expect(next.locations.find(r => r.uid === "rider-one")?.progressM).toBe(2400);
    expect(next.locations.every(r => r.gapToLeaderM === null && r.gapToSelectedM === null)).toBe(true);
  });
  it("멈춘 선두가 화면 계산으로 선두에 남지 않는다", () => {
    const base = spectatorFixture(now);
    const next = applyWorldFrame(base, frame([{uid: "rider-two", lat: 37.525, lon: 126.98}]), now + 60000);
    expect(next.locations.find(r => r.uid === "rider-one")).toMatchObject({gapToLeaderM: null, leaderGapExpiresAtMs: null});
  });
  it("오래된 표본·명단 밖 계정·다른 이벤트·미래 시각은 무시한다", () => {
    const base = spectatorFixture(now);
    expect(applyWorldFrame(base, frame([{uid: "rider-one", capturedAt: now - 5000}, {uid: "stranger"}, {uid: "rider-two", capturedAt: now + 5000}]), now)).toBe(base);
    expect(applyWorldFrame(base, {...frame([{uid: "rider-one"}]), eventId: "other"}, now)).toBe(base);
  });
  it("명단에 있고 위치가 없던 참가자를 추가하며 정지·수신 지연 상태를 옮긴다", () => {
    const next = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-four", status: "paused"}, {uid: "rider-one", eventStatus: "lost_signal"}]), now);
    expect(next.locations.find(r => r.uid === "rider-four")).toMatchObject({displayName: "새벽", status: "STOPPED", courseId: "fixture-course"});
    expect(next.locations.find(r => r.uid === "rider-one")?.status).toBe("LOST_SIGNAL");
  });
  it("반영 가능한 마커가 주행자 수 이상이고 주행자가 있을 때만 완전하다", () => {
    const base = spectatorFixture(now);
    expect(worldFrameComplete(base, frame([{uid: "rider-one"}]), now)).toBe(true);
    expect(worldFrameComplete(base, frame([{uid: "rider-one"}], 11), now)).toBe(false);
    expect(worldFrameComplete(base, frame([], 0), now)).toBe(false);
    expect(worldFrameComplete(base, frame([{uid: "rider-one", capturedAt: now + 5000}]), now)).toBe(false);
    expect(worldFrameComplete(base, frame([{uid: "stranger"}]), now)).toBe(false);
  });
});
