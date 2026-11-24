import { act, renderHook, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { isProductionWorldEventEnabled, TRACK_RETRY_LIMIT, TRACK_RETRY_MS, useWorldEvent } from "./useWorldEvent";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import { logClientError } from "../../services/errorLogger";

const control = vi.hoisted(() => ({
  services: { getAppCheckToken: vi.fn(async (_force?: boolean) => "app-check" as string | null) },
}));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => control.services }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("./worldReadiness", () => ({ watchWorldReadiness: (_url: string, listener: (ready: boolean) => void) => { listener(true); return () => {}; } }));

class FakeSocket extends EventTarget {
  static instances: FakeSocket[] = [];
  static OPEN = 1; static CLOSING = 2;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  constructor(readonly url: string) { super(); FakeSocket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  receive(data: unknown) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) })); }
  close(code = 1000) { if (this.readyState >= 2) return; this.readyState = 3; this.dispatchEvent(Object.assign(new Event("close"), { code })); }
}
const user = { uid: "member", getIdToken: vi.fn(async (force?: boolean) => force ? "fresh-id" : "id") } as unknown as User;
const snapshot = { v: 1, type: "event_snapshot", eventId: "meeting", revision: 1, updatedAt: 1, viewers: 1, counts: { riding: 0, total: 0 }, roster: [], markers: [] };

beforeEach(() => { FakeSocket.instances = []; vi.clearAllMocks(); vi.stubGlobal("WebSocket", FakeSocket); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); resetRuntimeConfigForTests(); });

it("운영 관전 월드는 플래그를 켠 운영 Firebase 프로젝트에서만 쓴다", () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1" });
  expect(isProductionWorldEventEnabled()).toBe(false);
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  expect(isProductionWorldEventEnabled()).toBe(true);
  resetRuntimeConfigForTests({ firebaseProjectId: "another-project", worldEventViewsEnabled: true });
  expect(isProductionWorldEventEnabled()).toBe(false);
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true, useEmulators: true });
  expect(isProductionWorldEventEnabled()).toBe(false);
  for (const deploymentProfile of ["production-parity-stage", "bundled-development"] as const) {
    resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true, deploymentProfile });
    expect(isProductionWorldEventEnabled()).toBe(false);
  }
  // 운영 Firebase 프로젝트를 공유하는 기존 stage 구성은 deploymentProfile이 없어도 운영 월드에 구독하지 않는다.
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true, appEnvironment: "stage" });
  expect(isProductionWorldEventEnabled()).toBe(false);
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true, deploymentProfile: "bundled-production" });
  expect(isProductionWorldEventEnabled()).toBe(true);
});

it("플래그가 꺼져 있거나 운영 요청이 아니면 연결하지 않는다", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1" });
  renderHook(() => useWorldEvent("meeting", user, null, undefined, undefined, undefined, false, true));
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  renderHook(() => useWorldEvent("meeting", user));
  await act(async () => {});
  expect(FakeSocket.instances).toHaveLength(0);
});

it("운영 구독에 App Check 토큰을 보내고 4001 만료 뒤 새 토큰으로 다시 연결한다", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  const { result } = renderHook(() => useWorldEvent("meeting", user, "rider-two", undefined, undefined, undefined, false, true));
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
  const first = FakeSocket.instances[0]!;
  expect(first.url).toBe("wss://world.orider.co.kr/events");
  act(() => first.open());
  expect(first.sent[0]).toMatchObject({ v: 1, type: "event_subscribe", eventId: "meeting", token: "id", appCheck: "app-check", track: "rider-two", guest: false });
  act(() => first.receive(snapshot));
  expect(result.current?.revision).toBe(1);
  vi.useFakeTimers();
  act(() => first.close(4001));
  expect(result.current).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  const second = FakeSocket.instances[1]!;
  act(() => second.open());
  expect(second.sent[0]).toMatchObject({ token: "fresh-id", appCheck: "app-check" });
  expect(control.services.getAppCheckToken).toHaveBeenLastCalledWith(true);
});

it("App Check 토큰이 없으면 운영 월드에 연결하지 않는다", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  control.services.getAppCheckToken.mockResolvedValue(null);
  const { result } = renderHook(() => useWorldEvent("meeting", user, null, undefined, undefined, undefined, false, true));
  await waitFor(() => expect(control.services.getAppCheckToken).toHaveBeenCalled());
  expect(FakeSocket.instances).toHaveLength(0);
  expect(result.current).toBeNull();
});

