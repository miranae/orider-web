import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockCallableInvocations, setCallableResult } from "../../__tests__/mocks/firebase";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady } from "../../services/firebase";
import { getGroupInviteCode, regenerateGroupInviteCode } from "./groupInviteAdmin";

beforeEach(() => {
  mockCallableInvocations.length = 0;
  vi.mocked(httpsCallable).mockClear();
  vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
});

describe.each([
  ["getGroupInviteCode", getGroupInviteCode],
  ["regenerateGroupInviteCode", regenerateGroupInviteCode],
] as const)("%s App Check readiness", (name, invoke) => {
  it("waits for a valid App Check token before creating the secured callable", async () => {
    const result = { inviteCode: "ABCD-EFGH", expiresAt: 123, useLimit: 10, useCount: 2 };
    setCallableResult(name, { data: result });
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValue(new Promise<void>((resolve) => { resolveReady = resolve; }));
    const pending = invoke("qa-group");
    expect(ensureAppCheckReady).toHaveBeenCalledOnce();
    expect(httpsCallable).not.toHaveBeenCalled();
    resolveReady();
    await expect(pending).resolves.toEqual(result);
    expect(mockCallableInvocations).toEqual([{ name, data: { groupId: "qa-group" } }]);
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), name);
  });

  it("does not send an unauthenticated callable when token readiness fails", async () => {
    const error = new Error("app-check/token-timeout");
    vi.mocked(ensureAppCheckReady).mockRejectedValue(error);
    await expect(invoke("qa-group")).rejects.toBe(error);
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});
