import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATOR_SNAPSHOT_CONNECT_MS, OPERATOR_SNAPSHOT_CREDENTIAL_MS, OPERATOR_SNAPSHOT_UNREACHABLE_MS, OPERATOR_SNAPSHOT_FIRST_FRAME_MS, OPERATOR_SNAPSHOT_MAX_BACKOFF_MS, OPERATOR_SNAPSHOT_SLOW_CONSUMER_CODE, PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, subscribeOperatorSnapshot } from "./operatorSnapshotStream";

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

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

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
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_CONNECT_MS - 1);
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

  it("does not switch to Firestore when production App Check is unavailable and keeps retrying", async () => {
    const fallback = vi.fn(() => () => {});
    const report = vi.fn();
    const appCheck = vi.fn(async () => null);
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck }, report);
    await flush();
    expect(FakeSocket.all).toHaveLength(0);
    expect(report).toHaveBeenCalledWith("operatorSnapshotStream.connect", expect.any(Error), { eventId: "official" });
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(appCheck).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });

  // 개인 연결 끊김(1006·4008 slow_consumer)은 Firestore로 넘어가지 않고 마지막 월드 화면을 둔 채 계속 재연결한다(P11, #4079).
  it.each([1006, OPERATOR_SNAPSHOT_SLOW_CONSUMER_CODE])("keeps the last world view and reconnects indefinitely after a personal drop (%i)", async code => {
    const receive = vi.fn();
    const fallback = vi.fn(() => () => {});
    const reconnecting = vi.fn();
    const report = vi.fn();
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck: async () => "attested", reconnecting }, report);
    await flush();
    FakeSocket.latest.dispatchEvent(new Event("open"));
    FakeSocket.latest.page("official", "001", 0, 1, { timestamp: 1, counts: {}, checkpoints: [], locations: [{ uid: "a" }] });
    const shown = receive.mock.calls.length;
    FakeSocket.latest.end(code);
    expect(reconnecting).toHaveBeenLastCalledWith(true);
    // 백오프는 1초부터 두 배씩 늘어 60초에서 멈추고, 횟수 제한 없이 계속한다.
    let delay = 1000;
    for (let attempt = 0; attempt < 9; attempt++) {
      await vi.advanceTimersByTimeAsync(Math.min(delay, OPERATOR_SNAPSHOT_MAX_BACKOFF_MS));
      await flush();
      expect(FakeSocket.all).toHaveLength(attempt + 2);
      // 열린 뒤 끊기는 개인 끊김은 오래 이어져도 Firestore로 넘어가지 않는다.
      FakeSocket.latest.dispatchEvent(new Event("open"));
      FakeSocket.latest.end(code);
      delay *= 2;
    }
    expect(fallback).not.toHaveBeenCalled();
    expect(receive).toHaveBeenCalledTimes(shown);
    expect(report.mock.calls.filter(([source]) => source === "operatorSnapshotStream.reconnect")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_MAX_BACKOFF_MS - 1);
    await flush();
    expect(FakeSocket.all).toHaveLength(10);
    // 온라인 복귀 시 바로 재시도하고, 완성 세대를 받으면 그대로 갱신한다.
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(FakeSocket.all).toHaveLength(11);
    FakeSocket.latest.dispatchEvent(new Event("open"));
    FakeSocket.latest.page("official", "009", 0, 1, { timestamp: 9, counts: {}, checkpoints: [], locations: [{ uid: "back" }] });
    expect(receive).toHaveBeenLastCalledWith({ timestamp: 9, counts: {}, checkpoints: [], locations: [{ uid: "back" }] });
    expect(reconnecting).toHaveBeenLastCalledWith(false);
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });

  it("reconnects instead of switching to Firestore when a reconnected socket is slow to send its first generation", async () => {
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback, undefined, vi.fn());
    await flush();
    FakeSocket.latest.dispatchEvent(new Event("open"));
    FakeSocket.latest.page("official", "001", 0, 1, { timestamp: 1, counts: {}, checkpoints: [], locations: [] });
    FakeSocket.latest.end(1006);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    FakeSocket.latest.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS);
    expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(FakeSocket.all).toHaveLength(3);
    stop();
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
    socket.dispatchEvent(new Event("open"));
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

  // 핸드셰이크가 멈춰 open이 오지 않아도 연결 제한 시간이 지나면 개인 연결 문제로 보고 백오프로 다시 연결한다(Firestore로 넘어가지 않음).
  it("reconnects without Firestore when the WebSocket handshake stalls before open", async () => {
    const report = vi.fn();
    const fallback = vi.fn(() => () => {});
    const reconnecting = vi.fn();
    const receive = vi.fn();
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck: async () => "attested", reconnecting }, report);
    await flush();
    const stalled = FakeSocket.latest;
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_CONNECT_MS - 1);
    expect(reconnecting).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(stalled.close).toHaveBeenCalled();
    expect(reconnecting).toHaveBeenLastCalledWith(true);
    expect(report).toHaveBeenCalledWith("operatorSnapshotStream.connectTimeout", expect.any(Error), { eventId: "official" });
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(FakeSocket.all).toHaveLength(2);
    // 늦게 온 이전 소켓의 close는 무시한다.
    stalled.end(1006);
    FakeSocket.latest.dispatchEvent(new Event("open"));
    FakeSocket.latest.page("official", "001", 0, 1, { timestamp: 1, counts: {}, checkpoints: [], locations: [] });
    expect(receive).toHaveBeenLastCalledWith({ timestamp: 1, counts: {}, checkpoints: [], locations: [] });
    expect(reconnecting).toHaveBeenLastCalledWith(false);
    expect(FakeSocket.all).toHaveLength(2);
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });

  it("caps credential issuance and retries a stalled token without Firestore", async () => {
    const report = vi.fn();
    const fallback = vi.fn(() => () => {});
    const getIdToken = vi.fn(() => new Promise<string>(() => {}));
    const stop = subscribeOperatorSnapshot("official", { getIdToken }, vi.fn(), vi.fn(), fallback, undefined, report);
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_CREDENTIAL_MS - 1);
    expect(report).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(report).toHaveBeenCalledWith("operatorSnapshotStream.connect", expect.any(Error), { eventId: "official" });
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(getIdToken).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
    expect(FakeSocket.all).toHaveLength(0);
    stop();
  });

  // 핸드셰이크가 한 번도 성공하지 못한 채 30초 넘게 실패하면 월드 서버 접속 불가 = 서버 장애로 보고 Firestore로 넘어간다(11-25 결정).
  it("switches to Firestore when the world stays unreachable without any open for 30 seconds", async () => {
    const fallback = vi.fn(() => () => {});
    const report = vi.fn();
    const reconnecting = vi.fn();
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck: async () => "attested", reconnecting }, report);
    await flush();
    // 연결 거부(open 없이 1006)가 1·2·4·8·16초 백오프로 이어진다: 0·1·3·7·15초 실패는 재연결,
    // 16초 백오프 중 t=30s에 타이머로 전환한다(다음 실패까지 기다리지 않음).
    for (let i = 0; i < 5; i++) {
      FakeSocket.latest.end(1006);
      expect(fallback).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000 * 2 ** i);
      await flush();
    }
    FakeSocket.latest.end(1006);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(reconnecting).toHaveBeenLastCalledWith(false);
    expect(report).toHaveBeenCalledWith("operatorSnapshotStream.unreachable", expect.any(Error), { eventId: "official", code: 1006 });
    // 그 세션은 Firestore를 유지한다.
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_MAX_BACKOFF_MS * 2);
    expect(FakeSocket.all).toHaveLength(5);
    stop();
  });

  it("restarts the unreachable window after any successful open while reconnecting", async () => {
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback, undefined, vi.fn());
    await flush();
    const step = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await flush(); };
    FakeSocket.latest.end(1006); // 0초: open 없음
    await step(1000);
    FakeSocket.latest.end(1006); // 1초: open 없음
    await step(2000);
    FakeSocket.latest.dispatchEvent(new Event("open")); // 3초: 열림 → 기간을 새로 잰다
    FakeSocket.latest.end(1006);
    await step(4000);
    FakeSocket.latest.end(1006); // 7초: 새 기간 시작
    await step(8000);
    FakeSocket.latest.end(1006); // 15초
    await step(16_000);
    FakeSocket.latest.end(1006); // 31초: 첫 실패부터는 31초지만 열린 뒤로는 24초라 재연결 유지
    expect(fallback).not.toHaveBeenCalled();
    await step(32_000);
    FakeSocket.latest.end(1006); // 63초: 새 기간 56초 → 전환
    expect(fallback).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not count credential issuance failures toward the unreachable window", async () => {
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => { throw new Error("offline"); } }, vi.fn(), vi.fn(), fallback, undefined, vi.fn());
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_UNREACHABLE_MS * 4);
    expect(FakeSocket.all).toHaveLength(0);
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });

  // Fix 1: 구세대 첫 페이지(헤더 없음)가 늦게 도착해도 오류가 아닌 무시로 처리한다.
  it("discards a stale head page missing header fields without triggering a Firestore fallback", async () => {
    const receive = vi.fn();
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback, undefined, vi.fn());
    await flush();
    // gen "002" 완성 후 deliveredVersion = "002".
    FakeSocket.latest.page("official", "002", 0, 1, { timestamp: 2, counts: {}, checkpoints: [], locations: [] });
    expect(receive).toHaveBeenCalledTimes(1);
    // 구세대 "001" 첫 페이지가 헤더(counts·checkpoints) 없이 늦게 온다. 버전 비교 먼저 → 무시.
    FakeSocket.latest.page("official", "001", 0, 1, { timestamp: 1, locations: [] });
    expect(receive).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });

  // Fix 2: 토큰 발급 대기 시간은 30초 접속 불가 판정에 포함되지 않는다.
  it("does not count slow credential issuance toward the 30-second unreachable window", async () => {
    const resolvers: Array<(t: string) => void> = [];
    const getIdToken = vi.fn(() => new Promise<string>(r => resolvers.push(r)));
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken }, vi.fn(), vi.fn(), fallback, undefined, vi.fn());
    // 각 시도마다 토큰 발급이 14초 걸린다(CREDENTIAL_MS=15s 미만).
    // 발급 시간을 소켓 시도로 착각하면 세 번째 시도(첫 소켓부터 31s)에서 Firestore로 넘어간다.
    // 올바른 구현은 소켓 생성 시각 기준이므로 세 번의 즉시 실패(≈ 0s)는 30초 미달이다.
    for (let i = 0; i < 3; i++) {
      // i=0: 14s 발급, i=1: 1s 백오프+14s 발급, i=2: 2s 백오프+14s 발급
      await vi.advanceTimersByTimeAsync(i === 0 ? 14_000 : 1000 * 2 ** (i - 1) + 14_000);
      resolvers[i]!("tok");
      await flush();
      FakeSocket.latest.end(1006);
      expect(fallback).not.toHaveBeenCalled();
    }
    stop();
  });

  // Fix 3: 첫 세대 조립 중 끊겼다가 재연결해도 Firestore로 가지 않고 다시 연결한다.
  it("reconnects instead of falling back when partial assembly is interrupted mid-first-generation", async () => {
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback, undefined, vi.fn());
    await flush();
    FakeSocket.latest.dispatchEvent(new Event("open"));
    // 첫 세대 2페이지 중 첫 페이지만 받은 뒤 끊긴다(세대 미완성).
    FakeSocket.latest.page("official", "001", 0, 2, { timestamp: 1, counts: {}, checkpoints: [], locations: [] });
    FakeSocket.latest.end(1006);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    FakeSocket.latest.dispatchEvent(new Event("open")); // 재연결 성공
    // 6초 뒤 첫 세대가 완성되지 않아도 Firestore 아닌 재연결한다(페이지를 받기 시작했으므로 개인 끊김 규칙).
    await vi.advanceTimersByTimeAsync(OPERATOR_SNAPSHOT_FIRST_FRAME_MS + 1);
    expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(FakeSocket.all).toHaveLength(3);
    stop();
  });

  // Fix 4: 백오프 중에 30초 판정 시각이 지나면 다음 실패까지 기다리지 않고 타이머로 즉시 전환한다.
  it("switches to Firestore at the 30-second mark mid-backoff without waiting for the next failure", async () => {
    const fallback = vi.fn(() => () => {});
    const report = vi.fn();
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck: async () => "attested" }, report);
    await flush();
    // 0·1·3·7초 실패 → t=15s에 5번째 실패, 16초 백오프 시작. 30초는 15초 뒤인 t=30s.
    for (let i = 0; i < 4; i++) {
      FakeSocket.latest.end(1006);
      await vi.advanceTimersByTimeAsync(1000 * 2 ** i);
      await flush();
    }
    FakeSocket.latest.end(1006); // t=15s: 16초 백오프 시작, 타이머를 15s 후(t=30s)에 세팅
    expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(14_999); // t=29.999s: 직전
    expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); // t=30s: 타이머 발동
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("operatorSnapshotStream.unreachable", expect.any(Error), expect.objectContaining({ eventId: "official" }));
    stop();
  });

  // MAJOR 1 fix: retryNow는 unreachableTimer를 취소하지 않는다.
  // 월드가 여전히 다운이면 t=30에 그대로 Firestore로 전환하고(빠른 전환),
  // 월드가 복귀하면 open 핸들러에서 타이머를 취소한다(경쟁 조건 없음).
  it("fires the unreachable timer even when retryNow has accelerated a reconnect", async () => {
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck: async () => "attested" }, vi.fn());
    await flush();
    // 5회 실패: t=0,1,3,7,15. 5번째 실패 후 delay=16s, unreachableTimer=15s(t=30) 세팅.
    for (let i = 0; i < 4; i++) {
      FakeSocket.latest.end(1006);
      await vi.advanceTimersByTimeAsync(1000 * 2 ** i);
      await flush();
    }
    FakeSocket.latest.end(1006); // t=15: 16초 백오프 + unreachableTimer(t=30) 세팅
    // t=28s — online 이벤트. retryNow가 재시도만 취소, unreachableTimer는 유지.
    await vi.advanceTimersByTimeAsync(13_000); // t=28
    window.dispatchEvent(new Event("online"));
    await flush(); // 새 소켓 생성, open은 오지 않음(월드 여전히 다운)
    // t=30s — 타이머 발동. 월드 접속 불가로 Firestore 전환. 연결 타임아웃(t=34)보다 4초 빠름.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fallback).toHaveBeenCalledTimes(1);
    stop();
  });

  // retryNow 뒤 open이 오면 open 핸들러가 unreachableTimer를 취소한다.
  it("does not fall back when the reconnect from retryNow opens before the unreachable timer fires", async () => {
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, vi.fn(), vi.fn(), fallback,
      { endpoint: PRODUCTION_OPERATOR_SNAPSHOT_ENDPOINT, appCheck: async () => "attested" }, vi.fn());
    await flush();
    for (let i = 0; i < 4; i++) {
      FakeSocket.latest.end(1006);
      await vi.advanceTimersByTimeAsync(1000 * 2 ** i);
      await flush();
    }
    FakeSocket.latest.end(1006); // t=15: unreachableTimer(t=30) 세팅
    await vi.advanceTimersByTimeAsync(13_000); // t=28
    window.dispatchEvent(new Event("online"));
    await flush();
    // 새 소켓에서 open 수신(t=29) → open 핸들러가 unreachableTimer 취소 + unreachableSince 초기화.
    FakeSocket.latest.dispatchEvent(new Event("open"));
    await vi.advanceTimersByTimeAsync(2_000); // t=31
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });

  // MAJOR 2 fix: 발급 실패 경로에서도 unreachableSince 보정이 적용된다.
  it("excludes failed credential issuance time from the 30-second unreachable window", async () => {
    // 첫 소켓(call 0)은 credentials 즉시 성공 → 소켓 생성 → open 없이 실패 → unreachableSince 세팅.
    // 이후 두 번(call 1, 2)은 13초 대기 후 발급 실패 → 보정 없이는 t=29s에 1s 타이머 발동 → Firestore.
    // 보정 있으면 unreachableSince가 발급 시간만큼 밀려 타이머가 발동하지 않는다.
    let call = 0;
    const getIdToken = vi.fn(() => {
      const c = call++;
      if (c === 1 || c === 2) return new Promise<string>((_, reject) => setTimeout(() => reject(new Error("slow fail")), 13_000));
      return Promise.resolve("tok");
    });
    const fallback = vi.fn(() => () => {});
    const stop = subscribeOperatorSnapshot("official", { getIdToken }, vi.fn(), vi.fn(), fallback, undefined, vi.fn());
    await flush(); // call 0 성공 → socket 1 생성
    FakeSocket.latest.end(1006); // socket 1: open 없이 닫힘 → unreachableSince=0, delay=1s
    await flush();
    // 1초 백오프 뒤 call 1: 13초 대기 후 실패 → t=14s. 보정 후 unreachableSince=13.
    await vi.advanceTimersByTimeAsync(1_000 + 13_000); // t=14
    await flush();
    expect(fallback).not.toHaveBeenCalled();
    // 2초 백오프 뒤 call 2: 13초 대기 후 실패 → t=29s. 보정 후 unreachableSince=26.
    // 보정 없으면 remaining=1s < delay=4s → unreachableTimer 발동 → Firestore.
    await vi.advanceTimersByTimeAsync(2_000 + 13_000); // t=29
    await flush();
    await vi.advanceTimersByTimeAsync(2_000); // t=31 (보정 없었다면 t=30에 Firestore 전환)
    expect(fallback).not.toHaveBeenCalled();
    stop();
  });

  // Fix 5: null JSON 프레임은 디코딩 오류로 처리해 Firestore로 넘어간다(P12).
  it("treats a null JSON frame as a decode error and falls back to Firestore", async () => {
    const receive = vi.fn();
    const fallback = vi.fn(() => () => {});
    subscribeOperatorSnapshot("official", { getIdToken: async () => "id-token" }, receive, vi.fn(), fallback, undefined, vi.fn());
    await flush();
    FakeSocket.latest.dispatchEvent(new Event("open"));
    FakeSocket.latest.page("official", "001", 0, 1, { timestamp: 1, counts: {}, checkpoints: [], locations: [] });
    expect(receive).toHaveBeenCalledTimes(1);
    // 서버가 "null" 문자열을 보낸다.
    FakeSocket.latest.dispatchEvent(new MessageEvent("message", { data: "null" }));
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenLastCalledWith(null);
  });
});
