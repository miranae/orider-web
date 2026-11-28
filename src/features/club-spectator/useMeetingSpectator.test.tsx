import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useSpectatorPreferences } from "./preferences";
import { useMeetingSpectator } from "./useMeetingSpectator";
import { spectatorFixture } from "./fixtures";
const control = vi.hoisted(() => ({request: vi.fn(), signals: [] as {path: string; next: () => void; error: (error: unknown) => void; stop: ReturnType<typeof vi.fn>}[], services: {auth: {currentUser: {uid: "member"} as {uid: string} | null}, functions: {}, firestore: {}, ensureAppCheckReady: vi.fn(async () => {})}}));
import type { useWorldEvent, WorldEventFrame } from "../ride-world/useWorldEvent";
const world = vi.hoisted(() => ({ subscribe: vi.fn<typeof useWorldEvent>(), production: false, spectatorSignals: false }));
vi.mock("../ride-world/useWorldEvent", () => ({
  isLocalWorldEventEnabled: () => true,
  isProductionWorldEventEnabled: () => world.production,
  isProductionWorldSignalEnabled: (topic?: string) => topic === "spectator" && world.spectatorSignals,
  useWorldEvent: world.subscribe,
}));
vi.mock("firebase/firestore", () => ({doc: (_db: unknown, path: string) => path, onSnapshot: vi.fn((path: string, next: () => void, error: (error: unknown) => void) => {const stop = vi.fn(); control.signals.push({path, next, error, stop}); return stop;})}));
vi.mock("firebase/functions", () => ({httpsCallable: vi.fn(() => control.request)}));
vi.mock("../../contexts/FirebaseServicesContext", () => ({useFirebaseServices: () => control.services}));
vi.mock("../../services/errorLogger", () => ({logClientError: vi.fn()}));
const outage = vi.hoisted(() => ({value: null as unknown, active: [] as boolean[]}));
vi.mock("./useMeetingOutage", () => ({useMeetingOutage: (active: boolean) => { outage.active.push(active); return outage.value; }}));
beforeEach(() => { vi.clearAllMocks(); outage.value = null; outage.active = []; world.production = false; world.subscribe.mockReturnValue(null); control.signals = []; control.services.auth.currentUser = {uid: "member"}; Object.defineProperty(document, "hidden", {configurable: true, value: false}); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
beforeEach(() => { world.spectatorSignals = false; });
const data = () => ({...spectatorFixture(Date.now()), groupId: "club", eventId: "meeting"});
describe("회원 관전 조회 경계", () => {
  it("주입된 인증 API로 조회하고 권한 오류 발생 즉시 위치를 지운다", async () => {
    control.request.mockResolvedValueOnce({data: data()}).mockRejectedValueOnce(new Error("permission-denied"));
    const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
    await waitFor(() => expect(result.current.data?.eventId).toBe("meeting"));
    expect(httpsCallable).toHaveBeenCalledWith(control.services.functions, "getClubMeetingSpectator", {timeout: 15000});
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeNull();
  });
  it("계정 전환 뒤 늦은 응답이 이전 회원의 코스와 위치를 노출하지 않는다", async () => {
    let resolve!: (response: unknown) => void;
    control.request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const {result, rerender} = renderHook(({uid}) => useMeetingSpectator("club", "meeting", uid), {initialProps: {uid: "member" as string | undefined}});
    await waitFor(() => expect(control.request).toHaveBeenCalledTimes(1));
    control.services.auth.currentUser = null;
    rerender({uid: undefined});
    await act(async () => resolve({data: data()}));
    expect(result.current.data).toBeNull();
  });
  it("숨김 시 정보를 지우고 복귀 때 이전 요청과 겹치지 않게 최신 요청을 실행한다", async () => {
    let resolve!: (response: unknown) => void;
    control.request.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({data: data()});
    const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
    await waitFor(() => expect(control.request).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, "hidden", {configurable: true, value: true});
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "hidden", {configurable: true, value: false});
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(control.request).toHaveBeenCalledTimes(1);
    await act(async () => resolve({data: {...data(), title: "old"}}));
    await waitFor(() => expect(result.current.data?.title).toBe("저녁 한강 가상라이딩"));
    expect(control.request).toHaveBeenCalledTimes(2);
  });
  it("다른 클럽 응답을 거부한다", async () => {
    control.request.mockResolvedValue({data: {...data(), groupId: "other"}});
    const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeNull();
  });
});

it("주기 조회 없이 변경 신호로 새 값을 읽고 구독 권한 오류에는 이전 위치를 지운다", async () => {
  control.request.mockResolvedValue({data: data()});
  const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(onSnapshot).toHaveBeenCalledTimes(4);
  vi.useFakeTimers();
  for (let i = 0; i < 20; i++) act(() => control.signals.find(s => s.path.endsWith("spectator_signals/latest"))!.next());
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(control.request).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(control.request).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
  act(() => control.signals[0].error(new Error("permission-denied")));
  expect(result.current.data).toBeNull();
  expect(control.signals.every(s => s.stop.mock.calls.length === 1)).toBe(true);
});

it("선택 변경은 서버에 전달하되 기존 목록을 숨기거나 팔로우를 초기화하지 않는다", async () => {
  let finish!: (response: unknown) => void;
  control.request.mockResolvedValueOnce({data: data()}).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const {result, rerender} = renderHook(({selectedUid}) => useMeetingSpectator("club", "meeting", "member", selectedUid), {initialProps: {selectedUid: null as string | null}});
  await waitFor(() => expect(result.current.data).toBeTruthy());
  rerender({selectedUid: "rider-two"});
  await waitFor(() => expect(control.request).toHaveBeenCalledTimes(2));
  expect(result.current.data?.locations).toHaveLength(3);
  expect(control.request).toHaveBeenLastCalledWith({eventId: "meeting", selectedUid: "rider-two"});
  await act(async () => finish({data: {...data(), selectedUid: "rider-two"}}));
  expect(result.current.data?.selectedUid).toBe("rider-two");
});

it("일시 장애는 위치를 지우지 않고 최대 세 번 복구하며 권한 오류는 즉시 차단한다", async () => {
  control.request.mockResolvedValueOnce({data: data()});
  const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  vi.useFakeTimers();
  control.request.mockRejectedValue({code: "functions/unavailable"});
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(result.current.data).toBeTruthy();
  expect(result.current.error).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(7001); });
  expect(control.request).toHaveBeenCalledTimes(5);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(control.request).toHaveBeenCalledTimes(5);
  control.request.mockResolvedValue({data: data()});
  await act(async () => { window.dispatchEvent(new Event("online")); });
  expect(result.current.error).toBeNull();
  act(() => control.signals.at(-1)!.error({code: "permission-denied"}));
  expect(result.current.data).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(control.request).toHaveBeenCalledTimes(6);
});

