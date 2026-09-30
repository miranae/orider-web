import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMBEDDED_BRIDGE_MAX_BYTES,
  parseHostMessage,
  serializeWebMessage,
  type HostBridgeEnvelope,
} from "./bridge";
import {
  RUN_START_SCHEDULED_CAPABILITY,
  RUN_START_TIMEOUT_MS,
  createRunStartChannel,
  parseRunStartResult,
} from "./runStartBridge";

function result(payload: unknown, requestId?: string): HostBridgeEnvelope {
  return { version: 1, type: "host.runStartResult", payload, ...(requestId === undefined ? {} : { requestId }) };
}

describe("run.startScheduled bridge contract", () => {
  it("uses a versioned capability string", () => {
    expect(RUN_START_SCHEDULED_CAPABILITY).toBe("run-start-scheduled-v1");
  });

  it("serializes run.startScheduled with its requestId and enforces the 16 KiB limit", () => {
    expect(JSON.parse(serializeWebMessage("run.startScheduled", { scheduledSessionId: "ss_1" }, "req-1"))).toEqual({
      version: 1,
      type: "run.startScheduled",
      requestId: "req-1",
      payload: { scheduledSessionId: "ss_1" },
    });
    expect(() => serializeWebMessage("run.startScheduled", {
      scheduledSessionId: "a".repeat(EMBEDDED_BRIDGE_MAX_BYTES),
    }, "req-1")).toThrow("embedded-bridge/message-too-large");
  });

  it("accepts host.runStartResult through the envelope parser", () => {
    expect(parseHostMessage(JSON.stringify({
      version: 1,
      type: "host.runStartResult",
      requestId: "req-1",
      payload: { accepted: true },
    }))).toMatchObject({ ok: true, message: { type: "host.runStartResult", requestId: "req-1" } });
  });
});

describe("parseRunStartResult", () => {
  it("parses accepted and known rejection reasons", () => {
    expect(parseRunStartResult(result({ accepted: true }, "r"))).toEqual({ requestId: "r", outcome: { accepted: true } });
    for (const reason of ["not-today", "hold", "changed", "busy", "ride-active", "offline", "unsupported"]) {
      expect(parseRunStartResult(result({ accepted: false, reason }, "r"))).toEqual({
        requestId: "r",
        outcome: { accepted: false, reason },
      });
    }
  });

  it("maps a future or missing rejection reason to unknown instead of dropping the reply", () => {
    expect(parseRunStartResult(result({ accepted: false, reason: "battery-low" }, "r"))?.outcome)
      .toEqual({ accepted: false, reason: "unknown" });
    expect(parseRunStartResult(result({ accepted: false }, "r"))?.outcome)
      .toEqual({ accepted: false, reason: "unknown" });
  });

  it.each([
    ["missing requestId", result({ accepted: true })],
    ["blank requestId", result({ accepted: true }, "  ")],
    ["oversized requestId", result({ accepted: true }, "r".repeat(129))],
    ["non-boolean accepted", result({ accepted: "true" }, "r")],
    ["extra payload key", result({ accepted: true, sessionId: "x" }, "r")],
    ["reason on success", result({ accepted: true, reason: "busy" }, "r")],
    ["non-string reason", result({ accepted: false, reason: 3 }, "r")],
    ["array payload", result([], "r")],
  ])("rejects %s", (_label, message) => {
    expect(parseRunStartResult(message)).toBeNull();
  });

  it("ignores other host message types", () => {
    expect(parseRunStartResult({ version: 1, type: "host.retry", payload: {}, requestId: "r" })).toBeNull();
  });
});

describe("createRunStartChannel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends one request per start and resolves only on the echoed requestId", async () => {
    const send = vi.fn();
    let counter = 0;
    const channel = createRunStartChannel({ send, createRequestId: () => `req-${++counter}` });
    const pending = channel.start("ss_abc");
    expect(send).toHaveBeenCalledWith({ scheduledSessionId: "ss_abc" }, "req-1");

    expect(channel.deliver(result({ accepted: true }, "req-other"))).toBe(false);
    expect(channel.deliver(result({ accepted: false, reason: "hold" }, "req-1"))).toBe(true);
    await expect(pending).resolves.toEqual({ accepted: false, reason: "hold" });
    // 같은 requestId 의 두 번째 응답은 무시한다.
    expect(channel.deliver(result({ accepted: true }, "req-1"))).toBe(false);
  });

  it("times out after 15 seconds and ignores late replies", async () => {
    vi.useFakeTimers();
    const channel = createRunStartChannel({ send: vi.fn(), createRequestId: () => "req-late" });
    const pending = channel.start("ss_abc");
    vi.advanceTimersByTime(RUN_START_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1);
    await expect(pending).resolves.toEqual({ accepted: false, reason: "timeout" });
    expect(channel.deliver(result({ accepted: true }, "req-late"))).toBe(false);
  });

  it("does not send an invalid scheduled session id", async () => {
    const send = vi.fn();
    const channel = createRunStartChannel({ send });
    await expect(channel.start("bad id/with slash")).resolves.toEqual({ accepted: false, reason: "changed" });
    await expect(channel.start("")).resolves.toEqual({ accepted: false, reason: "changed" });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports an unavailable host when the transport throws", async () => {
    const channel = createRunStartChannel({
      send: () => { throw new Error("embedded-bridge/host-unavailable"); },
    });
    await expect(channel.start("ss_abc")).resolves.toEqual({ accepted: false, reason: "unavailable" });
  });

  it("settles pending requests on dispose", async () => {
    const channel = createRunStartChannel({ send: vi.fn(), createRequestId: () => "req-d" });
    const pending = channel.start("ss_abc");
    channel.dispose();
    await expect(pending).resolves.toEqual({ accepted: false, reason: "unavailable" });
  });
});
