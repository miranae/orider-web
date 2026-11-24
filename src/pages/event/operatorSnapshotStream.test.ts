import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATOR_SNAPSHOT_FIRST_FRAME_MS, OPERATOR_SNAPSHOT_MAX_BACKOFF_MS, OPERATOR_SNAPSHOT_RECONNECT_LIMIT, OPERATOR_SNAPSHOT_SLOW_CONSUMER_CODE, PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, subscribeOperatorSnapshot } from "./operatorSnapshotStream";

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
    FakeSocket.latest.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS + 1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("starts the first-generation timer only after the subscription is sent, not while credentials are issued", async () => {
    let issue: (token: string) => void = () => {};
    const fallback = vi.fn(() => () => {});
    subscribeOperatorSnapshot("official", { getIdToken: () => new Promise<string>(resolve => { issue = resolve; }) }, vi.fn(), vi.fn(), fallback);
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS * 2);
    expect(fallback).not.toHaveBeenCalled();
    issue("id-token");
    await flush();
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS * 2);
    expect(fallback).not.toHaveBeenCalled();
    FakeSocket.latest.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS - 1);
    expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("treats a head page without checkpoints or counts as a decoding error and falls back to Firestore", async () => {
    for (const head of [{ timestamp: 1, counts: {}, locations: [] }, { timestamp: 1, checkpoints: [], locations: [] },
      { counts: {}, checkpoints: [], locations: [] }, { timestamp: 1, counts: {}, checkpoints: [], locations: [null] }]) {
      FakeSocket.all = [];
      const receive = vi.fn();
      const fallback = vi.fn(() => () => {});
      const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback, undefined, vi.fn());
      await flush();
      FakeSocket.latest.page("official", "001", 0, 1, head);
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(receive.mock.calls.every(([value]) => value === null)).toBe(true);
      stop();
    }
  });

  it("does not redraw a generation withdrawn by a location privacy revocation", async () => {
    const receive = vi.fn();
    subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), vi.fn(() => () => {}));
    await flush();
    const socket = FakeSocket.latest;
    socket.page("official", "005", 0, 1, { timestamp: 5, counts: {}, checkpoints: [], locations: [{ uid: "before" }] });
    socket.page("official", "006", 0, 2, { timestamp: 6, counts: {}, checkpoints: [], locations: [{ uid: "partial" }] });
    socket.message({ v: 1, type: "operator_snapshot", eventId: "official", version: null, snapshot: null });
    expect(receive).toHaveBeenLastCalledWith(null);
    socket.page("official", "005", 0, 1, { timestamp: 5, counts: {}, checkpoints: [], locations: [{ uid: "before" }] });
    socket.page("official", "006", 1, 2, { locations: [{ uid: "partial-b" }] });
    socket.page("official", "006", 0, 2, { timestamp: 6, counts: {}, checkpoints: [], locations: [{ uid: "partial" }] });
    expect(receive).toHaveBeenLastCalledWith(null);
    socket.page("official", "007", 0, 1, { timestamp: 7, counts: {}, checkpoints: [], locations: [{ uid: "after" }] });
    expect(receive).toHaveBeenLastCalledWith({ timestamp: 7, counts: {}, checkpoints: [], locations: [{ uid: "after" }] });
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
    expect(report).toHaveBeenCalledWith("operatorSnapshotStream.connect", expect.any(Error), { eventId: "official" });
  });

  // 느린 소켓(4008)은 1013(서버 장애)과 달리 개별 끊김이라 1006과 같은 횟수·백오프로 재연결한다(#4079).
  it.each([1006, OPERATOR_SNAPSHOT_SLOW_CONSUMER_CODE])("reconnects after a personal connection drop (%i), shows Firestore temporarily after the limit and returns to the world", async code => {
    const receive = vi.fn();
    const stopFallback = vi.fn();
    const fallback = vi.fn(() => stopFallback);
    subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback);
    await flush();
    FakeSocket.latest.dispatchEvent(new Event("open"));
    FakeSocket.latest.page("official", "001", 0, 1, { timestamp: 1, counts: {}, checkpoints: [], locations: [{ uid: "a" }] });
    const shown = receive.mock.calls.length;
    for (let attempt = 0; attempt < OPERATOR_SNAPSHOT_RECONNECT_LIMIT; attempt++) {
      FakeSocket.latest.end(code);
      expect(fallback).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000 * 2 ** attempt);
      await flush();
    }
    expect(FakeSocket.all).toHaveLength(OPERATOR_SNAPSHOT_RECONNECT_LIMIT + 1);
    expect(receive).toHaveBeenCalledTimes(shown);
    FakeSocket.latest.end(code);
    expect(fallback).toHaveBeenCalledTimes(1);
    // Firestore 임시 표시 중에도 월드 재연결은 백오프(상한 60초)로 계속한다.
    let delay = 1000 * 2 ** OPERATOR_SNAPSHOT_RECONNECT_LIMIT;
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(Math.min(delay, OPERATOR_SNAPSHOT_MAX_BACKOFF_MS));
      await flush();
      FakeSocket.latest.end(code);
      delay *= 2;
    }
    expect(FakeSocket.all).toHaveLength(OPERATOR_SNAPSHOT_RECONNECT_LIMIT + 5);
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_MAX_BACKOFF_MS - 1);
    await flush();
    expect(FakeSocket.all).toHaveLength(OPERATOR_SNAPSHOT_RECONNECT_LIMIT + 5);
    // 온라인 복귀 시 바로 재시도하고, 첫 완성 세대를 받으면 Firestore를 끊고 월드로 되돌아간다.
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(FakeSocket.all).toHaveLength(OPERATOR_SNAPSHOT_RECONNECT_LIMIT + 6);
    expect(stopFallback).not.toHaveBeenCalled();
    FakeSocket.latest.dispatchEvent(new Event("open"));
    FakeSocket.latest.page("official", "009", 0, 1, { timestamp: 9, counts: {}, checkpoints: [], locations: [{ uid: "back" }] });
    expect(stopFallback).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenLastCalledWith({ timestamp: 9, counts: {}, checkpoints: [], locations: [{ uid: "back" }] });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("does not retry the world after a server-side close (1013) while showing Firestore", async () => {
    const fallback = vi.fn(() => () => {});
    subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback);
    await flush();
    FakeSocket.latest.end(1013);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_MAX_BACKOFF_MS * 2);
    expect(FakeSocket.all).toHaveLength(1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("rejects pages of one generation that disagree on the page count", async () => {
    const receive = vi.fn();
    const fallback = vi.fn(() => () => {});
    subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback, undefined, vi.fn());
    await flush();
    FakeSocket.latest.page("official", "001", 0, 3, { timestamp: 1, counts: {}, checkpoints: [], locations: [{ uid: "a" }] });
    FakeSocket.latest.page("official", "001", 1, 2, { locations: [{ uid: "b" }] });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenLastCalledWith(null);
  });

  it("ignores pages of an older generation that arrive interleaved with a newer one", async () => {
    const receive = vi.fn();
    const fallback = vi.fn(() => () => {});
    subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback);
    await flush();
    const socket = FakeSocket.latest;
    socket.page("official", "002", 0, 2, { timestamp: 2, counts: {}, checkpoints: [], locations: [{ uid: "old-a" }] });
    socket.page("official", "003", 0, 2, { timestamp: 3, counts: {}, checkpoints: [], locations: [{ uid: "new-a" }] });
    socket.page("official", "002", 1, 2, { locations: [{ uid: "old-b" }] });
    socket.page("official", "003", 1, 2, { locations: [{ uid: "new-b" }] });
    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenLastCalledWith({ timestamp: 3, counts: {}, checkpoints: [], locations: [{ uid: "new-a" }, { uid: "new-b" }] });
    socket.page("official", "002", 0, 1, { timestamp: 2, counts: {}, checkpoints: [], locations: [] });
    expect(receive).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS * 2);
    expect(fallback).not.toHaveBeenCalled();
  });
});