it("복귀 때 친구 설정만 복원하고 새 회원 확인 실패 시 위치를 표시하지 않는다", async () => {
  localStorage.clear();
  control.request.mockImplementation(async ({selectedUid}: {selectedUid: string | null}) => ({data: {...data(), selectedUid}}));
  const first = renderHook(() => {
    const preferences = useSpectatorPreferences("member", "club", "meeting");
    return {preferences, live: useMeetingSpectator("club", "meeting", "member", preferences.value.selectedUid)};
  });
  await waitFor(() => expect(first.result.current.live.data).toBeTruthy());
  act(() => first.result.current.preferences.update({selectedUid: "rider-two", followed: ["rider-two"], search: "나래", followingOnly: true, mapMode: "rider"}));
  await waitFor(() => expect(first.result.current.live.data?.selectedUid).toBe("rider-two"));
  Object.defineProperty(document, "hidden", {configurable: true, value: true});
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(first.result.current.live.data).toBeNull();
  expect(first.result.current.preferences.value.search).toBe("나래");
  Object.defineProperty(document, "hidden", {configurable: true, value: false});
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() => expect(first.result.current.live.data?.selectedUid).toBe("rider-two"));
  first.unmount();
  control.request.mockRejectedValue({code: "functions/permission-denied"});
  const next = renderHook(() => {
    const preferences = useSpectatorPreferences("member", "club", "meeting");
    return {preferences, live: useMeetingSpectator("club", "meeting", "member", preferences.value.selectedUid)};
  });
  expect(next.result.current.preferences.value.selectedUid).toBe("rider-two");
  expect(next.result.current.live.data).toBeNull();
  await waitFor(() => expect(next.result.current.live.error).toBeTruthy());
  expect(next.result.current.live.data).toBeNull();
});

