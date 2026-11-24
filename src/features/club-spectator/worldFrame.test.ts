import { describe, expect, it } from "vitest";
import type { WorldEventFrame, WorldEventMarker } from "../ride-world/useWorldEvent";
import { spectatorFixture } from "./fixtures";
import { liveRiders } from "./presentation";
import { applyWorldFrame, retainWorldPositions, worldFrameCoversRiders } from "./worldFrame";

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
  it("장애 시 콜러블 결과를 그대로 쓰고, 정상 중에는 완주·DNF를 제외한 위치·진행·격차를 월드 값으로 유지한다", () => {
    const shown = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", lat: 37.525, lon: 126.98, status: "paused"}]), now);
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, progressM: 2350, gapToLeaderM: 60} : r);
    // 장애(worldHealthy=false): 콜러블 값 그대로.
    const faulted = retainWorldPositions(shown, server, false);
    expect(faulted.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.967, sampledAtMs: now - 3000, progressM: 2350, gapToLeaderM: 60});
    // 정상(worldHealthy=true): 비완주 참가자는 월드 위치·진행·격차 유지.
    const healthy = retainWorldPositions(shown, server, true);
    expect(healthy.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, sampledAtMs: now, status: "STOPPED", progressM: 2280, gapToLeaderM: 120});
    // 완주는 콜러블이 최종 권한.
    const finished = {...server, locations: server.locations.map(r => r.uid === "rider-two" ? {...r, status: "FINISHED" as const} : r)};
    expect(retainWorldPositions(shown, finished, true).locations.find(r => r.uid === "rider-two")?.status).toBe("FINISHED");
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
  it("커버는 명단의 주행 참가자가 1명 이상이고 이벤트 ID가 일치하면 성립한다", () => {
    const base = spectatorFixture(now);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one"}]), now)).toBe(true);
    // 주행 중 참가자 마커가 프레임에 1개 이상 있어야 커버로 판정한다(마커 없으면 콜러블로 따라잡는다).
    expect(worldFrameCoversRiders(base, frame([], 0), now)).toBe(false);
    expect(worldFrameCoversRiders(base, frame([], 9), now)).toBe(false);
    // 마커 신선도·서버 진행 필드 유무는 커버 판정에 영향 없다.
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-two", capturedAt: now - 10000}]), now)).toBe(true);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-two"}]), now)).toBe(true);
    // 주행이 아닌 참가자(rider-four: REGISTERED)는 기여하지도 막지도 않는다.
    const finished = {...base, participants: base.participants!.map(p => p.uid === "rider-three" ? {...p, status: "FINISHED"} : p)};
    expect(worldFrameCoversRiders(finished, frame([{uid: "rider-one"}]), now)).toBe(true);
    // 주행 0명·명단 없음·스냅숏 없음은 미커버.
    const nobody = {...base, participants: base.participants!.map(p => ({...p, status: "FINISHED"}))};
    expect(worldFrameCoversRiders(nobody, frame([{uid: "rider-one"}]), now)).toBe(false);
    expect(worldFrameCoversRiders({...base, participants: undefined}, frame([{uid: "rider-one"}]), now)).toBe(false);
    expect(worldFrameCoversRiders(null, frame([{uid: "rider-one"}]), now)).toBe(false);
    // 이벤트 ID가 다르면 미커버.
    expect(worldFrameCoversRiders(base, {...frame([{uid: "rider-one"}]), eventId: "other"}, now)).toBe(false);
    // 코스가 없으면 미커버.
    expect(worldFrameCoversRiders({...base, course: null}, frame([{uid: "rider-one"}]), now)).toBe(false);
  });
  it("선택 대상이 있으면 선택 기준이 확인된 현재 선택 프레임일 때만 커버한다", () => {
    const base = {...spectatorFixture(now), selectedUid: "rider-one"};
    expect(worldFrameCoversRiders(base, {...frame([{uid: "rider-one"}]), track: "rider-one"}, now, "rider-one")).toBe(true);
    expect(worldFrameCoversRiders(base, {...frame([{uid: "rider-one"}]), track: null, trackUnknown: true}, now, "rider-one")).toBe(false);
    expect(worldFrameCoversRiders(base, {...frame([{uid: "rider-one"}]), track: "rider-two"}, now, "rider-one")).toBe(false);
    expect(worldFrameCoversRiders(base, frame([{uid: "rider-one"}]), now, "rider-one")).toBe(false);
    // 화면 데이터가 아직 이전 선택이면(콜러블 대기) 미커버.
    expect(worldFrameCoversRiders(base, {...frame([{uid: "rider-one"}]), track: "rider-two"}, now, "rider-two")).toBe(false);
    // 선택이 없으면 선택 기준을 요구하지 않는다.
    expect(worldFrameCoversRiders(spectatorFixture(now), {...frame([{uid: "rider-one"}]), track: null, trackUnknown: true}, now, null)).toBe(true);
  });
  it("정상 중 콜러블 응답이 와도 비완주 참가자의 진행·격차는 월드 값이 유지된다", () => {
    const fromWorld = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", ...progress(2500, 40)}]), now);
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now - 1000, progressM: 2400, gapToLeaderM: 70} : r);
    // worldHealthy=true: 월드 위치·진행·격차 유지.
    expect(retainWorldPositions(fromWorld, server, true).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2500, gapToLeaderM: 40});
    // worldHealthy=true여도 완주·DNF는 콜러블이 최종 권한.
    const done = {...server, locations: server.locations.map(r => r.uid === "rider-two" ? {...r, status: "FINISHED" as const, progressM: 2400, gapToLeaderM: 70} : r)};
    expect(retainWorldPositions(fromWorld, done, true).locations.find(r => r.uid === "rider-two")).toMatchObject({status: "FINISHED", progressM: 2400, gapToLeaderM: 70});
    // 콜러블 표본이 더 최신이어도 정상 중에는 섞지 않는다(출처 단일화 결정).
    const newer = {...server, locations: server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now + 5000, progressM: 2600, gapToLeaderM: 10} : r)};
    expect(retainWorldPositions(fromWorld, newer, true).locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: now, progressM: 2500, gapToLeaderM: 40});
    // 명단에서 빠진 참가자는 월드 값으로 되살리지 않는다.
    const removed = {...server, locations: server.locations.filter(r => r.uid !== "rider-two")};
    expect(retainWorldPositions(fromWorld, removed, true).locations.some(r => r.uid === "rider-two")).toBe(false);
  });
  it("장애 시 콜러블 값을 전체 그대로 쓴다", () => {
    const fromWorld = applyWorldFrame(spectatorFixture(now), frame([{uid: "rider-two", lon: 126.99, ...progress(2500, 40)}]), now);
    const server = spectatorFixture(now);
    server.locations = server.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: now - 1000, progressM: 2400, gapToLeaderM: 300} : r);
    // worldHealthy=false: 콜러블 값 전체 그대로.
    expect(retainWorldPositions(fromWorld, server, false).locations.find(r => r.uid === "rider-two"))
      .toMatchObject({lng: 126.967, sampledAtMs: now - 1000, progressM: 2400, gapToLeaderM: 300});
    // 이전 스냅숏 없으면 콜러블 그대로.
    expect(retainWorldPositions(null, server, false)).toBe(server);
  });
  it("정상 중 마커가 없는 주행자는 null 진행·격차를 유지하고 콜러블로 채우지 않는다", () => {
    // rider-four는 명단에 있지만 월드 프레임에 마커가 없다.
    const base = spectatorFixture(now);
    const withFour = {...base, participants: base.participants!.map(p => p.uid === "rider-four" ? {...p, status: "RIDING"} : p)};
    // 마커 없이 추가된 참가자는 progressM: null.
    const fromWorld = applyWorldFrame(withFour, frame([{uid: "rider-four"}]), now);
    expect(fromWorld.locations.find(r => r.uid === "rider-four")).toMatchObject({progressM: null});
    // worldHealthy=true여도 콜러블 진행으로 채우지 않는다(월드 값=null 유지).
    const server = {...withFour, locations: [...withFour.locations, {...withFour.locations[0]!, uid: "rider-four", displayName: "새벽", sampledAtMs: now - 5000, progressM: 1800, gapToLeaderM: 600}]};
    expect(retainWorldPositions(fromWorld, server, true).locations.find(r => r.uid === "rider-four")).toMatchObject({sampledAtMs: now, progressM: null, gapToLeaderM: null});
    // worldHealthy=false면 콜러블 값 그대로.
    expect(retainWorldPositions(fromWorld, server, false).locations.find(r => r.uid === "rider-four")).toMatchObject({sampledAtMs: now - 5000, progressM: 1800, gapToLeaderM: 600});
  });
  it("어느 구독의 응답인지 모르는 프레임의 선택 격차는 쓰지 않는다", () => {
    const base = {...spectatorFixture(now), selectedUid: null};
    const next = applyWorldFrame(base, {...frame([{uid: "rider-two", ...progress(2500, 40, 30)}]), track: null, trackUnknown: true}, now);
    expect(next.locations.find(r => r.uid === "rider-two")).toMatchObject({gapToLeaderM: 40, gapToSelectedM: null});
  });
});
