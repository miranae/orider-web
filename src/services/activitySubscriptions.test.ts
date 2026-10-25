import { ensureAppCheckReady } from "./firebase";
import { getCountFromServer, getDocs, limit, startAfter } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { activitySubscriptionsBackendReady } from "../config/activitySubscriptions";
import { simulateLogin, simulateLogout } from "../__tests__/mocks/firebase";
import { getPublicUserProfiles } from "./publicProfiles";
import { readOwnFriendCount, readOwnSubscriptionPage, getActivitySubscriptionSummary, setActivitySubscription, ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, readOwnBlockedPage, unblockActivitySubscriptionTarget } from "./activitySubscriptions";
vi.mock("../config/activitySubscriptions", () => ({ activitySubscriptionsBackendReady: vi.fn(() => true) }));
vi.mock("./publicProfiles", () => ({ getPublicUserProfiles: vi.fn() }));
beforeEach(() => {
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  simulateLogin({ uid: "owner" }); vi.mocked(activitySubscriptionsBackendReady).mockReturnValue(true);
  vi.mocked(getCountFromServer).mockReset(); vi.mocked(getDocs).mockReset(); vi.mocked(httpsCallable).mockReset();
  vi.mocked(getPublicUserProfiles).mockReset().mockResolvedValue(new Map());
});
it("counts actual friends separately, including an actual zero", async () => {
  vi.mocked(getCountFromServer).mockResolvedValue({ data: () => ({ count: 0 }) } as never);
  expect(await readOwnFriendCount("owner")).toBe(0);
  expect(getCountFromServer).toHaveBeenCalledWith(expect.objectContaining({ path: "friends/owner/users" }));
});
it("blocks unready endpoints and new collections before any request", async () => {
  vi.mocked(activitySubscriptionsBackendReady).mockReturnValue(false);
  await expect(readOwnSubscriptionPage("owner", "subscriptions")).rejects.toMatchObject({ code: "subscriptions/not-deployed" });
  await expect(getActivitySubscriptionSummary("owner", "target")).rejects.toMatchObject({ code: "subscriptions/not-deployed" });
  await expect(setActivitySubscription("owner", "target", true)).rejects.toMatchObject({ code: "subscriptions/not-deployed" });
  expect(getDocs).not.toHaveBeenCalled(); expect(httpsCallable).not.toHaveBeenCalled();
});
it("rejects another owner, logged out accounts and self-subscription", async () => {
  await expect(readOwnFriendCount("other")).rejects.toThrow("owner-required");
  await expect(setActivitySubscription("owner", "owner", true)).rejects.toThrow("invalid-target");
  simulateLogout();
  await expect(readOwnSubscriptionPage("owner", "subscribers")).rejects.toThrow("owner-required");
  expect(getDocs).not.toHaveBeenCalled(); expect(httpsCallable).not.toHaveBeenCalled();
});
it("returns the actual summary contract including known zero values", async () => {
  const data = { targetUid: "target", subscribed: false, subscriberCount: 0, subscriptionCount: 3 };
  vi.mocked(httpsCallable).mockReturnValue(vi.fn(async () => ({ data })) as never);
  expect(await getActivitySubscriptionSummary("owner", "target")).toEqual(data);
  expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "getActivitySubscriptionSummary");
});
it("rejects a mismatched summary instead of rendering another target's state", async () => {
  vi.mocked(httpsCallable).mockReturnValue(vi.fn(async () => ({ data: { targetUid: "other", subscribed: false, subscriberCount: 1, subscriptionCount: 1 } })) as never);
  await expect(getActivitySubscriptionSummary("owner", "target")).rejects.toThrow("invalid-response");
});
it("publishes an account-scoped refresh event only after a successful real callable result", async () => {
  const listener = vi.fn(); window.addEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, listener);
  try {
    const invoke = vi.fn(async () => ({ data: { targetUid: "target", subscribed: true } }));
    vi.mocked(httpsCallable).mockReturnValue(invoke as never);
    await setActivitySubscription("owner", "target", true);
    expect(invoke).toHaveBeenCalledWith({ targetUid: "target", subscribed: true });
    expect(listener).toHaveBeenCalledOnce(); expect(listener.mock.calls[0]?.[0].detail).toEqual({ uid: "owner" });
  } finally { window.removeEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, listener); }
});
it.each(["other", "owner"])("discards a replaced session (%s) mutation and emits no refresh event", async replacementUid => {
  const listener = vi.fn(); window.addEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, listener);
  try {
    vi.mocked(httpsCallable).mockReturnValue(vi.fn(async () => { simulateLogin({ uid: replacementUid }); return { data: { targetUid: "target", subscribed: true } }; }) as never);
    await expect(setActivitySubscription("owner", "target", true)).rejects.toThrow("owner-required");
    expect(listener).not.toHaveBeenCalled();
  } finally { window.removeEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, listener); }
});
it("pages twenty relations and hydrates only public profile data", async () => {
  vi.mocked(getDocs).mockResolvedValue({ docs: Array.from({ length: 21 }, (_, index) => ({ id: String(index), data: () => ({ nickname: "PRIVATE_COPY" }) })) } as never);
  vi.mocked(getPublicUserProfiles).mockResolvedValue(new Map([["0", { id: "0", nickname: "Public name", photoURL: "https://example.com/public.jpg" }]]));
  const page = await readOwnSubscriptionPage("owner", "subscribers", "before");
  expect(page.items).toHaveLength(20); expect(page.hasMore).toBe(true); expect(page.cursor).toBe("19");
  expect(page.items[0]?.nickname).toBe("Public name"); expect(page.items[1]?.nickname).toBeNull();
  expect(limit).toHaveBeenCalledWith(21); expect(startAfter).toHaveBeenCalledWith("before");
});
it("avoids profile hydration when a feed needs IDs only", async () => {
  vi.mocked(getDocs).mockResolvedValue({ docs: [{ id: "target", data: () => ({}) }] } as never);
  expect((await readOwnSubscriptionPage("owner", "subscriptions", null, { hydrateProfiles: false })).items[0]?.userId).toBe("target");
  expect(getPublicUserProfiles).not.toHaveBeenCalled();
});
it("discards a cached or old-account relation list instead of inventing an empty one", async () => {
  vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never);
  await expect(readOwnSubscriptionPage("owner", "subscriptions")).rejects.toThrow("server-confirmation-required");
  vi.mocked(getDocs).mockImplementation(async () => { simulateLogout(); return { docs: [] } as never; });
  await expect(readOwnSubscriptionPage("owner", "subscriptions")).rejects.toThrow("owner-required");
});

