// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClubMeeting } from "./useClubMeeting";
import {
  getClubMeetingSnapshot,
  type ClubMeetingSnapshot,
} from "../../services/clubMeetings";
import { FirebaseServicesProvider, type FirebaseServices } from "../../contexts/FirebaseServicesContext";
import { createClubMeetingsApi } from "../../services/clubMeetings";
import { logClientError } from "../../services/errorLogger";
import { newClubMeeting } from "./meetingCopy";
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../../services/clubMeetings", () => { const api = {
  getClubMeetingSnapshot: vi.fn(),
}; return { ...api, createClubMeetingsApi: vi.fn(() => api) }; });
const snapshot = (revision: number): ClubMeetingSnapshot => ({
  eventId: "event",
  groupId: "club",
  revision,
  isHost: false,
  meeting: newClubMeeting(),
  members: [],
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });
describe("서버 모임 읽기 상태", () => {
  it("이전 poll 응답이 조작 후 최신 응답을 덮어쓰지 않는다", async () => {
    let first!: (value: ClubMeetingSnapshot) => void;
    let second!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            second = resolve;
          }),
      );
    const { result } = renderHook(() =>
      useClubMeeting("event", "user", "club"),
    );
    await waitFor(() =>
      expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1),
    );
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.reload();
    });
    await act(async () => {
      second(snapshot(2));
      await refresh;
    });
    expect(result.current.data?.revision).toBe(2);
    await act(async () => first(snapshot(1)));
    expect(result.current.data?.revision).toBe(2);
  });
  it("사용자 변경 시 이전 사용자의 응답과 명단을 노출하지 않는다", async () => {
    let first!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockResolvedValueOnce(snapshot(2));
    const { result, rerender } = renderHook(
      ({ uid }) => useClubMeeting("event", uid, "club"),
      { initialProps: { uid: "first" } },
    );
    rerender({ uid: "second" });
    await waitFor(() => expect(result.current.data?.revision).toBe(2));
    await act(async () => first(snapshot(1)));
    expect(result.current.data?.revision).toBe(2);
  });
});