it("API만 성공하고 변경 구독이 계속 실패해도 자동 복구가 무한 조회가 되지 않는다", async () => {
  control.request.mockResolvedValue({data: data()});
  const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  vi.useFakeTimers();
  for (const delay of [1000, 2000, 4000]) {
    act(() => control.signals.at(-1)!.error({code: "unavailable"}));
    await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
  }
  act(() => control.signals.at(-1)!.error({code: "unavailable"}));
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(control.request).toHaveBeenCalledTimes(4);
});

it("운영 관전 신호 플래그가 켜지면 운영 월드 spectator 토픽을 구독한다(g1-web#4214)", async () => {
  world.spectatorSignals = true;
  control.request.mockResolvedValue({data: data()});
  const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  const socket = world.subscribe.mock.calls.findLast(call => call[4]?.topic === "spectator");
  expect(socket?.[0]).toBe("meeting");
  expect(socket?.[7]).toBe(true);
});

it("관전 신호가 준비돼도 신호 문서를 계속 듣고 권한 철회에 화면을 비운다", async () => {
  vi.stubEnv("VITE_ORIDER_LOCAL_SPECTATOR_REDIS", "1");
  control.request.mockResolvedValue({data: data()});
  const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(control.signals.map(signal => signal.path)).toEqual(["events/meeting", "groups/club", "groups/club/members/member", "events/meeting/spectator_signals/latest"]);
  const socket = world.subscribe.mock.calls.findLast(call => call[4]?.topic === "spectator");
  expect(socket?.[0]).toBe("meeting");
  vi.useFakeTimers();
  control.request.mockResolvedValue({data: {...data(), title: "새 관전 상태"}});
  act(() => socket?.[4]?.changed("1790000000:000000000"));
  // 발행 실패 시 서버가 문서에 대신 쓰므로 문서 리스너를 유지한다(g1-web#4214).
  expect(control.signals.at(-1)?.stop).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(5001));
  expect(result.current.data?.title).toBe("새 관전 상태");
  control.request.mockResolvedValue({data: {...data(), status: "FINISHED"}});
  act(() => socket?.[4]?.disconnected(4003));
  expect(result.current.data).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(5001));
  expect(result.current.data?.status).toBe("FINISHED");
  control.request.mockRejectedValue({code: "permission-denied"});
  act(() => socket?.[4]?.disconnected(4003));
  expect(result.current.data).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(5001));
  expect(result.current.error).toEqual({code: "permission-denied"});
});

const worldFrame = (riding = 1, capturedAt = Date.now()) => ({v: 1 as const, type: "event_snapshot" as const, eventId: "meeting", revision: 1, updatedAt: capturedAt, viewers: 1,
  counts: {riding, total: riding}, roster: [], markers: [{id: "m1", uid: "rider-two", kind: "virtual" as const, lat: 37.525, lon: 126.98, status: "riding" as const, capturedAt}]});
const fullWorld = (calls: Parameters<typeof useWorldEvent>[]) => calls.filter(call => call[4] === undefined);
const locationSignals = () => control.signals.filter(s => s.path.endsWith("spectator_signals/latest"));

it("운영 월드 플래그가 꺼져 있으면 월드 위치를 적용하지 않고 기존 신호 조회를 유지한다", async () => {
  control.request.mockResolvedValue({data: data()});
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(fullWorld(world.subscribe.mock.calls).every(call => call[7] === false)).toBe(true);
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : worldFrame());
  rerender();
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")?.lng).toBe(126.967);
  expect(locationSignals()).toHaveLength(1);
  expect(locationSignals()[0].stop).not.toHaveBeenCalled();
});