it("reads only the authenticated owner's outbound blocks", async () => {
  vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
  await readOwnBlockedPage("owner");
  expect(getDocs).toHaveBeenCalledWith(expect.objectContaining({ path: "users/owner/blocks" }));
});
it("uses the existing unblock callable and never restores a subscription", async () => {
  const call = vi.fn(async () => ({ data: { targetUid: "target", blocked: false } }));
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await unblockActivitySubscriptionTarget("owner", "target");
  expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "setActivitySocialBlock");
  expect(call).toHaveBeenCalledWith({ targetUid: "target", blocked: false });
  expect(httpsCallable).not.toHaveBeenCalledWith(expect.anything(), "setActivitySubscription");
});

it.each(["summary", "subscribe", "unblock"])("does not dispatch %s after SDK identity changes during readiness", async operation => {
  let ready!: () => void;
  vi.mocked(ensureAppCheckReady).mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
  const request = operation === "summary" ? getActivitySubscriptionSummary("owner", "target")
    : operation === "subscribe" ? setActivitySubscription("owner", "target", true)
      : unblockActivitySubscriptionTarget("owner", "target");
  const rejection = expect(request).rejects.toThrow("owner-required");
  simulateLogin({ uid: "owner" });
  ready();
  await rejection;
  expect(httpsCallable).not.toHaveBeenCalled();
});
it("discards relation data if the same UID logs in again during profile hydration", async () => {
  vi.mocked(getDocs).mockResolvedValue({ docs: [{ id: "target" }] } as never);
  vi.mocked(getPublicUserProfiles).mockImplementationOnce(async () => {
    simulateLogin({ uid: "owner" });
    return new Map();
  });
  await expect(readOwnSubscriptionPage("owner", "subscriptions")).rejects.toThrow("owner-required");
});
it("uses only the injected SDK account and rejects its same-UID replacement before emitting", async () => {
  const viewer = { uid: "embedded", isAnonymous: false };
  const services = { auth: { currentUser: viewer }, ensureAppCheckReady: vi.fn(async () => {}), functions: { app: {} } };
  const listener = vi.fn(); window.addEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, listener);
  try {
    vi.mocked(httpsCallable).mockReturnValue(vi.fn(async () => {
      services.auth.currentUser = { ...viewer };
      return { data: { targetUid: "target", subscribed: true } };
    }) as never);
    await expect(setActivitySubscription("embedded", "target", true, services as never)).rejects.toThrow("owner-required");
    expect(services.ensureAppCheckReady).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  } finally { window.removeEventListener(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, listener); }
});
