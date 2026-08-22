import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  httpsCallable: vi.fn(),
  logClientError: vi.fn(),
}));

vi.mock("firebase/functions", () => ({ httpsCallable: mocks.httpsCallable }));
vi.mock("./firebase", () => ({ functions: { app: "functions" } }));
vi.mock("./errorLogger", () => ({
  logClientError: (...args: unknown[]) => mocks.logClientError(...args),
}));

import { updateCanonicalFtp } from "./ftpProfileClient";

describe("updateCanonicalFtp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.httpsCallable.mockReturnValue(mocks.callable);
    mocks.callable.mockResolvedValue({
      data: { ok: true, applied: true, ftp: 265, mutationId: "mutation-1", cacheSync: "async" },
    });
  });

  it("routes FTP changes through the canonical server command", async () => {
    await expect(updateCanonicalFtp("uid-1", 265, "detected", "mutation-1")).resolves.toMatchObject({
      applied: true,
      ftp: 265,
    });
    expect(mocks.httpsCallable).toHaveBeenCalledWith({ app: "functions" }, "updateFtp");
    expect(mocks.callable).toHaveBeenCalledWith({
      expectedUid: "uid-1",
      ftp: 265,
      source: "detected",
      mutationId: "mutation-1",
    });
  });

  it("uses the same command to clear the canonical FTP", async () => {
    mocks.callable.mockResolvedValue({
      data: { ok: true, applied: true, ftp: null, mutationId: "mutation-clear", cacheSync: "async" },
    });
    await updateCanonicalFtp("uid-1", null, "manual", "mutation-clear");
    expect(mocks.callable).toHaveBeenCalledWith({
      expectedUid: "uid-1",
      ftp: null,
      source: "manual",
      mutationId: "mutation-clear",
    });
  });

  it("logs command provenance before rethrowing a callable failure", async () => {
    const error = new Error("offline");
    mocks.callable.mockRejectedValue(error);

    await expect(
      updateCanonicalFtp("uid-1", 260, "test", "mutation-failed"),
    ).rejects.toThrow("offline");
    expect(mocks.logClientError).toHaveBeenCalledWith(
      "ftpProfileClient.updateCanonicalFtp",
      error,
      {
        operation: "updateFtp",
        expectedUid: "uid-1",
        ftp: 260,
        source: "test",
        mutationId: "mutation-failed",
      },
    );
  });
});