it("선택 대상이 바뀌면 같은 소켓에 track만 바꿔 다시 구독하고 새 snapshot부터 그 선택 기준으로 표시한다", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  control.services.getAppCheckToken.mockResolvedValue("app-check");
  const { result, rerender } = renderHook(({ track }) => useWorldEvent("meeting", user, track, undefined, undefined, undefined, false, true),
    { initialProps: { track: "rider-one" as string | null } });
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
  const socket = FakeSocket.instances[0]!;
  act(() => socket.open());
  act(() => socket.receive(snapshot));
  expect(result.current?.track).toBe("rider-one");
  rerender({ track: "rider-two" });
  expect(FakeSocket.instances).toHaveLength(1);
  expect(socket.sent).toHaveLength(2);
  expect(socket.sent[1]).toMatchObject({ type: "event_subscribe", eventId: "meeting", track: "rider-two" });
  // 새 snapshot 전에 온 delta는 이전 선택 기준이다.
  act(() => socket.receive({ v: 1, type: "event_delta", eventId: "meeting", revision: 2, updatedAt: 2, viewers: 2 }));
  expect(result.current).toMatchObject({ revision: 2, track: "rider-one" });
  act(() => socket.receive({ ...snapshot, revision: 3 }));
  expect(result.current).toMatchObject({ revision: 3, track: "rider-two" });
  act(() => socket.receive({ v: 1, type: "event_delta", eventId: "meeting", revision: 4, updatedAt: 4, viewers: 1 }));
  expect(result.current).toMatchObject({ revision: 4, track: "rider-two" });
});

it("빠른 연속 선택 변경으로 응답 대기 구독이 둘 이상이면 snapshot의 선택 기준을 모른다고 표시하고, 현재 선택이 이미 큐 맨 뒤면 중복 전송하지 않는다", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  control.services.getAppCheckToken.mockResolvedValue("app-check");
  const { result, rerender } = renderHook(({ track }) => useWorldEvent("meeting", user, track, undefined, undefined, undefined, false, true),
    { initialProps: { track: "rider-a" as string | null } });
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
  const socket = FakeSocket.instances[0]!;
  act(() => socket.open());
  act(() => socket.receive(snapshot));
  expect(result.current).toMatchObject({ track: "rider-a" });
  rerender({ track: "rider-b" });
  rerender({ track: "rider-c" });
  expect(socket.sent.map((message) => message.track)).toEqual(["rider-a", "rider-b", "rider-c"]);
  // B의 늦은 snapshot인지 C의 것인지 모른다. C 구독이 이미 큐 맨 뒤에서 응답을 기다리므로 다시 보내지 않는다.
  act(() => socket.receive({ ...snapshot, revision: 2 }));
  expect(result.current).toMatchObject({ revision: 2, track: null, trackUnknown: true });
  expect(socket.sent).toHaveLength(3);
  act(() => socket.receive({ ...snapshot, revision: 3 }));
  expect(result.current?.track).toBe("rider-c");
  expect(result.current?.trackUnknown).toBeUndefined();
  // 응답할 구독이 없는데 온 snapshot은 기준을 모른다고 보고 현재 선택으로 다시 구독한다.
  act(() => socket.receive({ ...snapshot, revision: 4 }));
  expect(result.current?.trackUnknown).toBe(true);
  expect(socket.sent[socket.sent.length - 1]).toMatchObject({ track: "rider-c" });
  act(() => socket.receive({ ...snapshot, revision: 5 }));
  expect(result.current?.track).toBe("rider-c");
});