it("서버 진행 필드가 없는 운영 월드 프레임은 위치를 덮어쓰고 커버로 판정하여 위치 신호를 쉬며, 프레임이 멈추거나 끊겨도 콜러블로 지도와 격차를 갱신한다", async () => {
  world.production = true;
  control.request.mockResolvedValue({data: data()});
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(fullWorld(world.subscribe.mock.calls).at(-1)?.[7]).toBe(true);
  vi.useFakeTimers();
  let frame: ReturnType<typeof worldFrame> | null = worldFrame();
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender();
  // 위치는 바로 반영하고 서버 진행·격차는 지우지 않는다. 주행자가 있으면 커버로 판정해 위치 신호를 쉰다.
  // 출처 단일화: 월드로 전환하면 콜러블 진행·격차를 지운다. 서버 진행 필드가 없는 프레임은 진행·격차를 채우지 않는다.
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, progressM: null, gapToLeaderM: null});
  expect(result.current.data?.locations.find(r => r.uid === "rider-one")?.gapToLeaderM).toBeNull();
  expect(openLocationSignals()).toHaveLength(0);
  // 프레임이 멈추면 콜러블이 단독 출처이므로 콜러블의 위치·격차를 그대로 반영한다.
  const older = data();
  older.locations = older.locations.map(r => r.uid === "rider-two" ? {...r, gapToLeaderM: 80} : r);
  control.request.mockResolvedValue({data: older});
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  act(() => openLocationSignals()[0].next());
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(control.request).toHaveBeenCalledTimes(2);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({gapToLeaderM: 80});
  // 서버가 더 최신 위치·진행을 주면 멈춘 프레임 대신 그 값으로 지도를 갱신한다.
  const fresh = data();
  fresh.locations = fresh.locations.map(r => r.uid === "rider-two" ? {...r, lng: 126.99, sampledAtMs: Date.now(), progressM: 2500, gapToLeaderM: 50} : r);
  control.request.mockResolvedValue({data: fresh});
  act(() => locationSignals()[0].next());
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(control.request).toHaveBeenCalledTimes(3);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.99, progressM: 2500, gapToLeaderM: 50});
  // 연결이 끊겨도 열린 위치 신호 구독을 그대로 유지한다.
  frame = null;
  rerender();
  expect(openLocationSignals()).toHaveLength(1);
});

const serverMarker = (uid: string, capturedAt: number, progressM: number, gapToLeaderM: number) => ({id: uid, uid, kind: "virtual" as const, lat: 37.525, lon: 126.98,
  status: "riding" as const, capturedAt, progressM, gapToLeaderM, leaderGapExpiresAtMs: capturedAt + 30000, gapToSelectedM: null, selectedGapExpiresAtMs: null});
const serverFrame = (revision: number, capturedAt = Date.now(), riding = 3, markers = [serverMarker("rider-one", capturedAt, 2600, 0), serverMarker("rider-two", capturedAt, 2500, 100), serverMarker("rider-three", capturedAt, 2000, 600)]) =>
  ({v: 1 as const, type: "event_snapshot" as const, eventId: "meeting", revision, updatedAt: capturedAt, viewers: 1, counts: {riding, total: riding}, roster: [], markers});
const openLocationSignals = () => locationSignals().filter(s => s.stop.mock.calls.length === 0);

it("완전한 서버 진행 프레임 동안 위치 신호를 쉬고, 프레임이 멈추면 다시 열어 콜러블로 따라잡은 뒤 재전환한다", async () => {
  world.production = true;
  control.request.mockImplementation(async () => ({data: data()}));
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  vi.useFakeTimers();
  let frame = serverFrame(1);
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender();
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, progressM: 2500, gapToLeaderM: 100});
  expect(openLocationSignals()).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  // 새 프레임이 계속 오면 신호·콜러블 없이 서버 격차만 갱신한다.
  frame = serverFrame(2, Date.now(), 3, [serverMarker("rider-one", Date.now(), 2700, 0), serverMarker("rider-two", Date.now(), 2550, 150), serverMarker("rider-three", Date.now(), 2100, 600)]);
  rerender();
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(control.request).toHaveBeenCalledTimes(1);
  expect(openLocationSignals()).toHaveLength(0);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")?.gapToLeaderM).toBe(150);
  // 연결은 그대로인데 프레임만 멈추면 제한 시간 뒤 위치 신호를 다시 열고 콜러블로 따라잡는다.
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  expect(openLocationSignals()).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(control.request).toHaveBeenCalledTimes(2);
  // 프레임이 다시 오면 위치 신호를 다시 쉰다.
  frame = serverFrame(3);
  rerender();
  expect(openLocationSignals()).toHaveLength(0);
  // 신호를 쉬는 동안 명단 상태가 바뀌면(완주 등) 콜러블로 한 번 다시 확인한다.
  frame = {...serverFrame(4), roster: [{uid: "rider-one", state: "finished"}]};
  rerender();
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(control.request).toHaveBeenCalledTimes(3);
  expect(openLocationSignals()).toHaveLength(0);
  // 명단·권한 신호는 계속 구독하며 권한 철회 시 화면을 비운다.
  control.request.mockRejectedValue({code: "functions/permission-denied"});
  act(() => control.signals.find(s => s.path === "groups/club/members/member")!.next());
  expect(result.current.data).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(result.current.error).toEqual({code: "functions/permission-denied"});
  expect(result.current.data).toBeNull();
});

