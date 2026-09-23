import { captureError } from "./sentry";
import { mockCallableInvocations } from "../__tests__/mocks/firebase";
import { __resetClientErrorDedupeForTests, logClientError } from "./errorLogger";
import { ensureAppCheckReady } from "./firebase";

vi.mock("./sentry", () => ({ captureError: vi.fn() }));

describe("logClientError", () => {
  beforeEach(() => {
    __resetClientErrorDedupeForTests();
    vi.mocked(captureError).mockClear();
    vi.mocked(ensureAppCheckReady).mockReset().mockResolvedValue(undefined);
  });

  it("sends an identical immediate error only once", async () => {
    const error = new Error("INTERNAL ASSERTION FAILED: Unexpected state");

    for (let i = 0; i < 20; i += 1) {
      logClientError("useActivities.initialLoad.first", error, { attempt: i });
    }

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(ensureAppCheckReady).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(1);
    });
  });

  it("does not merge different sources", async () => {
    const error = new Error("same message");

    logClientError("source.a", error);
    logClientError("source.b", error);

    expect(captureError).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(2);
    });
  });

  it("waits for App Check without blocking the caller before invoking the callable", async () => {
    let resolveReady!: () => void;
    vi.mocked(ensureAppCheckReady).mockReturnValueOnce(new Promise<void>((resolve) => { resolveReady = resolve; }));

    logClientError("source.pending", new Error("pending"));

    expect(captureError).toHaveBeenCalledTimes(1);
    expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(0);

    resolveReady();
    await vi.waitFor(() => {
      expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(1);
    });
  });

  it("keeps Sentry-only logging when App Check readiness rejects", async () => {
    vi.mocked(ensureAppCheckReady).mockRejectedValueOnce(new Error("app-check/token-timeout"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logClientError("source.rejected", new Error("rejected"));

    expect(captureError).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(ensureAppCheckReady).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(mockCallableInvocations.filter(({ name }) => name === "logClientError")).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