it("B·C·D 구독이 D snapshot 하나로 합쳐지고 서버가 재구독을 버려도 주기적으로 다시 보내 D 기준을 확인한다(#1865)", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  control.services.getAppCheckToken.mockResolvedValue("app-check");
  const { result, rerender } = renderHook(({ track }) => useWorldEvent("meeting", user, track, undefined, undefined, undefined, false, true),
    { initialProps: { track: "rider-a" as string | null } });
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
  vi.useFakeTimers();
  const socket = FakeSocket.instances[0]!;
  act(() => socket.open());
  act(() => socket.receive(snapshot));
  rerender({ track: "rider-b" });
  rerender({ track: "rider-c" });
  rerender({ track: "rider-d" });
  act(() => socket.receive({ ...snapshot, revision: 2 })); // B·C·D를 합친 D snapshot
  expect(result.current).toMatchObject({ revision: 2, trackUnknown: true });
  expect(socket.sent).toHaveLength(4);
  // 응답이 없으면 간격마다 현재 선택으로 다시 보낸다(서버가 처리 중이라 버림).
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS); });
  expect(socket.sent).toHaveLength(5);
  expect(socket.sent[socket.sent.length - 1]).toMatchObject({ type: "event_subscribe", track: "rider-d" });
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS); });
  expect(socket.sent).toHaveLength(6);
  // 서버가 응답하면 큐에 남은 항목이 줄며 결국 D 기준을 확인하고 재전송을 멈춘다.
  for (let revision = 3; revision < 10 && result.current?.track !== "rider-d"; revision++) {
    act(() => socket.receive({ ...snapshot, revision }));
    if (result.current?.track !== "rider-d") act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS); });
  }
  expect(result.current).toMatchObject({ track: "rider-d" });
  expect(result.current?.trackUnknown).toBeUndefined();
  const sent = socket.sent.length;
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS * 10); });
  expect(socket.sent).toHaveLength(sent);
});

it("선택 변경 응답이 오지 않으면 재전송은 상한에서 멈춘다", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  control.services.getAppCheckToken.mockResolvedValue("app-check");
  const { result, rerender } = renderHook(({ track }) => useWorldEvent("meeting", user, track, undefined, undefined, undefined, false, true),
    { initialProps: { track: "rider-a" as string | null } });
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
  vi.useFakeTimers();
  const socket = FakeSocket.instances[0]!;
  act(() => socket.open());
  act(() => socket.receive(snapshot));
  rerender({ track: "rider-b" });
  expect(socket.sent).toHaveLength(2);
  // 새 snapshot 전 delta는 이전 선택(A) 기준이라 선택 격차 기준은 B가 아니다.
  act(() => socket.receive({ v: 1, type: "event_delta", eventId: "meeting", revision: 2, updatedAt: 2, viewers: 2 }));
  expect(result.current?.track).toBe("rider-a");
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS * 20); });
  expect(socket.sent).toHaveLength(2 + TRACK_RETRY_LIMIT);
  expect(socket.sent.slice(2).every((message) => message.track === "rider-b")).toBe(true);
});

it("재전송 상한 뒤 한 간격을 더 기다려 여전히 미확인일 때만 track-confirm-exhausted를 기록한다(#1865)", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  control.services.getAppCheckToken.mockResolvedValue("app-check");
  const exhausted = () => vi.mocked(logClientError).mock.calls.filter(([source]) => source === "ride-world.event.trackConfirm");
  const { result, rerender } = renderHook(({ track }) => useWorldEvent("meeting", user, track, undefined, undefined, undefined, false, true),
    { initialProps: { track: "rider-a" as string | null } });
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
  vi.useFakeTimers();
  const socket = FakeSocket.instances[0]!;
  act(() => socket.open());
  act(() => socket.receive(snapshot));
  // 서버가 B 구독을 버려 응답이 없다. 상한까지 재전송한 직후에는 아직 기록하지 않는다.
  rerender({ track: "rider-b" });
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS * TRACK_RETRY_LIMIT); });
  expect(socket.sent).toHaveLength(2 + TRACK_RETRY_LIMIT);
  expect(exhausted()).toHaveLength(0);
  // 마지막 재구독의 응답이 한 간격 안에 오면 정상 복구로 보고 기록하지 않는다.
  act(() => socket.receive({ ...snapshot, revision: 2 }));
  for (let i = 0; i < TRACK_RETRY_LIMIT; i++) act(() => socket.receive({ ...snapshot, revision: 3 + i }));
  expect(result.current).toMatchObject({ track: "rider-b" });
  expect(result.current?.trackUnknown).toBeUndefined();
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS * 5); });
  expect(exhausted()).toHaveLength(0);
  // 다시 응답이 끊기면 상한 뒤 한 간격이 지나도 미확인일 때만 한 번 기록하고 더 보내지 않는다.
  rerender({ track: "rider-c" });
  const sentBefore = socket.sent.length;
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS * TRACK_RETRY_LIMIT); });
  expect(exhausted()).toHaveLength(0);
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS); });
  expect(exhausted()).toHaveLength(1);
  act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS * 10); });
  expect(exhausted()).toHaveLength(1);
  expect(socket.sent).toHaveLength(sentBefore + TRACK_RETRY_LIMIT);
});

