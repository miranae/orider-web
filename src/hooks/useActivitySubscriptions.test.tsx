import type { ReactNode } from "react";
import { FirebaseServicesProvider, type FirebaseServices } from "../contexts/FirebaseServicesContext";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActivitySubscriptions } from "./useActivitySubscriptions";
const state = vi.hoisted(() => ({ user: { uid: "a", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, read: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("../config/activitySubscriptions", () => ({ ACTIVITY_SUBSCRIPTIONS_ENABLED: true }));
vi.mock("../services/activitySubscriptions", () => ({ ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT: "subscriptions-changed", readOwnSubscriptionPage: state.read, isSubscriptionsNotDeployed: (error: { code?: string }) => error?.code === "subscriptions/not-deployed" }));
beforeEach(() => { state.user = { uid: "a", isAnonymous: false }; state.read.mockReset(); });
it("waits for every relationship page and requests IDs without profile hydration", async () => {
  let finish!: (value: unknown) => void;
  state.read.mockResolvedValueOnce({ items: [{ userId: "first" }], hasMore: true, cursor: "first" })
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useActivitySubscriptions(true));
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
  expect(result.current.ids).toEqual([]);
  expect(result.current.ready).toBe(false);
  expect(state.read).toHaveBeenLastCalledWith("a", "subscriptions", "first", expect.objectContaining({ hydrateProfiles: false, services: expect.anything() }));
  await act(async () => { finish({ items: [{ userId: "last" }], hasMore: false, cursor: "last" }); });
  expect(result.current.ids).toEqual(["first", "last"]);
  expect(result.current.ready).toBe(true);
});
it("does not read relationships for guests or disabled scopes", () => {
  state.user = null;
  const view = renderHook(() => useActivitySubscriptions(true));
  expect(state.read).not.toHaveBeenCalled();
  view.unmount();
  state.user = { uid: "a", isAnonymous: false };
  renderHook(() => useActivitySubscriptions(false));
  expect(state.read).not.toHaveBeenCalled();
});
it("drops late account results and clears membership immediately after a mutation event", async () => {
  let finishA!: (value: unknown) => void;
  state.read.mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
    .mockResolvedValue({ items: [{ userId: "b-target" }], hasMore: false });
  const { result, rerender } = renderHook(() => useActivitySubscriptions(true));
  state.user = { uid: "b", isAnonymous: false };
  rerender();
  await waitFor(() => expect(result.current.ids).toEqual(["b-target"]));
  await act(async () => { finishA({ items: [{ userId: "a-target" }], hasMore: false }); });
  expect(result.current.ids).toEqual(["b-target"]);
  let finishRefresh!: (value: unknown) => void;
  state.read.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
  act(() => window.dispatchEvent(new CustomEvent("subscriptions-changed", { detail: { uid: "b" } })));
  expect(result.current.ids).toEqual([]);
  expect(result.current.ready).toBe(false);
  await act(async () => { finishRefresh({ items: [], hasMore: false }); });
  expect(result.current.ready).toBe(true);
});

it("distinguishes an undeployed subscription service from an empty membership", async () => {
  state.read.mockRejectedValue({ code: "subscriptions/not-deployed" });
  const { result } = renderHook(() => useActivitySubscriptions(true));
  await waitFor(() => expect(result.current.unavailable).toBe(true));
  expect(result.current.ready).toBe(false);
  expect(result.current.error).toBe(true);
});

const isolatedServices = () => ({ auth: { currentUser: { uid: "a" } }, firestore: {}, functions: {}, ensureAppCheckReady: vi.fn(), getAppCheckToken: vi.fn() }) as unknown as FirebaseServices;
it("immediately clears ready IDs and changes the consumer key when the app changes for the same uid", async () => {
  let current = isolatedServices();
  const wrapper = ({ children }: { children: ReactNode }) => <FirebaseServicesProvider services={current}>{children}</FirebaseServicesProvider>;
  let finish!: (value: unknown) => void;
  state.read.mockResolvedValueOnce({ items: [{ userId: "old-app-target" }], hasMore: false })
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(() => useActivitySubscriptions(true), { wrapper });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  const priorKey = view.result.current.key;
  current = isolatedServices(); view.rerender();
  expect(view.result.current.ids).toEqual([]);
  expect(view.result.current.ready).toBe(false);
  expect(view.result.current.key).not.toBe(priorKey);
  await act(async () => finish({ items: [{ userId: "new-app-target" }], hasMore: false }));
  expect(view.result.current.ids).toEqual(["new-app-target"]);
});
it.each(["first", "continuation"])("discards a late old-app %s page after same-uid app replacement", async phase => {
  const first = isolatedServices(), next = isolatedServices();
  let current = first;
  const wrapper = ({ children }: { children: ReactNode }) => <FirebaseServicesProvider services={current}>{children}</FirebaseServicesProvider>;
  let finishOld!: (value: unknown) => void;
  if (phase === "continuation") state.read.mockResolvedValueOnce({ items: [{ userId: "old-first" }], hasMore: true, cursor: "old-cursor" });
  state.read.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockResolvedValue({ items: [{ userId: "new-target" }], hasMore: false });
  const view = renderHook(() => useActivitySubscriptions(true), { wrapper });
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(phase === "first" ? 1 : 2));
  current = next; view.rerender();
  await waitFor(() => expect(view.result.current.ids).toEqual(["new-target"]));
  const calls = state.read.mock.calls.length;
  await act(async () => finishOld({ items: [{ userId: "late-old-target" }], hasMore: true, cursor: "must-not-fetch" }));
  expect(view.result.current.ids).toEqual(["new-target"]);
  expect(state.read).toHaveBeenCalledTimes(calls);
});