it("월드 프레임 없을 때 위치 신호를 유지하고, 서버 진행 필드 없는 프레임도 주행자가 있으면 커버로 판정해 신호를 쉰다", async () => {
  world.production = true;
  control.request.mockResolvedValue({data: data()});
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  // world=null: 미커버 → 위치 신호 유지.
  world.subscribe.mockImplementation(() => null);
  rerender();
  expect(openLocationSignals()).toHaveLength(1);
  // 서버 진행 필드 없는 월드 프레임도 주행자가 있으면 커버 → 위치 신호 쉼.
  const frame: ReturnType<typeof worldFrame> = worldFrame(1);
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender();
  expect(openLocationSignals()).toHaveLength(0);
  expect(locationSignals().length).toBeGreaterThanOrEqual(1);
});

it("월드 연결이 끊기면 위치 신호를 다시 열고 바로 콜러블로 따라잡는다", async () => {
  world.production = true;
  control.request.mockResolvedValue({data: data()});
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  vi.useFakeTimers();
  let frame: ReturnType<typeof serverFrame> | null = serverFrame(1);
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender();
  expect(openLocationSignals()).toHaveLength(0);
  frame = null;
  rerender();
  expect(openLocationSignals()).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(control.request).toHaveBeenCalledTimes(2);
});

it("선택 참가자를 바꾸면 월드 구독의 track도 바꾼다", async () => {
  world.production = true;
  control.request.mockImplementation(async ({selectedUid}: {selectedUid: string | null}) => ({data: {...data(), selectedUid}}));
  const {result, rerender} = renderHook(({selectedUid}) => useMeetingSpectator("club", "meeting", "member", selectedUid), {initialProps: {selectedUid: null as string | null}});
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(fullWorld(world.subscribe.mock.calls).at(-1)?.[2]).toBeNull();
  rerender({selectedUid: "rider-two"});
  expect(fullWorld(world.subscribe.mock.calls).at(-1)?.[2]).toBe("rider-two");
});

it("시청자 수만 바뀌는 delta가 계속 와도 새 위치 표본이 없으면 제한 시간 뒤 위치 신호로 복귀한다", async () => {
  world.production = true;
  control.request.mockImplementation(async () => ({data: data()}));
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  vi.useFakeTimers();
  const base = serverFrame(1);
  let frame = base;
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender();
  expect(openLocationSignals()).toHaveLength(0);
  for (let i = 2; i <= 6; i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    frame = {...base, revision: i, viewers: i};
    rerender();
  }
  expect(openLocationSignals()).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(control.request).toHaveBeenCalledTimes(2);
});

it("월드가 끊긴 폴백 중에는 콜러블이 준 새 격차를 위치 표본이 더 일러도 반영한다", async () => {
  world.production = true;
  control.request.mockImplementation(async () => ({data: data()}));
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  vi.useFakeTimers();
  let frame: ReturnType<typeof serverFrame> | null = serverFrame(1);
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender();
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")?.gapToLeaderM).toBe(100);
  control.request.mockImplementation(async () => {
    const next = data();
    next.locations = next.locations.map(r => r.uid === "rider-two" ? {...r, sampledAtMs: Date.now() - 10000, gapToLeaderM: 20, progressM: 2580} : r);
    return {data: next};
  });
  frame = null;
  rerender();
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(control.request).toHaveBeenCalledTimes(2);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({gapToLeaderM: 20, progressM: 2580});
});

