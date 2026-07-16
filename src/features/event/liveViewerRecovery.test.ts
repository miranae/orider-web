import { describe, expect, it, vi } from "vitest";
import {
  LIVE_VIEWER_RECOVERY_COOLDOWN_MS,
  createViewerHeartbeatRunner,
  isRecoverableViewerAuthError,
} from "./liveViewerRecovery";

describe("live viewer heartbeat recovery", () => {
  it("forces App Check once and retries one time after a missing-token 401", async () => {
    const sendHeartbeat = vi.fn()
      .mockRejectedValueOnce({ code: "functions/unauthenticated", message: "401" })
      .mockResolvedValueOnce(undefined);
    const ensureAppCheckReady = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const runner = createViewerHeartbeatRunner({ sendHeartbeat, ensureAppCheckReady, onError });

    await expect(runner.pulse()).resolves.toBe("recovered");
    expect(ensureAppCheckReady).toHaveBeenNthCalledWith(1);
    expect(ensureAppCheckReady).toHaveBeenNthCalledWith(2, true);
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("bounds refresh and error logging while an authentication failure persists", async () => {
    let current = 10_000;
    const sendHeartbeat = vi.fn().mockRejectedValue({ code: "functions/unauthenticated" });
    const ensureAppCheckReady = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const runner = createViewerHeartbeatRunner({
      sendHeartbeat,
      ensureAppCheckReady,
      onError,
      now: () => current,
    });

    await expect(runner.pulse()).resolves.toBe("failed");
    current += 30_000;
    await expect(runner.pulse()).resolves.toBe("cooldown");

    expect(ensureAppCheckReady.mock.calls.filter(([force]) => force === true)).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);

    current += LIVE_VIEWER_RECOVERY_COOLDOWN_MS;
    await expect(runner.pulse()).resolves.toBe("failed");
    expect(ensureAppCheckReady.mock.calls.filter(([force]) => force === true)).toHaveLength(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("does not send from a hidden tab and resumes when it becomes visible", async () => {
    let visible = false;
    const sendHeartbeat = vi.fn().mockResolvedValue(undefined);
    const runner = createViewerHeartbeatRunner({
      sendHeartbeat,
      ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
      onError: vi.fn(),
      isVisible: () => visible,
    });

    await expect(runner.pulse()).resolves.toBe("hidden");
    visible = true;
    await expect(runner.pulse()).resolves.toBe("sent");
    expect(sendHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight request for overlapping timer and visibility events", async () => {
    let resolveHeartbeat!: () => void;
    const sendHeartbeat = vi.fn(() => new Promise<void>((resolve) => { resolveHeartbeat = resolve; }));
    const runner = createViewerHeartbeatRunner({
      sendHeartbeat,
      ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
      onError: vi.fn(),
    });

    const first = runner.pulse();
    await Promise.resolve();
    await expect(runner.pulse()).resolves.toBe("in-flight");
    resolveHeartbeat();
    await expect(first).resolves.toBe("sent");
    expect(sendHeartbeat).toHaveBeenCalledTimes(1);
  });

  it("does not classify ordinary backend failures as App Check recovery candidates", () => {
    expect(isRecoverableViewerAuthError({ code: "functions/internal" })).toBe(false);
    expect(isRecoverableViewerAuthError(new Error("App Check token missing"))).toBe(true);
  });
});
