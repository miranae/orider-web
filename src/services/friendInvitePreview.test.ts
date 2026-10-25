import { resolveFriendInvitePreview } from "./friendInvitePreview";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const m = vi.hoisted(() => ({ call: vi.fn(), ready: vi.fn(), fn: {} }));
vi.mock("firebase/functions", () => ({ getFunctions: () => m.fn, connectFunctionsEmulator: vi.fn(), httpsCallable: () => m.call }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "production" }), isEmulatorRuntime: () => false }));
const profile = { userId: "inviter", nickname: "Inviter", photoURL: null };
function services() { return { auth: { currentUser: null }, functions: { app: {} }, ensureAppCheckReady: m.ready } as unknown as FirebaseServices; }
beforeEach(() => { vi.clearAllMocks(); m.ready.mockResolvedValue(undefined); m.call.mockResolvedValue({ data: { profile } }); });
it("resolves normalized code only through callable after AppCheck", async () => {
  await expect(resolveFriendInvitePreview(services(), " abc123 ")).resolves.toEqual(profile);
  expect(m.ready).toHaveBeenCalledOnce(); expect(m.call).toHaveBeenCalledWith({ friendCode: "ABC123" });
});
it("invalid codes and unavailable profiles disclose no fallback", async () => {
  expect(await resolveFriendInvitePreview(services(), "bad")).toBeNull(); expect(m.call).not.toHaveBeenCalled();
  m.call.mockResolvedValue({ data: { profile: null } }); expect(await resolveFriendInvitePreview(services(), "ABC123")).toBeNull();
});
it("rejects account changes during preparation and response", async () => {
  const s = services(); m.ready.mockImplementation(async () => { Object.assign(s.auth, { currentUser: { uid: "viewer" } }); });
  await expect(resolveFriendInvitePreview(s, "ABC123")).rejects.toThrow("account_changed"); expect(m.call).not.toHaveBeenCalled();
  m.ready.mockResolvedValue(undefined); m.call.mockImplementation(async () => { Object.assign(s.auth, { currentUser: { uid: "viewer" } }); return { data: { profile } }; });
  await expect(resolveFriendInvitePreview(s, "ABC123")).rejects.toThrow("account_changed");
});
it("rejects malformed or unsafe response and propagates network failure", async () => {
  m.call.mockResolvedValue({ data: { profile: { ...profile, photoURL: "javascript:bad" } } });
  await expect(resolveFriendInvitePreview(services(), "ABC123")).rejects.toThrow("invalid_friend_invite");
  m.call.mockRejectedValue(new Error("offline")); await expect(resolveFriendInvitePreview(services(), "ABC123")).rejects.toThrow("offline");
});
