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
  expect(state.read).toHaveBeenLastCalledWith("a", "subscriptions", "first", { hydrateProfiles: false });
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
