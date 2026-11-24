import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATOR_SNAPSHOT_FIRST_FRAME_MS, PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, subscribeOperatorSnapshot } from "./operatorSnapshotStream";

class FakeSocket extends EventTarget {
  static CLOSING = 2;
  static all: FakeSocket[] = [];
  static get latest() { return FakeSocket.all.at(-1)!; }
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  constructor(readonly url: string) { super(); FakeSocket.all.push(this); }
  message(frame: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }));
  }
  page(eventId: string, version: string, page: number, pages: number, snapshot: unknown) {
    this.message({ v: 1, type: "operator_snapshot", eventId, version, page, pages, snapshot });
  }
  end(code: number) {
    const event = new Event("close");
    Object.assign(event, { code });
    this.dispatchEvent(event);
  }
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("operator snapshot stream", () => {
  beforeEach(() => { FakeSocket.all = []; vi.useFakeTimers(); vi.stubGlobal("WebSocket", FakeSocket); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("assembles paged official snapshots and switches to Firestore only after transport loss", async () => {
    const receive = vi.fn();
    const stopFallback = vi.fn();
    const fallback = vi.fn(() => stopFallback);
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck: async () => "attested" });
    await flush();
    const socket = FakeSocket.latest;
    expect(socket.url).toBe(PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT);
    socket.dispatchEvent(new Event("open"));
    expect(JSON.parse(socket.send.mock.calls[0]![0])).toEqual({ v: 1, type: "operator_snapshot_subscribe", eventId: "official", token: "id-token", appCheck: "attested" });
    socket.page("other", "001", 0, 1, { timestamp: 1, locations: [] });
    socket.page("official", "001", 1, 2, { locations: [{ uid: "b" }] });
    expect(receive).not.toHaveBeenCalled();
    socket.page("official", "001", 0, 2, { timestamp: 1, counts: { total: 2 }, checkpoints: [], locations: [{ uid: "a" }] });
    expect(receive).toHaveBeenLastCalledWith({ timestamp: 1, counts: { total: 2 }, checkpoints: [], locations: [{ uid: "a" }, { uid: "b" }] });
    // 새 세대가 오면 이전 세대의 남은 페이지는 버린다.
    socket.page("official", "002", 0, 2, { timestamp: 2, counts: {}, checkpoints: [], locations: [{ uid: "c" }] });
    socket.page("official", "003", 0, 1, { timestamp: 3, counts: {}, checkpoints: [], locations: [] });
    expect(receive).toHaveBeenLastCalledWith({ timestamp: 3, counts: {}, checkpoints: [], locations: [] });
    socket.message({ v: 1, type: "operator_snapshot", eventId: "official", version: null, snapshot: null });
    expect(receive).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS * 2);
    expect(fallback).not.toHaveBeenCalled();
    socket.end(1013);
    expect(fallback).toHaveBeenCalledTimes(1);
    const calls = receive.mock.calls.length;
    socket.page("official", "004", 0, 1, { timestamp: 4, locations: [] });
    expect(receive).toHaveBeenCalledTimes(calls);
    stop();
    expect(stopFallback).toHaveBeenCalledTimes(1);
  });

  it("falls back when the first generation does not arrive in time", async () => {
    const fallback = vi.fn(() => () => {});
    subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback);
    await flush();
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS + 1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("reconnects once with fresh credentials when authentication expires", async () => {
    const getIdToken = vi.fn(async (force?: boolean) => force ? "fresh" : "stale");
    const fallback = vi.fn(() => () => {});
    subscribeOperatorSnapshot("official", { getIdToken }, vi.fn(), vi.fn(), fallback);
    await flush();
    FakeSocket.latest.end(4001);
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    expect(getIdToken).toHaveBeenLastCalledWith(true);
    expect(fallback).not.toHaveBeenCalled();
    FakeSocket.latest.end(4001);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("clears the operator view through the authorization handler when access is revoked", async () => {
    const denied = vi.fn();
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "demo-token" }, vi.fn(), denied, fallback);
    await flush();
    FakeSocket.latest.end(4003);
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS * 2);
    expect(denied).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });

  it("refuses to connect to production without App Check", async () => {
    const fallback = vi.fn(() => () => {});
    const report = vi.fn();
    subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck: async () => null }, report);
    await flush();
    expect(FakeSocket.all).toHaveLength(0);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
