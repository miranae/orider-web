import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { createPublicActivityClient } from "./publicActivityDetail";
const mocks = vi.hoisted(() => ({ call: vi.fn(), getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn(), ready: vi.fn() }));
vi.mock("firebase/functions", () => ({ getFunctions: mocks.getFunctions, httpsCallable: (...args: unknown[]) => { mocks.httpsCallable(...args); return mocks.call; }, connectFunctionsEmulator: vi.fn() }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "production" }), isEmulatorRuntime: () => false }));
beforeEach(() => { vi.clearAllMocks(); mocks.ready.mockResolvedValue(undefined); mocks.call.mockResolvedValue({ data: { activity: { id: "a" }, content: { activityId: "a" }, viewerHasKudos: false } }); });
function services(uid: string | null): FirebaseServices { return { auth: { currentUser: uid ? { uid, isAnonymous: false } : null }, functions: { app: { name: "embedded" } }, ensureAppCheckReady: mocks.ready } as unknown as FirebaseServices; }
describe("public activity transport", () => {
  it("uses the injected embedded Firebase app and social callable region", async () => {
    const source = services("viewer");
    await createPublicActivityClient(source).load("a");
    expect(mocks.getFunctions).toHaveBeenCalledWith(source.functions.app, "asia-northeast3");
    expect(mocks.httpsCallable).toHaveBeenCalledWith(expect.anything(), "getActivityPublicDetail", { timeout: 10000 });
  });
  it("allows public reads before login but requires login for mutations", async () => {
    const client = createPublicActivityClient(services(null));
    await expect(client.load("a")).resolves.toBeDefined();
    await expect(client.postComment("a", "hello", "request-id")).rejects.toThrow("sign_in_required");
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
  it("rejects responses after the account switches", async () => {
    const source = services("viewer");
    mocks.call.mockImplementation(async () => { Object.assign(source.auth, { currentUser: { uid: "next" } }); return { data: {} }; });
    await expect(createPublicActivityClient(source).load("a")).rejects.toThrow("account_changed");
  });
  it("rejects a response for another activity", async () => {
    mocks.call.mockResolvedValue({ data: { activity: { id: "b" }, content: { activityId: "a" }, viewerHasKudos: false } });
    await expect(createPublicActivityClient(services("viewer")).load("a")).rejects.toThrow("invalid_public_activity");
  });
});

it("passes opaque comment cursors and optimistic memo revisions without changing them", async () => {
  const client = createPublicActivityClient(services("viewer"));
  await client.comments("a", "opaque-cursor");
  expect(mocks.call).toHaveBeenLastCalledWith({ activityId: "a", cursor: "opaque-cursor" });
  await client.setNativeMemo("a", "memo", "revision");
  expect(mocks.call).toHaveBeenLastCalledWith({ activityId: "a", memo: "memo", expectedMemoRevision: "revision" });
});

it("uses existing activity-level safety contracts and validates hide/block acknowledgement", async () => {
  const client = createPublicActivityClient(services("viewer"));
  await client.reportActivity("a", "privacy");
  expect(mocks.call).toHaveBeenLastCalledWith({ activityId: "a", reason: "other", note: "privacy" });
  mocks.call.mockResolvedValue({ data: { activityId: "a", hidden: true } });
  await client.hideActivity("a"); expect(mocks.call).toHaveBeenLastCalledWith({ activityId: "a", hidden: true });
  mocks.call.mockResolvedValue({ data: { targetUid: "author", blocked: true } });
  await client.blockAuthor("author"); expect(mocks.call).toHaveBeenLastCalledWith({ targetUid: "author", blocked: true });
  await expect(client.blockAuthor("viewer")).rejects.toThrow("cannot_block_self");
  await expect(client.hideActivity("a")).rejects.toThrow("invalid_hide_response");
});
it.each([null, "anonymous"])("does not allow safety writes for %s", async uid => {
  const source = services(uid); if (source.auth.currentUser) Object.assign(source.auth.currentUser, { isAnonymous: true });
  const client = createPublicActivityClient(source);
  await expect(client.hideActivity("a")).rejects.toThrow("sign_in_required");
  await expect(client.blockAuthor("author")).rejects.toThrow("sign_in_required");
  await expect(client.reportActivity("a", "")).rejects.toThrow("sign_in_required");
  expect(mocks.call).not.toHaveBeenCalled();
});
it("does not publish hide success after the account changes during submission", async () => {
  const source = services("viewer"); const listener = vi.fn();
  window.addEventListener("orider:activity-safety-changed", listener);
  mocks.call.mockImplementation(async () => { Object.assign(source.auth, { currentUser: { uid: "other" } }); return { data: { activityId: "a", hidden: true } }; });
  await expect(createPublicActivityClient(source).hideActivity("a")).rejects.toThrow("account_changed");
  expect(listener).not.toHaveBeenCalled(); window.removeEventListener("orider:activity-safety-changed", listener);
});
it("invalidates exact comment destinations after successful mutations using only activity identity", async () => {
  const handler = vi.fn(); window.addEventListener("orider:activity-content-changed", handler);
  await createPublicActivityClient(services("viewer")).deleteComment("a", "private-comment-id");
  expect(handler).toHaveBeenCalledOnce(); expect(handler.mock.calls[0][0].detail).toEqual({ activityId: "a" });
  window.removeEventListener("orider:activity-content-changed", handler);
});
