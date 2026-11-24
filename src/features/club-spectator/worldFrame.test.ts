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
  // 명단의 주행(RIDING) 참가자 전원(rider-one·two·three)에게 신선한 서버 진행 마커가 있는 프레임.
  const riders = (overrides: Record<string, Partial<WorldEventMarker>> = {}) => ["rider-one", "rider-two", "rider-three"]
    .map(uid => ({uid, ...progress(1, 0), ...overrides[uid]}));
  it("마커의 서버 진행·격차·만료를 다시 계산하지 않고 그대로 반영하며 null도 그대로 옮긴다", () => {
    const next = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", ...progress(2500, 40)}, {uid: "rider-one", ...progress(null, null)}]), now);
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2500, gapToLeaderM: 40, leaderGapExpiresAtMs: now + 25000});
    expect(next.locations.find(r => r.uid === "rider-one")).toMatchObject({progressM: null, gapToLeaderM: null, leaderGapExpiresAtMs: null});
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
  it("커버 중 표본 시각이 같은 마커가 다시 오면(선두 이동) 위치는 두고 서버의 최신 격차를 그대로 쓴다", () => {
    const first = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", lat: 37.525, lon: 126.98, ...progress(2500, 40)}]), now);
    const moved = applyWorldFrame(first, frame([{uid: "rider-two", lat: 1, lon: 1, ...progress(2500, 90)}]), now);
    expect(moved.locations.find(r => r.uid === "rider-two")).toMatchObject({lat: 37.525, gapToLeaderM: 90});
    expect(applyWorldFrame(moved, frame([{uid: "rider-two", ...progress(2500, 90)}]), now)).toBe(moved);
    // 화면 위치보다 오래된 표본은 위치도 진행도 되돌리지 않는다.
    expect(applyWorldFrame(moved, frame([{uid: "rider-two", capturedAt: now - 1, ...progress(1, 1)}]), now)).toBe(moved);
  });
  it("커버는 명단의 주행 참가자 전원이 신선한 서버 진행 마커를 가질 때만이고 마커 개수는 보지 않는다", () => {
    const base = spectatorFixture(now);
    expect(worldFrameCoversRiders(base, frame(riders()), now)).toBe(true);
    // counts.riding은 보지 않는다(서버 집계와 명단이 달라도 uid 집합으로 판정).
    expect(worldFrameCoversRiders(base, frame(riders(), 0), now)).toBe(true);
    expect(worldFrameCoversRiders(base, frame(riders(), 9), now)).toBe(true);
    // 주행 참가자 한 명(rider-three)이 빠지면 다른 계정 마커 수가 많아도 미커버.
    const withoutThree = riders().filter(m => m.uid !== "rider-three");
    expect(worldFrameCoversRiders(base, frame(withoutThree), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([...withoutThree, {uid: "rider-four", ...progress(1, 0)}]), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([...withoutThree, {uid: "rider-one", ...progress(1, 0)}]), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([...withoutThree, {uid: "stranger", ...progress(1, 0)}]), now)).toBe(false);
    // 서버 필드 없음·미래 표본·잘못된 값·오래된 표본인 주행 참가자 마커는 커버하지 못한다.
    for (const bad of [{gapToLeaderM: undefined}, {capturedAt: now + 5000}, {...progress(1, -5)}, {capturedAt: now - WORLD_MARKER_FRESH_MS - 1}]) {
      expect(worldFrameCoversRiders(base, frame(riders({"rider-three": bad})), now)).toBe(false);
    }
    expect(worldFrameCoversRiders(base, frame(riders({"rider-three": {capturedAt: now - WORLD_MARKER_FRESH_MS}})), now)).toBe(true);
    // 주행이 아닌 참가자(rider-four: REGISTERED, 완주·DNF 등)는 기여하지도 막지도 않는다.
    const finished = {...base, participants: base.participants!.map(p => p.uid === "rider-three" ? {...p, status: "FINISHED"} : p)};
    expect(worldFrameCoversRiders(finished, frame(withoutThree), now)).toBe(true);
    // 주행 0명·명단 없음·스냅숏 없음은 미커버.
    const nobody = {...base, participants: base.participants!.map(p => ({...p, status: "FINISHED"}))};
    expect(worldFrameCoversRiders(nobody, frame(riders()), now)).toBe(false);
    expect(worldFrameCoversRiders({...base, participants: undefined}, frame(riders()), now)).toBe(false);
    expect(worldFrameCoversRiders(null, frame(riders()), now)).toBe(false);
  });
  it("월드 명단에 콜러블이 모르는 참가자나 아직 주행으로 보지 않는 주행자가 있으면 미커버로 두어 명단을 따라잡는다", () => {
    const base = spectatorFixture(now);
    const ridingRoster = ["rider-one", "rider-two", "rider-three"].map(uid => ({uid, state: "RIDING"}));
    expect(worldFrameCoversRiders(base, {...frame(riders()), roster: ridingRoster}, now)).toBe(true);
    // 콜러블 조회 직후 합류한 참가자: 월드 명단에만 있다.
    expect(worldFrameCoversRiders(base, {...frame(riders()), roster: [...ridingRoster, {uid: "joined", state: "RIDING"}]}, now)).toBe(false);
    // 콜러블 명단에서 아직 REGISTERED인 rider-four가 월드에서는 주행 중이다.
    expect(worldFrameCoversRiders(base, {...frame(riders()), roster: [...ridingRoster, {uid: "rider-four", state: "RIDING"}]}, now)).toBe(false);
    // 비주행 상태(lost_signal 등)인 알려진 참가자는 막지 않는다.
    expect(worldFrameCoversRiders(base, {...frame(riders()), roster: [...ridingRoster, {uid: "rider-four", state: "lost_signal"}]}, now)).toBe(true);
  });
  it("선택 대상이 있으면 선택 기준이 확인된 현재 선택 프레임일 때만 커버한다", () => {
    const base = {...spectatorFixture(now), selectedUid: "rider-one"};
    expect(worldFrameCoversRiders(base, {...frame(riders()), track: "rider-one"}, now, "rider-one")).toBe(true);
    expect(worldFrameCoversRiders(base, {...frame(riders()), track: null, trackUnknown: true}, now, "rider-one")).toBe(false);
    expect(worldFrameCoversRiders(base, {...frame(riders()), track: "rider-two"}, now, "rider-one")).toBe(false);
    expect(worldFrameCoversRiders(base, frame(riders()), now, "rider-one")).toBe(false);
    // 화면 데이터가 아직 이전 선택이면(콜러블 대기) 미커버.
    expect(worldFrameCoversRiders(base, {...frame(riders()), track: "rider-two"}, now, "rider-two")).toBe(false);
    // 선택이 없으면 선택 기준을 요구하지 않는다.
    expect(worldFrameCoversRiders(spectatorFixture(now), {...frame(riders()), track: null, trackUnknown: true}, now, null)).toBe(true);
  });
  it("콜러블 병합: 커버 중에는 주행 참가자의 월드 진행·격차를 남기고, 위치가 더 최신인 콜러블은 그 값을 모두 쓴다", () => {
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now - 1000, progressM: 2400, gapToLeaderM: 70} : r);
    const fromWorld = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", ...progress(2500, 40)}]), now);
    expect(retainWorldPositions(fromWorld, server, true).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2500, gapToLeaderM: 40});
    // 같은 표본이어도 커버 중에는 월드 값을 쓴다.
    const same = {...server, locations: server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now} : r)};
    expect(retainWorldPositions(fromWorld, same, true).locations.find(r => r.uid === "rider-two")).toMatchObject({progressM: 2500, gapToLeaderM: 40});
    const newer = {...server, locations: server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now + 1, progressM: 2600, gapToLeaderM: 10} : r)};
    expect(retainWorldPositions(fromWorld, newer, true).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now + 1, progressM: 2600, gapToLeaderM: 10});
    // 새 명단에서 주행이 아니게 된(완주) 참가자는 콜러블 진행·격차를 쓴다.
    const done = {...server, participants: server.participants!.map(p => p.uid === "rider-two" ? {...p, status: "FINISHED"} : p),
      locations: server.locations.map(r => r.uid === "rider-two" ? {...r, status: "FINISHED" as const} : r)};
    expect(retainWorldPositions(fromWorld, done, true).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, status: "FINISHED", progressM: 2400, gapToLeaderM: 70});
    // 명단에서 빠진 참가자는 월드 값으로 되살리지 않는다.
    const removed = {...server, locations: server.locations.filter(r => r.uid !== "rider-two")};
    expect(retainWorldPositions(fromWorld, removed, true).locations.some(r => r.uid === "rider-two")).toBe(false);
  });
  it("어느 구독의 응답인지 모르는 프레임의 선택 격차는 쓰지 않는다", () => {
    const base = {...spectatorFixture(now), selectedUid: null};
    const next = applyWorldFrame(base, {...frame([{uid: "rider-two", ...progress(2500, 40, 30)}]), track: null, trackUnknown: true}, now);
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({gapToLeaderM: 40, gapToSelectedM: null});
  });
  it("폴백 중 콜러블 병합은 위치만 더 최신 월드 값을 두고 진행·격차는 콜러블 정본을 쓴다", () => {
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now - 1000, progressM: 2400, gapToLeaderM: 300} : r);
    const fromWorld = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", lon: 126.99, ...progress(2500, 40)}]), now);
    expect(retainWorldPositions(fromWorld, server, false).locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.99, sampledAtMs: now, progressM: 2400, gapToLeaderM: 300});
  });
  it("폴백 중에는 같은 마커가 다시 와도 콜러블 진행·격차를 두고, 커버로 바뀌면 같은 표본의 월드 값으로 즉시 덮는다(#1865)", () => {
    const stale = frame([{uid: "rider-two", lat: 37.525, lon: 126.98, ...progress(2500, 40)}]);
    const fromWorld = applyWorldFrame(spectatorFixture(now), stale, now, false);
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now - 1000, progressM: 2400, gapToLeaderM: 300} : r);
    const merged = retainWorldPositions(fromWorld, server, false);
    expect(merged.locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2400, gapToLeaderM: 300});
    // 호출부처럼 delta를 병합한 snapshot 프레임(시청자 수만 바뀜)이 다시 와도 폴백 중에는 진행·격차를 바꾸지 않는다.
    const viewersOnly: WorldEventFrame = {...stale, revision: 2, viewers: 3};
    expect(applyWorldFrame(merged, viewersOnly, now + 5000, false)).toBe(merged);
    // 커버로 바뀌면 같은 표본이어도 서버의 진행·격차를 바로 쓴다(다음 표본을 기다리지 않음).
    expect(applyWorldFrame(merged, viewersOnly, now + 5000, true).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2500, gapToLeaderM: 40});
    // 더 최신 표본은 폴백 중에도 위치만 옮긴다.
    const fresh = applyWorldFrame(merged, frame([{uid: "rider-two", capturedAt: now + 1000, lon: 127, ...progress(2550, 20)}]), now + 5000, false);
    expect(fresh.locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now + 1000, lng: 127, progressM: 2400, gapToLeaderM: 300});
  });
  it("커버 중이어도 주행 중이 아닌 참가자의 마커는 위치만 옮기고 진행·격차는 콜러블 값을 둔다", () => {
    const base = spectatorFixture(now);
    const ended = {...base, participants: base.participants!.map(p => p.uid === "rider-two" ? {...p, status: "FINISHED"} : p)};
    const next = applyWorldFrame(ended, frame([{uid: "rider-two", lon: 126.98, ...progress(2500, 40)}]), now, true);
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, progressM: 2280, gapToLeaderM: 120});
  });
  it("폴백(월드 미커버) 중에는 월드 마커가 위치만 옮기고 진행·격차는 덮지 않는다", () => {
    const base = spectatorFixture(now);
    const next = applyWorldFrame(base, frame([{uid: "rider-two", lat: 37.525, lon: 126.98, ...progress(2500, 40, 30)}]), now, false);
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, sampledAtMs: now, progressM: 2280, gapToLeaderM: 120});
    // 같은 표본이 선두 이동으로 다시 와도 폴백 중에는 격차를 바꾸지 않는다.
    const first = applyWorldFrame(base, frame([{uid: "rider-two", ...progress(2500, 40)}]), now);
    expect(applyWorldFrame(first, frame([{uid: "rider-two", ...progress(2500, 90)}]), now, false)).toBe(first);
  });
  it("위치가 없던 참가자를 서버 필드 없는 마커로 추가해도 콜러블의 진행·격차를 덮지 않는다", () => {
    const added = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-four"}]), now);
    expect(added.locations.find(r => r.uid === "rider-four")).toMatchObject({progressM: null});
    const server = {...spectatorFixture(now), locations: [...spectatorFixture(now).locations, {...spectatorFixture(now).locations[1]!, uid: "rider-four", displayName: "새벽", sampledAtMs: now - 5000, progressM: 1800, gapToLeaderM: 600}]};
    expect(retainWorldPositions(added, server).locations.find(r => r.uid === "rider-four")).toMatchObject({sampledAtMs: now, progressM: 1800, gapToLeaderM: 600});
  });
});
