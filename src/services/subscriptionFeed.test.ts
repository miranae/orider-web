import { createMockActivity } from "../__tests__/fixtures/mockData";
import { admitSubscriptionActivities } from "./subscriptionFeed";
const state = vi.hoisted(() => ({ user: { uid: "viewer", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, call: vi.fn(), factory: vi.fn(), regional: {}, region: vi.fn() }));
vi.mock("./firebase", () => ({ auth: { get currentUser() { return state.user; } }, ensureAppCheckReady: async () => {}, functions: { app: { name: "subscription-test" } } }));
vi.mock("../config/activitySubscriptions", () => ({ ACTIVITY_SUBSCRIPTIONS_ENABLED: true, activitySubscriptionsBackendReady: () => true }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "production" }), isEmulatorRuntime: () => false }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (...args: unknown[]) => { state.factory(...args); return state.call; },
  getFunctions: (...args: unknown[]) => { state.region(...args); return state.regional; },
  connectFunctionsEmulator: vi.fn(),
}));
beforeEach(() => { state.user = { uid: "viewer", isAnonymous: false }; state.call.mockReset(); state.factory.mockClear(); state.region.mockClear(); });
it("validates in batches of at most fifty with current public-only policy", async () => {
  const items = Array.from({ length: 51 }, (_, index) => createMockActivity({ id: `a${index}` }));
  state.call.mockImplementation(async ({ activityIds }) => ({ data: { schemaVersion: 1, allowedActivityIds: activityIds.filter((id: string) => id !== "a0") } }));
  const allowed = await admitSubscriptionActivities("viewer", items);
  expect(allowed).toHaveLength(50);
  expect(state.region).toHaveBeenCalledWith({ name: "subscription-test" }, "asia-northeast3");
  expect(state.factory).toHaveBeenCalledWith(state.regional, "validateActivitySocialFeedCandidates", { timeout: 10000 });
  expect(state.call.mock.calls.map(([request]) => request.activityIds.length)).toEqual([50, 1]);
  expect(state.call.mock.calls.every(([request]) => request.publicOnly === true)).toBe(true);
});
it("fails closed on malformed admission and guest identities", async () => {
  state.call.mockResolvedValue({ data: { schemaVersion: 1, allowedActivityIds: ["not-requested"] } });
  await expect(admitSubscriptionActivities("viewer", [createMockActivity({ id: "a" })])).rejects.toThrow();
  state.user = null;
  state.call.mockClear();
  await expect(admitSubscriptionActivities("viewer", [])).rejects.toThrow();
  expect(state.call).not.toHaveBeenCalled();
});
it("rejects an admission reply arriving after account change", async () => {
  let finish!: (value: unknown) => void;
  state.call.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const request = admitSubscriptionActivities("viewer", [createMockActivity({ id: "a" })]);
  await vi.waitFor(() => expect(state.call).toHaveBeenCalled());
  state.user = { uid: "other", isAnonymous: false };
  finish({ data: { schemaVersion: 1, allowedActivityIds: ["a"] } });
  await expect(request).rejects.toThrow("viewer-changed");
});
