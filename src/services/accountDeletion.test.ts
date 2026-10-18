import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "owner", getIdToken: vi.fn() } as { uid: string; getIdToken: ReturnType<typeof vi.fn>; providerData?: Array<{ providerId: string }>; getIdTokenResult?: ReturnType<typeof vi.fn> } | null },
  startSocial: vi.fn(),
  appCheck: vi.fn(), ready: vi.fn(), call: vi.fn(), getFunctions: vi.fn(() => ({ region: "asia-northeast3" })), reauth: vi.fn(),
}));
vi.mock("./firebase", () => ({ auth: mocks.auth, ensureAppCheckReady: mocks.ready, functions: { app: { options: { projectId: "test-project" } } }, getAppCheckToken: mocks.appCheck, googleProvider: {} }));
vi.mock("./runtimeConfig", () => ({ getRuntimeConfig: () => ({ appEnvironment: "production" }), isEmulatorRuntime: () => false }));
vi.mock("firebase/functions", () => ({ getFunctions: mocks.getFunctions, connectFunctionsEmulator: vi.fn(), httpsCallable: (_service: unknown, name: string) => (payload: unknown) => mocks.call(name, payload) }));
vi.mock("firebase/auth", () => ({ reauthenticateWithPopup: mocks.reauth }));
vi.mock("./socialAuth", () => ({ startSocialAuth: mocks.startSocial }));
import { readAccountDeletionReceipt, saveAccountDeletionReceipt, getAccountDeletionStatus, reauthenticateAccountDeletion, requestAccountDeletion, requiresDeletionOwnerLogin, requiresDeletionReauthentication } from "./accountDeletion";

describe("account deletion callable contract", () => {
  beforeEach(() => {
    sessionStorage.clear();
    readAccountDeletionReceipt("reset-test-account");
    mocks.appCheck.mockReset().mockResolvedValue("app-check-token");
    mocks.auth.currentUser = { uid: "owner", getIdToken: vi.fn(), providerData: [{ providerId: "google.com" }] };
    mocks.startSocial.mockReset().mockResolvedValue(undefined);
    mocks.ready.mockReset().mockResolvedValue(undefined);
    mocks.call.mockReset();
    mocks.reauth.mockReset().mockResolvedValue(undefined);
  });
  it("uses the deployed region and explicit permanent-delete confirmation", async () => {
    mocks.call.mockResolvedValue({ data: { state: "pending", requestedAtMs: 1 } });
    await expect(requestAccountDeletion()).resolves.toEqual({ state: "pending", requestedAtMs: 1 });
    expect(mocks.getFunctions).toHaveBeenCalledWith({ options: { projectId: "test-project" } }, "asia-northeast3");
    expect(mocks.call).toHaveBeenCalledWith("requestAccountDeletion", { confirmation: "DELETE" });
  });
  it("does not submit if the account changed while App Check was preparing", async () => {
    mocks.ready.mockImplementation(async () => { mocks.auth.currentUser = { uid: "other", getIdToken: vi.fn() }; });
    await expect(requestAccountDeletion()).rejects.toThrow("account_changed");
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("maps an absent job to no request without claiming completion", async () => {
    mocks.call.mockResolvedValue({ data: { state: "none" } });
    await expect(getAccountDeletionStatus()).resolves.toBeNull();
  });
  it("propagates unavailable status instead of fabricating completion", async () => {
    mocks.call.mockRejectedValue({ code: "functions/unavailable" });
    await expect(getAccountDeletionStatus()).rejects.toEqual({ code: "functions/unavailable" });
  });
  it("reauthenticates Naver/Kakao-only accounts by signing in again with the same provider", async () => {
    mocks.auth.currentUser = { uid: "owner", getIdToken: vi.fn(), providerData: [], getIdTokenResult: vi.fn().mockResolvedValue({ claims: { socialProvider: "kakao" } }) };
    await reauthenticateAccountDeletion();
    expect(mocks.startSocial).toHaveBeenCalledWith("kakao", "login", "/account-deletion");
    expect(mocks.reauth).not.toHaveBeenCalled();
  });
  it("refreshes the token only after explicit reauthentication succeeds", async () => {
    await reauthenticateAccountDeletion();
    expect(mocks.reauth).toHaveBeenCalledTimes(1);
    expect(mocks.auth.currentUser?.getIdToken).toHaveBeenCalledWith(true);
    expect(requiresDeletionReauthentication({ code: "functions/failed-precondition", details: { reason: "requires-recent-login" } })).toBe(true);
    expect(requiresDeletionReauthentication({ code: "functions/unavailable" })).toBe(false);
    expect(requiresDeletionOwnerLogin({ code: "functions/permission-denied", details: { reason: "requires-owner-login" } })).toBe(true);
    expect(requiresDeletionOwnerLogin({ code: "functions/unavailable" })).toBe(false);
  });
  it("uses a receipt without Authorization even when Auth is unavailable", async () => {
    const receipt = "a".repeat(32) + "." + "b".repeat(64);
    mocks.auth.currentUser = null;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ result: { state: "complete", requestedAtMs: 1, completedAtMs: 2 } })));
    await expect(getAccountDeletionStatus(receipt)).resolves.toMatchObject({ state: "complete" });
    expect(fetchMock).toHaveBeenCalledWith("https://asia-northeast3-test-project.cloudfunctions.net/getAccountDeletionStatus", expect.objectContaining({ credentials: "omit", headers: { "Content-Type": "application/json", "X-Firebase-AppCheck": "app-check-token" }, body: JSON.stringify({ data: { receipt } }) }));
    fetchMock.mockRestore();
  });
  it("rejects invalid receipts before making a request and isolates browser receipts by account", async () => {
    await expect(getAccountDeletionStatus("invalid")).rejects.toThrow("INVALID_DELETION_RECEIPT");
    const receipt = "a".repeat(32) + "." + "b".repeat(64);
    saveAccountDeletionReceipt("owner", receipt);
    expect(readAccountDeletionReceipt()).toEqual({ owner: "owner", receipt });
    expect(readAccountDeletionReceipt("other")).toBeNull();
    expect(readAccountDeletionReceipt()).toBeNull();
  });
  it("does not accept callable errors or malformed completion as completed", async () => {
    const receipt = "a".repeat(32) + "." + "b".repeat(64);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify({ result: { state: "complete", requestedAtMs: 1 } }))).mockResolvedValueOnce(new Response(JSON.stringify({ result: { state: "complete", requestedAtMs: 1, completedAtMs: 2, providerDeletionRequested: "true" } })));
    await expect(getAccountDeletionStatus(receipt)).rejects.toThrow("DELETION_STATUS_UNAVAILABLE");
    await expect(getAccountDeletionStatus(receipt)).rejects.toThrow("DELETION_STATUS_UNAVAILABLE");
    await expect(getAccountDeletionStatus(receipt)).rejects.toThrow("DELETION_STATUS_UNAVAILABLE");
    fetchMock.mockRestore();
  });
  it("retains the accepted receipt in memory when browser storage is blocked", () => {
    const receipt = "a".repeat(32) + "." + "b".repeat(64);
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(saveAccountDeletionReceipt("owner", receipt)).toBe(false);
    expect(readAccountDeletionReceipt()).toEqual({ owner: "owner", receipt });
    expect(readAccountDeletionReceipt("other")).toBeNull();
    storage.mockRestore();
  });
});
