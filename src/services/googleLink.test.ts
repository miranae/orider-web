import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const user = { uid: "target", isAnonymous: false, reload: vi.fn() };
  return {
    user, current: user as { uid: string } | null,
    linkWithPopup: vi.fn(), linkWithCredential: vi.fn(), signInWithCredential: vi.fn(), credentialFromError: vi.fn(),
    callable: vi.fn(), callableFactory: vi.fn(), isolatedAuth: { name: "isolated" }, isolatedUsed: vi.fn(), appCheck: vi.fn(),
    order: [] as string[],
  };
});
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: { credentialFromError: mocks.credentialFromError },
  linkWithPopup: mocks.linkWithPopup, linkWithCredential: mocks.linkWithCredential, signInWithCredential: mocks.signInWithCredential,
}));
vi.mock("./firebase", () => ({
  auth: { get currentUser() { return mocks.current; } },
  googleProvider: { providerId: "google.com" },
  ensureAppCheckReady: mocks.appCheck,
  withIsolatedAuth: async (work: (auth: unknown) => Promise<unknown>) => { mocks.isolatedUsed(); return work(mocks.isolatedAuth); },
}));
vi.mock("./authCallables", () => ({ authCallable: (name: string) => { mocks.callableFactory(name); return mocks.callable; } }));
import { linkGoogleToCurrentUser } from "./googleLink";

const credential = { providerId: "google.com", idToken: "google-id-token" };
const inUse = { code: "auth/credential-already-in-use" };

beforeEach(() => {
  mocks.current = mocks.user; mocks.order = [];
  for (const fn of [mocks.linkWithPopup, mocks.linkWithCredential, mocks.signInWithCredential, mocks.credentialFromError, mocks.callable,
    mocks.callableFactory, mocks.isolatedUsed, mocks.appCheck, mocks.user.reload]) fn.mockReset();
  mocks.linkWithPopup.mockRejectedValue(inUse);
  mocks.credentialFromError.mockReturnValue(credential);
  mocks.signInWithCredential.mockImplementation(async () => { mocks.order.push("isolated-sign-in"); return { user: { getIdToken: async () => "source-id-token" } }; });
  mocks.callable.mockImplementation(async () => { mocks.order.push("server-connect"); return { data: { connected: true } }; });
  mocks.linkWithCredential.mockImplementation(async () => { mocks.order.push("link"); });
});

describe("linkGoogleToCurrentUser", () => {
  it("links a free Google account directly without asking", async () => {
    mocks.linkWithPopup.mockResolvedValue({});
    const confirm = vi.fn();
    await expect(linkGoogleToCurrentUser(confirm)).resolves.toBe("linked");
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.user.reload).toHaveBeenCalled();
  });

  it("proves the other account in an isolated session, retires it on the server, then links the same credential", async () => {
    await expect(linkGoogleToCurrentUser(async () => true)).resolves.toBe("connected");
    expect(mocks.isolatedUsed).toHaveBeenCalled();
    expect(mocks.signInWithCredential).toHaveBeenCalledWith(mocks.isolatedAuth, credential);
    expect(mocks.callableFactory).toHaveBeenCalledWith("connectExistingGoogleAccount");
    expect(mocks.callable).toHaveBeenCalledWith({ sourceIdToken: "source-id-token" });
    expect(mocks.linkWithCredential).toHaveBeenCalledWith(mocks.user, credential);
    expect(mocks.order).toEqual(["isolated-sign-in", "server-connect", "link"]);
    expect(mocks.user.reload).toHaveBeenCalled();
  });

  it("changes nothing when the user declines", async () => {
    await expect(linkGoogleToCurrentUser(async () => false)).resolves.toBe("cancelled");
    expect(mocks.signInWithCredential).not.toHaveBeenCalled();
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.linkWithCredential).not.toHaveBeenCalled();
  });

  it("does not link when the server refuses the connection", async () => {
    const refusal = { code: "functions/failed-precondition", details: { reason: "social-account-data-conflict" } };
    mocks.callable.mockRejectedValue(refusal);
    await expect(linkGoogleToCurrentUser(async () => true)).rejects.toBe(refusal);
    expect(mocks.linkWithCredential).not.toHaveBeenCalled();
  });

  it("stops if the signed-in account changed during confirmation", async () => {
    await expect(linkGoogleToCurrentUser(async () => { mocks.current = { uid: "other" }; return true; })).rejects.toThrow("auth/user-changed");
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.linkWithCredential).not.toHaveBeenCalled();
  });

  it("rethrows other popup errors", async () => {
    mocks.linkWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    await expect(linkGoogleToCurrentUser(async () => true)).rejects.toMatchObject({ code: "auth/popup-closed-by-user" });
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});
