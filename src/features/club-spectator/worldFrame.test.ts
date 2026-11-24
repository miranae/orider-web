import { describe, expect, it } from "vitest";
import type { WorldEventFrame, WorldEventMarker } from "../ride-world/useWorldEvent";
import { spectatorFixture } from "./fixtures";
import { liveRiders } from "./presentation";
import { applyWorldFrame, retainWorldPositions, WORLD_MARKER_FRESH_MS, worldFrameCoversRiders } from "./worldFrame";

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

const progress = (progressM: number | null, gapToLeaderM: number | null, gapToSelectedM: number | null = null) => ({
  progressM, gapToLeaderM, leaderGapExpiresAtMs: gapToLeaderM === null ? null : now + 25000,
  gapToSelectedM, selectedGapExpiresAtMs: gapToSelectedM === null ? null : now + 20000,
});

describe("월드 서버 진행·격차 (g1-web#4005)", () => {
  it("마커의 서버 진행·격차·만료를 다시 계산하지 않고 그대로 반영하며 null도 그대로 옮긴다", () => {
    const next = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", ...progress(2500, 40)}, {uid: "rider-one", ...progress(null, null)}]), now);
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2500, gapToLeaderM: 40, leaderGapExpiresAtMs: now + 25000});
    expect(next.locations.find(r => r.uid === "rider-one")).toMatchObject({progressM: null, gapToLeaderM: null, leaderGapExpiresAtMs: null});
    expect(next.locations.find(r => r.uid === "rider-two")?.progressSampledAtMs).toBeUndefined();
  });
  it("만료 시각이 지난 격차는 화면에서 숨긴다", () => {
    const next = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", ...progress(2500, 40)}]), now);
    expect(liveRiders(next, now + 24000).find(r => r.uid === "rider-two")?.gapToLeaderM).toBe(40);
    expect(liveRiders(next, now + 25000).find(r => r.uid === "rider-two")?.gapToLeaderM).toBeNull();
  });
  it("선택 격차는 프레임의 track이 화면의 선택 대상과 같을 때만 반영한다", () => {
    const base = {...spectatorFixture(now), selectedUid: "rider-one"};
    const matching = applyWorldFrame(base, {...frame([{uid: "rider-two", ...progress(2500, 40, 30)}]), track: "rider-one"}, now);
    expect(matching.locations.find(r => r.uid === "rider-two")).toMatchObject({gapToSelectedM: 30, selectedGapExpiresAtMs: now + 20000});
    const stale = applyWorldFrame(base, {...frame([{uid: "rider-two", ...progress(2500, 40, 30)}]), track: "rider-three"}, now);
    expect(stale.locations.find(r => r.uid === "rider-two")).toMatchObject({gapToLeaderM: 40, gapToSelectedM: null, selectedGapExpiresAtMs: null});
  });
  it("표본 시각이 같은 마커가 다시 오면(선두 이동) 격차만 갱신하고 바뀐 것이 없으면 그대로 둔다", () => {
    const first = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", lat: 37.525, lon: 126.98, ...progress(2500, 40)}]), now);
    const moved = applyWorldFrame(first, frame([{uid: "rider-two", lat: 1, lon: 1, ...progress(2500, 90)}]), now);
    expect(moved.locations.find(r => r.uid === "rider-two")).toMatchObject({lat: 37.525, gapToLeaderM: 90});
    expect(applyWorldFrame(moved, frame([{uid: "rider-two", ...progress(2500, 90)}]), now)).toBe(moved);
    expect(applyWorldFrame(moved, frame([{uid: "rider-two", capturedAt: now - 1, ...progress(1, 1)}]), now)).toBe(moved);
  });
  it("보이는 주행자를 모두 반영할 수 있는 서버 진행 마커가 있을 때만 완전한 프레임으로 본다", () => {
    const base = spectatorFixture(now);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}, {uid: "rider-two", ...progress(null, null)}]), now)).toBe(true);
    // 주행 0명, 서버 필드 없음, 명단 밖·미래 표본·잘못된 값으로 버린 마커는 세지 않는다.
    expect(worldFrameCoversRiders(base, frame([], 0), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}], 0), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}, {uid: "rider-two"}]), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}, {uid: "stranger", ...progress(1, 0)}]), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}, {uid: "rider-two", capturedAt: now + 5000, ...progress(1, 0)}]), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}, {uid: "rider-two", ...progress(1, -5)}]), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}, {uid: "rider-one", ...progress(1, 0)}], 2), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}], 2), now)).toBe(false);
    expect(worldFrameCoversRiders(null, frame([{uid: "rider-one", ...progress(1, 0)}]), now)).toBe(false);
  });
  it("콜러블 병합은 더 최신 표본의 월드 진행·격차를 남기고, 서버 필드 없이 끌고 온 오래된 진행은 되살리지 않는다", () => {
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now - 1000, progressM: 2400, gapToLeaderM: 70} : r);
    const fromWorld = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", ...progress(2500, 40)}]), now);
    expect(retainWorldPositions(fromWorld, server).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2500, gapToLeaderM: 40});
    const carried = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two"}]), now);
    expect(carried.locations.find(r => r.uid === "rider-two")).toMatchObject({progressM: 2280, progressSampledAtMs: now - 3000});
    expect(retainWorldPositions(carried, server).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2400, gapToLeaderM: 70, progressSampledAtMs: now - 1000});
    // 콜러블이 더 최신이면 콜러블 값 전부를 쓴다.
    const newer = {...server, locations: server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now + 1, progressM: 2600, gapToLeaderM: 10} : r)};
    expect(retainWorldPositions(fromWorld, newer).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now + 1, progressM: 2600, gapToLeaderM: 10});
    // 명단에서 빠진 참가자는 월드 값으로 되살리지 않는다.
    const removed = {...server, locations: server.locations.filter(r => r.uid !== "rider-two")};
    expect(retainWorldPositions(fromWorld, removed).locations.some(r => r.uid === "rider-two")).toBe(false);
  });
  it("어느 구독의 응답인지 모르는 프레임의 선택 격차는 쓰지 않는다", () => {
    const base = {...spectatorFixture(now), selectedUid: null};
    const next = applyWorldFrame(base, {...frame([{uid: "rider-two", ...progress(2500, 40, 30)}]), track: null, trackUnknown: true}, now);
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({gapToLeaderM: 40, gapToSelectedM: null});
  });
  it("이전 delta에서 남은 오래된 마커는 커버리지에 세지 않는다", () => {
    const base = spectatorFixture(now);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}, {uid: "rider-two", capturedAt: now - WORLD_MARKER_FRESH_MS - 1, ...progress(1, 0)}]), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one", ...progress(1, 0)}, {uid: "rider-two", capturedAt: now - WORLD_MARKER_FRESH_MS, ...progress(1, 0)}]), now)).toBe(true);
  });
  it("폴백 중 콜러블 병합은 위치만 더 최신 월드 값을 두고 진행·격차는 콜러블 정본을 쓴다", () => {
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now - 1000, progressM: 2400, gapToLeaderM: 300} : r);
    const fromWorld = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", lng: 0, lon: 126.99, ...progress(2500, 40)}]), now);
    expect(retainWorldPositions(fromWorld, server, false).locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.99, sampledAtMs: now, progressM: 2400, gapToLeaderM: 300});
  });
  it("위치가 없던 참가자를 서버 필드 없는 마커로 추가해도 콜러블의 진행·격차를 덮지 않는다", () => {
    const added = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-four"}]), now);
    expect(added.locations.find(r => r.uid === "rider-four")).toMatchObject({progressM: null, progressSampledAtMs: 0});
    const server = {...spectatorFixture(now), locations: [...spectatorFixture(now).locations, {...spectatorFixture(now).locations[1], uid: "rider-four", displayName: "새벽", sampledAtMs: now - 5000, progressM: 1800, gapToLeaderM: 600}]};
    expect(retainWorldPositions(added, server).locations.find(r => r.uid === "rider-four")).toMatchObject({sampledAtMs: now, progressM: 1800, gapToLeaderM: 600});
  });
});