/** 재현 가능한 의사 난수(mulberry32). */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

it("무작위 선택 변경·서버 처리 지연·구독 버림·snapshot 합치기·재전송에서도 선택 격차 기준은 항상 실제 서버 기준과 같고 현재 선택으로 수렴한다(속성)", async () => {
  resetRuntimeConfigForTests({ firebaseProjectId: "miranae-orider-g1", worldEventViewsEnabled: true });
  control.services.getAppCheckToken.mockResolvedValue("app-check");
  const tracks = [null, "rider-a", "rider-b", "rider-c", "rider-d"];
  for (let seed = 1; seed <= 100; seed++) {
    FakeSocket.instances = [];
    const random = seeded(seed);
    const pick = () => tracks[Math.floor(random() * tracks.length)]!;
    let selected = pick();
    // 첫 프레임 제한(3초) 타이머까지 가짜 시간으로 만들고, 시간은 첫 snapshot을 받은 뒤에만 흐르게 해 재연결 없이 한 소켓에서 검증한다.
    vi.useFakeTimers();
    const hook = renderHook(({ track }) => useWorldEvent("meeting", user, track, undefined, undefined, undefined, false, true),
      { initialProps: { track: selected } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(FakeSocket.instances).toHaveLength(1);
    const socket = FakeSocket.instances[0]!;
    act(() => socket.open());
    // 서버 모형: 받은 구독을 순서대로 처리(일부는 처리 중이라 버림)하고, flush 때 마지막 처리 이후 첫 프레임은 그 기준의
    // snapshot(사이에 처리한 구독은 합침), 그 밖에는 직전 snapshot 기준의 delta를 보낸다.
    let received = 0;
    let serverTrack: string | null | undefined;
    let needSnapshot = false;
    let basis: string | null | undefined;
    let revision = 0;
    const processOne = (allowDrop: boolean) => {
      if (received >= socket.sent.length) return false;
      const message = socket.sent[received++]!;
      if (allowDrop && received > 1 && random() < 0.05) return true;
      serverTrack = (message.track as string | null | undefined) ?? null;
      needSnapshot = true;
      return true;
    };
    const flush = () => {
      if (needSnapshot) {
        basis = serverTrack;
        needSnapshot = false;
        act(() => socket.receive({ ...snapshot, revision: ++revision }));
      } else if (basis !== undefined) {
        act(() => socket.receive({ v: 1, type: "event_delta", eventId: "meeting", revision: ++revision, updatedAt: revision, viewers: revision }));
      } else return;
      const frame = hook.result.current;
      if (frame && !frame.trackUnknown) {
        // 기준을 안다고 표시한 프레임의 track은 실제 서버 기준이다. 따라서 선택 격차를 보이는(track이 현재 선택과 같은) 때는
        // 항상 현재 선택 기준이다.
        expect({ seed, track: frame.track }).toEqual({ seed, track: basis });
        if (frame.track === selected) expect({ seed, basis }).toEqual({ seed, basis: selected });
      }
    };
    for (let step = 0; step < 40; step++) {
      const roll = random();
      if (roll < 0.3) {
        selected = pick();
        hook.rerender({ track: selected });
      } else if (roll < 0.5) processOne(true);
      else if (roll < 0.6) while (processOne(true));
      else if (roll < 0.9) flush();
      else if (basis !== undefined) act(() => { vi.advanceTimersByTime(Math.floor(random() * 4000)); }); // 시간 경과(재전송 타이머)
    }
    // 버려진 구독이 있어도 서버가 끝까지 처리하고 시간이 흐르면 재전송으로 현재 선택 기준에 수렴한다.
    const converged = () => hook.result.current?.track === selected && hook.result.current.trackUnknown === undefined;
    for (let round = 0; round < 50 && !converged(); round++) {
      while (processOne(false));
      flush();
      if (!converged()) act(() => { vi.advanceTimersByTime(TRACK_RETRY_MS); });
    }
    expect({ seed, frame: hook.result.current }).toMatchObject({ seed, frame: { track: selected } });
    expect(hook.result.current?.trackUnknown).toBeUndefined();
    // 첫 프레임 제한으로 재연결되지 않았다(재연결되면 이 서버 모형의 응답이 무시된다).
    expect({ seed, sockets: FakeSocket.instances.length }).toEqual({ seed, sockets: 1 });
    hook.unmount();
    vi.useRealTimers();
  }
}, 60000);
