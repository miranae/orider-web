import { act, renderHook, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { isProductionWorldEventEnabled, useWorldEvent } from "./useWorldEvent";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";

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
