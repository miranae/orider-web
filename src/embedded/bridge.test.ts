import { describe, expect, it, vi } from "vitest";
import {
  EMBEDDED_BRIDGE_MAX_BYTES,
  HOST_MESSAGE_TYPES,
  WEB_MESSAGE_TYPES,
  createEmbeddedBridge,
  createWebViewTransport,
  parseHostMessage,
  serializeWebMessage,
  type EmbeddedBridgeTransport,
} from "./bridge";

function hostMessage(type: string, payload: unknown = {}): string {
  return JSON.stringify({ version: 1, type, payload });
}

function createTransport() {
  let inbound: ((message: string) => void) | undefined;
  const unsubscribe = vi.fn();
  const transport: EmbeddedBridgeTransport = {
    postMessage: vi.fn(),
    subscribe: vi.fn((listener) => {
      inbound = listener;
      return unsubscribe;
    }),
  };
  return { transport, unsubscribe, receive: (message: string) => inbound?.(message) };
}

describe("parseHostMessage", () => {
  it.each(HOST_MESSAGE_TYPES)("accepts allowed host type %s", (type) => {
    expect(parseHostMessage(hostMessage(type))).toMatchObject({
      ok: true,
      message: { version: 1, type, payload: {} },
    });
  });

  it("rejects unknown versions, types, and top-level keys", () => {
    expect(parseHostMessage(JSON.stringify({ version: 2, type: "host.retry", payload: {} })))
      .toEqual({ ok: false, reason: "unsupported-version" });
    expect(parseHostMessage(hostMessage("host.executeJavaScript")))
      .toEqual({ ok: false, reason: "unsupported-type" });
    expect(parseHostMessage(JSON.stringify({
      version: 1,
      type: "host.retry",
      payload: {},
      extra: true,
    }))).toEqual({ ok: false, reason: "invalid-envelope" });
  });

  it("rejects malformed JSON and invalid envelope shapes", () => {
    expect(parseHostMessage("{"))
      .toEqual({ ok: false, reason: "malformed-json" });
    expect(parseHostMessage(JSON.stringify({ version: 1, type: "host.retry" })))
      .toEqual({ ok: false, reason: "invalid-envelope" });
    expect(parseHostMessage(JSON.stringify({ version: 1, type: "host.retry", requestId: 7, payload: {} })))
      .toEqual({ ok: false, reason: "invalid-envelope" });
  });

  it("measures the raw message as UTF-8 and rejects more than 16 KiB", () => {
    const oversized = hostMessage("host.retry", "한".repeat(EMBEDDED_BRIDGE_MAX_BYTES));
    expect(parseHostMessage(oversized)).toEqual({ ok: false, reason: "message-too-large" });
  });
});

describe("embedded bridge", () => {
  it.each(WEB_MESSAGE_TYPES)("serializes allowed web type %s", (type) => {
    expect(JSON.parse(serializeWebMessage(type, { ok: true }, "request-1"))).toEqual({
      version: 1,
      type,
      requestId: "request-1",
      payload: { ok: true },
    });
  });

  it("rejects unsupported outbound types and oversized messages", () => {
    expect(() => serializeWebMessage("host.retry" as never, {}))
      .toThrow("embedded-bridge/unsupported-type");
    expect(() => serializeWebMessage("telemetry.event", "한".repeat(EMBEDDED_BRIDGE_MAX_BYTES)))
      .toThrow("embedded-bridge/message-too-large");
    expect(() => serializeWebMessage("telemetry.event", { toJSON: () => undefined }))
      .toThrow("embedded-bridge/invalid-envelope");
  });

  it("delivers only validated host messages and reports rejection without payload", () => {
    const { transport, receive } = createTransport();
    const rejected = vi.fn();
    const listener = vi.fn();
    const bridge = createEmbeddedBridge(transport, rejected);
    bridge.subscribe(listener);

    receive(hostMessage("host.retry", { secret: "must-not-be-logged" }));
    receive(hostMessage("host.executeJavaScript", { secret: "must-not-be-logged" }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(rejected).toHaveBeenCalledWith("unsupported-type");
    expect(JSON.stringify(rejected.mock.calls)).not.toContain("must-not-be-logged");
  });

  it("uses only the serialized postMessage transport and disposes cleanly", () => {
    const { transport, unsubscribe } = createTransport();
    const bridge = createEmbeddedBridge(transport);
    bridge.send("bootstrap.ready", { contractVersion: 1 });

    expect(transport.postMessage).toHaveBeenCalledWith(JSON.stringify({
      version: 1,
      type: "bootstrap.ready",
      payload: { contractVersion: 1 },
    }));
    bridge.dispose();
    bridge.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("rejects window messages sourced from child frames", () => {
    const listener = vi.fn();
    const transport = createWebViewTransport(window);
    const unsubscribe = transport.subscribe(listener);
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    window.dispatchEvent(new MessageEvent("message", {
      data: hostMessage("host.retry"),
      source: iframe.contentWindow,
    }));
    window.dispatchEvent(new MessageEvent("message", {
      data: hostMessage("host.retry"),
      source: window,
    }));

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    iframe.remove();
  });
});