it("선택 대상이 있으면 선택 기준이 확인된 현재 선택 프레임일 때만 위치 신호를 쉬고 선택 격차를 반영한다", async () => {
  world.production = true;
  control.request.mockImplementation(async ({selectedUid}: {selectedUid: string | null}) => ({data: {...data(), selectedUid}}));
  const {result, rerender} = renderHook(({selectedUid}) => useMeetingSpectator("club", "meeting", "member", selectedUid), {initialProps: {selectedUid: "rider-one" as string | null}});
  await waitFor(() => expect(result.current.data?.selectedUid).toBe("rider-one"));
  const withSelected = (frame: ReturnType<typeof serverFrame>): WorldEventFrame => ({...frame, markers: frame.markers.map(m => m.uid === "rider-two" ? {...m, gapToSelectedM: 100, selectedGapExpiresAtMs: m.capturedAt + 20000} : m)});
  let frame: WorldEventFrame = {...withSelected(serverFrame(1)), track: null, trackUnknown: true};
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender({selectedUid: "rider-one"});
  // 기준을 모르는 프레임: 월드를 적용하지 않으므로 콜러블 진행·격차 유지, 위치 신호 유지.
  expect(openLocationSignals()).toHaveLength(1);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({progressM: 2280, gapToSelectedM: null});
  // 다른 선택 기준 프레임도 커버하지 않는다.
  frame = {...withSelected(serverFrame(2)), track: "rider-three"};
  rerender({selectedUid: "rider-one"});
  expect(openLocationSignals()).toHaveLength(1);
  // 현재 선택 기준이 확인되면 커버로 바뀌며 같은 표본의 월드 진행·격차로 즉시 덮는다.
  frame = {...withSelected(serverFrame(3, frame.markers[0]!.capturedAt)), track: "rider-one"};
  rerender({selectedUid: "rider-one"});
  expect(openLocationSignals()).toHaveLength(0);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({progressM: 2500, gapToLeaderM: 100, gapToSelectedM: 100});
});

it("부분 프레임도 주행자가 있으면 커버로 판정하여 위치 신호를 쉬고 진행·격차를 반영한다", async () => {
  world.production = true;
  control.request.mockImplementation(async () => ({data: data()}));
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  const capturedAt = Date.now();
  const full = serverFrame(1, capturedAt);
  // rider-three 마커 없는 부분 프레임: 주행자가 있으므로 커버 → 위치 신호 쉼, 서버 진행 반영.
  let frame = {...full, markers: full.markers.filter(m => m.uid !== "rider-three")};
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender();
  expect(openLocationSignals()).toHaveLength(0);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, sampledAtMs: capturedAt, progressM: 2500, gapToLeaderM: 100});
  frame = {...full, revision: 2};
  rerender();
  expect(openLocationSignals()).toHaveLength(0);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({sampledAtMs: capturedAt, progressM: 2500, gapToLeaderM: 100});
});

it("커버 중 콜러블 응답이 오면 월드 위치·진행이 유지된다(retainWorldPositions worldHealthy=true)", async () => {
  world.production = true;
  control.request.mockImplementation(async () => ({data: data()}));
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  vi.useFakeTimers();
  const capturedAt = Date.now();
  const frame = serverFrame(1, capturedAt);
  world.subscribe.mockImplementation((_e, _u, _t, _v, signal) => signal ? null : frame);
  rerender();
  expect(openLocationSignals()).toHaveLength(0);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, progressM: 2500, gapToLeaderM: 100});
  // 커버 중 콜러블이 갱신돼도 비완주 참가자의 월드 위치·진행이 유지된다.
  control.request.mockImplementation(async () => {
    const next = data();
    next.locations = next.locations.map(r => r.uid === "rider-two" ? {...r, progressM: 2400, gapToLeaderM: 300} : r);
    return {data: next};
  });
  await act(async () => { window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(100); });
  expect(control.request).toHaveBeenCalledTimes(2);
  expect(openLocationSignals()).toHaveLength(0);
  expect(result.current.data?.locations.find(r => r.uid === "rider-two")).toMatchObject({lng: 126.98, progressM: 2500, gapToLeaderM: 100});
});

it("월드 프레임이 없는 LIVE 운영 관전에서만 장애 폴백을 켜고, 장애 회차 좌표로 위치만 덮는다 (#4215)", async () => {
  world.production = true;
  control.request.mockResolvedValue({data: {...data(), locations: []}});
  const {result, rerender} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data?.status).toBe("LIVE"));
  expect(outage.active.at(-1)).toBe(true);
  const fallback = {...data(), serverNowMs: 123, title: "장애 응답 제목"};
  outage.value = {scope: "member/club/meeting", episode: "ep-1", data: fallback, receivedAt: 456};
  rerender();
  expect(result.current.data?.locations.map(r => r.uid)).toEqual(fallback.locations.map(r => r.uid));
  expect(result.current.data?.title).toBe("저녁 한강 가상라이딩");
  expect(result.current.data?.serverNowMs).toBe(123);
  expect(result.current.receivedAt).toBe(456);
  world.production = false;
  rerender();
  expect(outage.active.at(-1)).toBe(false);
});
