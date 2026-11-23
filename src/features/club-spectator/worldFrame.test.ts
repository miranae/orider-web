import { describe, expect, it } from "vitest";
import type { WorldEventFrame, WorldEventMarker } from "../ride-world/useWorldEvent";
import { spectatorFixture } from "./fixtures";
import { applyWorldFrame, retainWorldPositions } from "./worldFrame";

const now = 1_800_000_000_000;
const frame = (markers: Partial<WorldEventMarker>[], riding = markers.length): WorldEventFrame => ({
  v: 1, type: "event_snapshot", eventId: "fixture", revision: 1, updatedAt: now, viewers: 1,
  counts: {riding, total: riding}, roster: [],
  markers: markers.map((m, i) => ({id: `m${i}`, kind: "virtual", lat: 37.53, lon: 126.96, status: "riding", capturedAt: now, ...m})),
});

describe("월드 관전 프레임 반영", () => {
  it("위치·속도·파워·상태만 덮어쓰고 서버 진행·순위·격차는 지우거나 다시 계산하지 않는다(P6)", () => {
    const base = spectatorFixture(now);
    const next = applyWorldFrame(base, frame([{uid: "rider-two", lat: 37.525, lon: 126.98, speedMps: 9, power: 250, powerExpiresAtMs: now + 5000}]), now);
    expect(next.locations.map(r => r.uid)).toEqual(base.locations.map(r => r.uid));
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({displayName: "나래", sampledAtMs: now, speedMps: 9, powerWatts: 250,
      progressM: 2280, gapToLeaderM: 120, leaderGapExpiresAtMs: now + 27000, status: "RIDING"});
    expect(next.locations.find(r => r.uid === "rider-one")).toMatchObject({progressM: 2400, gapToLeaderM: 0});
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
  it("콜러블 결과를 합칠 때 월드의 더 최신 위치만 남기고 서버 진행·격차는 새 결과로 갱신한다", () => {
    const shown = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", lat: 37.525, lon: 126.98, status: "paused"}]), now);
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, progressM: 2350, gapToLeaderM: 60} : r.uid === "rider-one" ? {...r, lng: 126.975, sampledAtMs: now + 1} : r);
    const merged = retainWorldPositions(shown, server);
    expect(merged.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, sampledAtMs: now, status: "STOPPED", progressM: 2350, gapToLeaderM: 60});
    expect(merged.locations.find(r => r.uid === "rider-one")?.lng).toBe(126.975);
    const finished = {...server, locations: server.locations.map(r => r.uid === "rider-two" ? {...r, status: "FINISHED" as const} : r)};
    expect(retainWorldPositions(shown, finished).locations.find(r => r.uid === "rider-two")?.status).toBe("FINISHED");
  });
});