it("binds the meeting polling hook to the injected embedded services", async () => {
  const services = { auth: { currentUser: { uid: "user" } }, functions: {}, firestore: {}, ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
  vi.mocked(getClubMeetingSnapshot).mockResolvedValue(snapshot(3));
  const { result } = renderHook(() => useClubMeeting("event", "user", "club"), { wrapper: ({ children }) => <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider> });
  await waitFor(() => expect(result.current.data?.revision).toBe(3));
  expect(createClubMeetingsApi).toHaveBeenCalledWith(services);
});


describe("자동 스냅샷 요청 비용", () => {
  const setup = (value = snapshot(1), hidden = false) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue(value);
    return renderHook(() => useClubMeeting("event", "user", "club"));
  };
  const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const visible = async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await tick(0);
  };

  it("처음 숨겨진 화면은 대기하고 복귀 이벤트는 합치며 60초마다 읽는다", async () => {
    const { unmount } = setup(snapshot(1), true);
    await tick(120_000);
    expect(getClubMeetingSnapshot).not.toHaveBeenCalled();
    await visible();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    await tick(1);
    act(() => window.dispatchEvent(new Event("focus")));
    await tick(59_998);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(180_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    await visible();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    unmount();
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it.each(["OPEN", "CANCELLED"] as const)("%s 종료 후 자동 요청은 멈추고 수동 일정 변경으로 다시 시작한다", async (rideStatus) => {
    const { result } = setup({ ...snapshot(1), rideStatus, runtimeWindow: { opensAtMs: 0, closesAtMs: 30_000 } });
    await tick(180_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    await visible();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({ ...snapshot(2), rideStatus: "OPEN", runtimeWindow: { opensAtMs: 0, closesAtMs: 600_000 } });
    await act(async () => { await result.current.reload(); });
    await tick(60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(4);
  });

  it("완료 처리 중에는 5분까지만 읽으며 수동 새로고침이 제한을 연장하지 않는다", async () => {
    const { result } = setup({ ...snapshot(1), rideStatus: "FINISHED", completion: { state: "processing", summary: null } });
    await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(6);
    await act(async () => { await result.current.reload(); });
    await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(7);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({ ...snapshot(2), rideStatus: "FINISHED", completion: { state: "ready", summary: null } });
    await act(async () => { await result.current.reload(); });
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(8);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({ ...snapshot(3), rideStatus: "FINISHED", completion: { state: "processing", summary: null } });
    await act(async () => { await result.current.reload(); });
    await tick(60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(10);
  });

  it("진행 중 자동 요청을 중복하지 않는다", async () => {
    setup();
    await tick(0);
    let resolve!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    await tick(60_000);
    await visible();
    await tick(180_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => resolve(snapshot(2)));
    await tick(60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it.each(["functions/permission-denied", "functions/unauthenticated", "functions/not-found"])("%s 거부 시 비공개 데이터를 지운다", async (code) => {
    const { result } = setup();
    await tick(0);
    expect(result.current.data).not.toBeNull();
    vi.mocked(getClubMeetingSnapshot).mockRejectedValueOnce({ code });
    await act(async () => { await expect(result.current.reload()).rejects.toEqual({ code }); });
    expect(result.current.data).toBeNull();
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it("계정을 왕복해도 이전 동일 scope 응답과 정리가 새 요청을 침범하지 않는다", async () => {
    vi.useFakeTimers();
    let old!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise(r => { old = r; })).mockResolvedValue(snapshot(2));
    const { result, rerender } = renderHook(({ uid }) => useClubMeeting("event", uid, "club"), { initialProps: { uid: "a" as string | undefined } });
    rerender({ uid: undefined });
    expect(result.current.data).toBeNull();
    rerender({ uid: "a" });
    await tick(0);
    await act(async () => old(snapshot(1)));
    expect(result.current.data?.revision).toBe(2);
    await tick(60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it("클럽/모임 전환 후 이전 권한 거부는 새 명단을 지우지 않는다", async () => {
    vi.useFakeTimers();
    let rejectOld!: (error: unknown) => void;
    vi.mocked(getClubMeetingSnapshot)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
      .mockResolvedValue({ ...snapshot(2), eventId: "next", groupId: "next-club" });
    const { result, rerender, unmount } = renderHook(
      ({ event, club }) => useClubMeeting(event, "user", club),
      { initialProps: { event: "event", club: "club" } },
    );
    rerender({ event: "next", club: "next-club" });
    expect(result.current.data).toBeNull();
    await tick(0);
    await act(async () => rejectOld({ code: "functions/permission-denied" }));
    expect(result.current.data?.groupId).toBe("next-club");
    expect(result.current.error).toBeNull();
    await tick(60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    let late!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise(resolve => { late = resolve; }));
    await tick(60_000);
    unmount();
    await act(async () => late(snapshot(4)));
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(4);
  });


  it("명시적 null 실행 창은 자동 읽기를 멈추되 수동/복귀 새로고침은 허용한다", async () => {
    const { result } = setup({ ...snapshot(1), runtimeWindow: null });
    await tick(180_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    await visible();
    await act(async () => { await result.current.reload(); });
    await tick(180_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it.each(["account-deleting", "other"])("failed-precondition 사유 %s를 구분한다", async (reason) => {
    const { result } = setup();
    await tick(0);
    const error = { code: "functions/failed-precondition", details: { reason } };
    vi.mocked(getClubMeetingSnapshot).mockRejectedValue(error);
    await act(async () => { await expect(result.current.reload()).rejects.toEqual(error); });
    expect(result.current.data === null).toBe(reason === "account-deleting");
    await tick(60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(reason === "account-deleting" ? 2 : 3);
  });


  it("지연된 타이머도 완료 처리 5분 기한을 넘겨 요청하지 않는다", async () => {
    setup({ ...snapshot(1), rideStatus: "FINISHED", completion: { state: "processing", summary: null } });
    await tick(0);
    vi.setSystemTime(600_000);
    await tick(60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
  });

  it("서비스 제공자 변경 후 이전 응답이 새 응답을 덮지 않는다", async () => {
    vi.useFakeTimers();
    let old!: (value: ClubMeetingSnapshot) => void;
    const previous = vi.fn(() => new Promise<ClubMeetingSnapshot>(resolve => { old = resolve; }));
    const next = vi.fn().mockResolvedValue(snapshot(2));
    vi.mocked(createClubMeetingsApi)
      .mockReturnValueOnce({ getClubMeetingSnapshot: previous } as unknown as ReturnType<typeof createClubMeetingsApi>)
      .mockReturnValueOnce({ getClubMeetingSnapshot: next } as unknown as ReturnType<typeof createClubMeetingsApi>);
    let services = { auth: {}, functions: {} } as FirebaseServices;
    const { result, rerender } = renderHook(() => useClubMeeting("event", "user", "club"), {
      wrapper: ({ children }) => <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider>,
    });
    services = { auth: {}, functions: {} } as FirebaseServices;
    rerender();
    await tick(0);
    await act(async () => old(snapshot(1)));
    expect(result.current.data?.revision).toBe(2);
    await tick(60_000);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });


  it("현재 자동 실패는 개인정보 없이 제공자에 묶어 한 번 기록한다", async () => {
    vi.useFakeTimers();
    const services = { auth: {}, functions: {} } as FirebaseServices;
    const error = Object.assign(new Error("private user/club/event payload"), {
      code: "functions/permission-denied", details: { roster: "private roster" },
    });
    vi.mocked(getClubMeetingSnapshot).mockRejectedValue(error);
    const { result } = renderHook(() => useClubMeeting("event", "user", "club"), {
      wrapper: ({ children }) => <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider>,
    });
    await tick(0);
    expect(result.current.data).toBeNull();
    expect(logClientError).toHaveBeenCalledTimes(1);
    expect(logClientError).toHaveBeenCalledWith("ClubMeetingSnapshot.read", expect.any(Error),
      { code: "permission-denied", terminal: true }, services);
    const loggedError = vi.mocked(logClientError).mock.calls[0]![1] as Error;
    expect(loggedError.message).toBe("모임 스냅샷 읽기 실패");
    expect(loggedError).not.toBe(error);
    await tick(180_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    expect(logClientError).toHaveBeenCalledTimes(1);
  });

  it("이전 scope와 수동 새로고침으로 대체된 실패는 기록하지 않는다", async () => {
    vi.useFakeTimers();
    let rejectScope!: (error: unknown) => void;
    let rejectSuperseded!: (error: unknown) => void;
    vi.mocked(getClubMeetingSnapshot)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectScope = reject; }))
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectSuperseded = reject; }))
      .mockResolvedValue(snapshot(3));
    const { result, rerender } = renderHook(({ uid }) => useClubMeeting("event", uid, "club"),
      { initialProps: { uid: "first" } });
    rerender({ uid: "second" });
    await act(async () => { await result.current.reload(); });
    await act(async () => {
      rejectScope(new Error("previous scope"));
      rejectSuperseded(new Error("superseded request"));
    });
    expect(result.current.data?.revision).toBe(3);
    expect(logClientError).not.toHaveBeenCalled();
  });

  it("알 수 없는 오류 코드는 원문을 기록하지 않고 일반 오류로 기록한다", async () => {
    setup();
    await tick(0);
    vi.mocked(getClubMeetingSnapshot).mockRejectedValue({ code: "private user payload", details: "private" });
    await tick(60_000);
    expect(logClientError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logClientError).mock.calls[0]![2]).toEqual({ code: "unknown", terminal: false });
  });

});
