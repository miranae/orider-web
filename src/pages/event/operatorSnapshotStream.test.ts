import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeOperatorSnapshot } from "./operatorSnapshotStream";

class FakeSocket extends EventTarget {
  static CLOSING = 2;
  static latest: FakeSocket;
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  constructor() { super(); FakeSocket.latest = this; }
  frame(eventId: string, snapshot: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ v: 1, type: "operator_snapshot", eventId, snapshot }) }));
  }
  end(code: number) {
    const event = new Event("close");
    Object.assign(event, { code });
    this.dispatchEvent(event);
  }
}

describe("operator snapshot stream", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("WebSocket", FakeSocket); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("receives the official snapshot for the selected event and restores Firestore after transport loss", async () => {
    const receive = vi.fn();
    const stopFallback = vi.fn();
    const fallback = vi.fn(() => stopFallback);
    const denied = vi.fn();
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "demo-token" }, receive, denied, fallback);
    await Promise.resolve();
    const socket = FakeSocket.latest;
    socket.dispatchEvent(new Event("open"));
    expect(JSON.parse(socket.send.mock.calls[0]![0])).toEqual({ v: 1, type: "operator_snapshot_subscribe", eventId: "official", token: "demo-token" });
    const snapshot = { timestamp: 1, counts: { sos: 1 }, checkpoints: [], locations: [] };
    socket.frame("other", snapshot);
    socket.frame("official", snapshot);
    expect(receive.mock.calls).toEqual([[snapshot]]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fallback).not.toHaveBeenCalled();
    socket.end(1013);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenLastCalledWith(null);
    socket.frame("official", snapshot);
    expect(receive).toHaveBeenCalledTimes(2);
    stop();
    expect(stopFallback).toHaveBeenCalledTimes(1);
  });

  it("clears the operator view through the authorization handler when access is revoked", async () => {
    const denied = vi.fn();
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "demo-token" }, vi.fn(), denied, fallback);
    await Promise.resolve();
    FakeSocket.latest.end(4003);
    await vi.advanceTimersByTimeAsync(3000);
    expect(denied).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });
});
