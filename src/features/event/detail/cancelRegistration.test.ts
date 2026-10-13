import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getAppCheckToken } from "../../../services/firebase";
import { mockCallableInvocations, setCallableImplementation, setCallableResult, simulateLogin, simulateLogout } from "../../../__tests__/mocks/firebase";
import { cancelEventRegistration } from "./cancelRegistration";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("cancelEventRegistration", () => {
  beforeEach(() => {
    mockCallableInvocations.length = 0;
    vi.mocked(httpsCallable).mockClear();
    simulateLogin({ uid: "cancel-owner" });
    vi.mocked(getAppCheckToken).mockResolvedValue("test-app-check-token");
    setCallableResult("cancelRegistration", { data: { success: true } });
  });

  it("accepts the deployed success response and invokes the transaction once", async () => {
    await cancelEventRegistration("event-1");
    expect(mockCallableInvocations).toEqual([{ name: "cancelRegistration", data: { eventId: "event-1" } }]);
  });

  it("does not report success for an invalid response", async () => {
    setCallableResult("cancelRegistration", { data: { success: false } });
    await expect(cancelEventRegistration("event-1")).rejects.toThrow("cancel-registration-failed");
  });

  it("awaits the cold bundled token before constructing a callable or dispatching the unchanged payload", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    const result = cancelEventRegistration("event-1");
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(mockCallableInvocations).toHaveLength(0);
    ready.resolve("cold-token");
    await result;
    expect(httpsCallable).toHaveBeenCalledTimes(1);
    expect(mockCallableInvocations).toEqual([{ name: "cancelRegistration", data: { eventId: "event-1" } }]);
  });

  it("fails closed on an empty App Check token with no constructed callable or write", async () => {
    vi.mocked(getAppCheckToken).mockResolvedValueOnce(null);
    await expect(cancelEventRegistration("event-1")).rejects.toThrow("app-check/empty-token");
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(mockCallableInvocations).toHaveLength(0);
  });

  it("preserves token rejection identity, never dispatches, and allows a fresh explicit retry", async () => {
    const error = new Error("app-check/token-timeout");
    vi.mocked(getAppCheckToken).mockRejectedValueOnce(error);
    await expect(cancelEventRegistration("event-1")).rejects.toBe(error);
    expect(mockCallableInvocations).toHaveLength(0);
    await cancelEventRegistration("event-1");
    expect(mockCallableInvocations).toHaveLength(1);
  });

  it("rejects an account change during token preparation before callable construction", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    const result = cancelEventRegistration("event-1");
    simulateLogin({ uid: "another-owner" });
    ready.resolve("late-token");
    await expect(result).rejects.toThrow("AUTH_CONTEXT_CHANGED");
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(mockCallableInvocations).toHaveLength(0);
  });

  it("retains monotonic Auth changes when the original UID returns before readiness settles", async () => {
    const ready = deferred<string | null>();
    vi.mocked(getAppCheckToken).mockReturnValueOnce(ready.promise);
    const result = cancelEventRegistration("event-1");
    simulateLogout();
    simulateLogin({ uid: "cancel-owner" });
    ready.resolve("old-session-token");
    await expect(result).rejects.toThrow("AUTH_CONTEXT_CHANGED");
    expect(httpsCallable).not.toHaveBeenCalled();
    expect(mockCallableInvocations).toHaveLength(0);
  });

  it("preserves the original callable error object with one dispatch and no automatic retry", async () => {
    const error = Object.assign(new Error("original cancellation failure"), { code: "functions/failed-precondition" });
    setCallableImplementation("cancelRegistration", () => { throw error; });
    await expect(cancelEventRegistration("event-1")).rejects.toBe(error);
    expect(mockCallableInvocations).toHaveLength(1);
  });

  it("does not start preparation without a current authenticated UID", async () => {
    simulateLogout();
    vi.mocked(getAppCheckToken).mockClear();
    await expect(cancelEventRegistration("event-1")).rejects.toThrow("SIGN_IN_REQUIRED");
    expect(getAppCheckToken).not.toHaveBeenCalled();
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it("unsubscribes the per-request Auth observer when readiness rejects", async () => {
    const unsubscribe = vi.fn();
    vi.mocked(onAuthStateChanged).mockImplementationOnce((_auth, callback) => {
      if (typeof callback === "function") callback({ uid: "cancel-owner" } as User);
      return unsubscribe;
    });
    vi.mocked(getAppCheckToken).mockRejectedValueOnce(new Error("readiness rejected"));
    await expect(cancelEventRegistration("event-1")).rejects.toThrow("readiness rejected");
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
