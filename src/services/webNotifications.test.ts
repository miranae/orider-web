import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { createWebNotificationClient } from "./webNotifications";
const mocks = vi.hoisted(() => ({ call: vi.fn(), ready: vi.fn() }));
vi.mock("firebase/functions", () => ({ getFunctions: () => ({}), httpsCallable: () => mocks.call, connectFunctionsEmulator: vi.fn() }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "production" }), isEmulatorRuntime: () => false }));
const services = () => ({ auth: { currentUser: { uid: "viewer", isAnonymous: false } }, functions: { app: {} }, ensureAppCheckReady: mocks.ready } as unknown as FirebaseServices);
beforeEach(() => { vi.clearAllMocks(); mocks.ready.mockResolvedValue(undefined); });
it("strips unavailable notification identifiers and body even if a stale field is returned", async () => {
  mocks.call.mockResolvedValue({ data: { items: [{ id: "n", type: "comment", access: "unavailable", activityId: "private", commentId: "secret", fromNickname: "private actor", message: "private text", read: false, createdAt: 1 }], nextCursor: null } });
  const page = await createWebNotificationClient(services()).list();
  expect(page.items[0]).toEqual({ id: "n", type: "unavailable", access: "unavailable", activityId: null, segmentId: null, fromUserId: "", fromNickname: "", fromProfileImage: null, message: "", read: false, createdAt: 1 });
});
it("drops responses after same-UID Firebase User replacement", async () => {
  const source = services(); const client = createWebNotificationClient(source);
  mocks.call.mockImplementation(async () => { Object.assign(source.auth, { currentUser: { uid: "viewer", isAnonymous: false } }); return { data: { items: [], nextCursor: null } }; });
  await expect(client.list()).rejects.toThrow("account_changed");
});
it("passes exact comment IDs and opaque pagination cursors without raw Firestore reads", async () => {
  mocks.call.mockResolvedValue({ data: { items: [], nextCursor: null } }); const client = createWebNotificationClient(services());
  await client.list("opaque"); expect(mocks.call).toHaveBeenLastCalledWith({ limit: 20, cursor: "opaque" });
  await client.comment("ride", "comment"); expect(mocks.call).toHaveBeenLastCalledWith({ activityId: "ride", commentId: "comment" });
  await client.markRead(["n"]); expect(mocks.call).toHaveBeenLastCalledWith({ ids: ["n"] });
});
