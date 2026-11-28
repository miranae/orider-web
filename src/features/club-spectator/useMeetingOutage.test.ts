import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { createIngressProbe, OUTAGE_POLL_MS, useMeetingOutage } from "./useMeetingOutage";
import { spectatorFixture } from "./fixtures";

const control = vi.hoisted(() => ({
  availability: vi.fn(), spectator: vi.fn(),
  services: {auth: {currentUser: {uid: "member"} as unknown}, functions: {}, ensureAppCheckReady: vi.fn(async () => {})},
}));
vi.mock("firebase/functions", () => ({httpsCallable: vi.fn((_functions: unknown, name: string) =>
  name === "getMeetingWorldAvailability" ? control.availability : control.spectator)}));
vi.mock("../../contexts/FirebaseServicesContext", () => ({useFirebaseServices: () => control.services}));
vi.mock("../../services/errorLogger", () => ({logClientError: vi.fn()}));

const viewer = control.services.auth.currentUser as User;
const snapshot = (episode: string | null) => ({data: {...spectatorFixture(Date.now()), eventId: "meeting", groupId: "club", outageEpisode: episode}});
const outage = (episode = "ep-1") => ({data: {status: "outage", episode, expiresAtMs: 20_000, serverNowMs: 8_000}});
function fakeProbe(needs = true) {
  let recovery = 0;
  return {needs, needsAuthority: vi.fn(function (this: {needs: boolean}) { return this.needs; }), recovery: () => recovery, reachable: vi.fn(() => { recovery++; })};
}
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, "hidden", {configurable: true, value: false});
});
afterEach(() => { vi.useRealTimers(); });

describe("월드 전체 장애 관전 폴백 (#4215)", () => {
  it("핸드셰이크가 계속 실패할 때만 가용성을 확인하고, 회차가 확정되면 그 회차로 4초 이상 간격 조회한다", async () => {
    const probe = fakeProbe(false);
    control.availability.mockResolvedValue(outage());
    control.spectator.mockResolvedValue(snapshot("ep-1"));
    const {result, rerender} = renderHook(({needs}) => { probe.needs = needs; return useMeetingOutage(true, "club", "meeting", viewer, null, probe); }, {initialProps: {needs: false}});
    await flush(OUTAGE_POLL_MS * 2);
    expect(control.availability).not.toHaveBeenCalled();
    rerender({needs: true});
    await flush(OUTAGE_POLL_MS);
    expect(control.availability).toHaveBeenCalledTimes(1);
    expect(control.spectator).toHaveBeenCalledWith({eventId: "meeting", selectedUid: null, outageEpisode: "ep-1"});
    expect(result.current?.episode).toBe("ep-1");
    expect(result.current?.data.locations).toHaveLength(3);
    await flush(OUTAGE_POLL_MS * 3);
    expect(control.spectator.mock.calls.length).toBeLessThanOrEqual(4);
    expect(control.spectator.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("서버가 available 이면 즉시 지우고 조회를 멈춘다", async () => {
    const probe = fakeProbe(true);
    control.availability.mockResolvedValueOnce(outage()).mockResolvedValue({data: {status: "available", episode: null, expiresAtMs: 20_000, serverNowMs: 8_000}});
    control.spectator.mockResolvedValue(snapshot("ep-1"));
    const {result} = renderHook(() => useMeetingOutage(true, "club", "meeting", viewer, null, probe));
    await flush();
    expect(result.current?.episode).toBe("ep-1");
    probe.needs = false;
    probe.needsAuthority.mockImplementation(() => false);
    await flush(OUTAGE_POLL_MS);
    expect(probe.reachable).toHaveBeenCalled();
    expect(result.current).toBeNull();
    const calls = control.spectator.mock.calls.length;
    await flush(OUTAGE_POLL_MS * 3);
    expect(control.spectator).toHaveBeenCalledTimes(calls);
  });

  it("다른 회차·LIVE 아님 응답은 버리고, 월드 프레임이 돌아오면(active=false) 값을 내리고 멈춘다", async () => {
    const probe = fakeProbe(true);
    control.availability.mockResolvedValue(outage());
    control.spectator.mockResolvedValueOnce(snapshot("ep-other")).mockResolvedValue(snapshot("ep-1"));
    const {result, rerender} = renderHook(({active}) => useMeetingOutage(active, "club", "meeting", viewer, null, probe), {initialProps: {active: true}});
    await flush();
    expect(result.current).toBeNull();
    await flush(OUTAGE_POLL_MS);
    expect(result.current?.episode).toBe("ep-1");
    rerender({active: false});
    expect(result.current).toBeNull();
    const calls = control.availability.mock.calls.length;
    await flush(OUTAGE_POLL_MS * 3);
    expect(control.availability).toHaveBeenCalledTimes(calls);
  });

  it("회차가 없거나 유효기간이 비정상이면 스냅샷을 조회하지 않는다", async () => {
    const probe = fakeProbe(true);
    control.availability.mockResolvedValueOnce({data: {status: "unknown", episode: null, expiresAtMs: 8_000, serverNowMs: 8_000}})
      .mockResolvedValue({data: {status: "outage", episode: "ep-1", expiresAtMs: 200_000, serverNowMs: 8_000}});
    renderHook(() => useMeetingOutage(true, "club", "meeting", viewer, null, probe));
    await flush(OUTAGE_POLL_MS * 2);
    expect(control.spectator).not.toHaveBeenCalled();
  });
});

describe("공개 입구 핸드셰이크", () => {
  it("30초 넘게 끊김 없이 실패해야 가용성 확인이 필요하고, 성공하면 12초 동안 다시 묻지 않는다", () => {
    let clock = 0;
    const sockets: {onopen?: () => void; onerror?: () => void; onclose?: () => void; close: () => void}[] = [];
    const probe = createIngressProbe(() => { const socket = {close: vi.fn()}; sockets.push(socket); return socket as unknown as WebSocket; }, () => clock);
    for (; clock <= 32_000; clock += OUTAGE_POLL_MS) { expect(probe.needsAuthority()).toBe(false); sockets.at(-1)!.onerror?.(); }
    expect(probe.needsAuthority()).toBe(true);
    sockets.at(-1)!.onopen?.();
    expect(probe.recovery()).toBe(1);
    clock += OUTAGE_POLL_MS;
    const opened = sockets.length;
    expect(probe.needsAuthority()).toBe(false);
    expect(sockets).toHaveLength(opened);
  });
});
