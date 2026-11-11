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
const signals = vi.hoisted(() => ({ listeners: [] as {path: string; next: (snapshot: any) => void; error: (error: unknown) => void; stop: ReturnType<typeof vi.fn>}[] }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => path,
  onSnapshot: (path: string, _options: unknown, next: (snapshot: any) => void, error: (error: unknown) => void) => {
    const stop = vi.fn();
    signals.listeners.push({path, next, error, stop});
    return stop;
  },
}));
const snapshot = (revision: number): ClubMeetingSnapshot => ({
  eventId: "event",
  groupId: "club",
  revision,
  isHost: false,
  meeting: newClubMeeting(),
  members: [],
});
afterEach(() => { cleanup(); signals.listeners = []; vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });
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


describe("변경 신호 기반 스냅샷 비용", () => {
  const setup = (value = snapshot(1), hidden = false) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue(value);
    return renderHook(() => useClubMeeting("event", "user", "club"));
  };
  const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const emit = (path: string, data: unknown, fromCache = false) => {
    const listener = signals.listeners.filter(item => item.path === path && !item.stop.mock.calls.length).at(-1)!;
    act(() => listener.next({ data: () => data, exists: () => data !== undefined, metadata: { fromCache } }));
  };
  const signal = (seconds: number) => emit("events/event/meeting_snapshot_signals/latest", {updatedAt: {seconds, nanoseconds: 0}});
  const visible = async () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    await tick();
  };

  it("변경 없는 화면은 수백 분을 열어도 최초 스냅샷만 읽는다", async () => {
    setup({...snapshot(1), snapshotSignalVersion: "1:0"});
    await tick();
    signal(1);
    await tick(500 * 60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
  });

  it("신호 변경을 합치고 새 버전을 읽은 뒤 다시 읽지 않는다", async () => {
    const {result} = setup({...snapshot(1), snapshotSignalVersion: "1:0"});
    await tick();
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({...snapshot(2), snapshotSignalVersion: "3:0"});
    signal(2); signal(3);
    await tick();
    expect(result.current.data?.revision).toBe(2);
    signal(3);
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, null, "1:0"])("응답 신호 버전 %s가 없거나 뒤처져도 같은 신호의 성공 조회는 정착한다", async snapshotSignalVersion => {
    const value = {...snapshot(1), snapshotSignalVersion};
    setup(value); await tick();
    // 결함이 있어도 테스트 자체가 무한 타이머를 돌지 않도록 초과 호출만 보류한다.
    vi.mocked(getClubMeetingSnapshot).mockImplementation(() =>
      vi.mocked(getClubMeetingSnapshot).mock.calls.length <= 3 ? Promise.resolve(value) : new Promise(() => {}));
    signal(10); await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    signal(10); await tick(500 * 60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    signal(11); await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it.each([undefined, "1:0"])("진행 중 새 신호는 버전 %s 응답으로 확인하지 않고 정확히 한 번 후속 조회한다", async snapshotSignalVersion => {
    const value = {...snapshot(1), snapshotSignalVersion};
    setup(value); await tick();
    let resolve!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    signal(2); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    signal(3); signal(4);
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    vi.mocked(getClubMeetingSnapshot).mockImplementation(() =>
      vi.mocked(getClubMeetingSnapshot).mock.calls.length <= 4 ? Promise.resolve(value) : new Promise(() => {}));
    await act(async () => resolve(value));
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    signal(4); await tick(500 * 60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it("실패 중 도착한 신호도 재시도 성공 후 정착하며 같은 신호를 반복 조회하지 않는다", async () => {
    const {result} = setup(); await tick();
    let reject!: (reason: unknown) => void;
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise((_, no) => {reject = no;}));
    signal(2); await tick();
    signal(3);
    await act(async () => reject({code: "functions/unavailable"}));
    expect(result.current.error).not.toBeNull();
    vi.mocked(getClubMeetingSnapshot).mockImplementation(() =>
      vi.mocked(getClubMeetingSnapshot).mock.calls.length <= 4 ? Promise.resolve(snapshot(3)) : new Promise(() => {}));
    await tick(1000);
    expect(result.current.data?.revision).toBe(3);
    expect(result.current.error).toBeNull();
    signal(3); await tick(500 * 60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    expect(logClientError).toHaveBeenCalledTimes(1);
  });

  it("이전 scope의 높은 신호 확인값이 새 계정의 낮은 신호를 소비하지 않는다", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValueOnce({...snapshot(1), snapshotSignalVersion: "100:0"})
      .mockResolvedValue(snapshot(2));
    const {result, rerender} = renderHook(({uid}) => useClubMeeting("event", uid, "club"), {initialProps: {uid: "first"}});
    await tick();
    rerender({uid: "second"}); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    signal(2); await tick();
    signal(2); await tick(500 * 60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    expect(result.current.data?.revision).toBe(2);
  });

  it("진행 중 도착한 신호 버전이 응답에 포함되면 중복 읽지 않는다", async () => {
    let resolve!: (value: ClubMeetingSnapshot) => void;
    const {result} = setup();
    await tick();
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    let pending!: Promise<void>;
    act(() => {pending = result.current.reload();});
    signal(2);
    await act(async () => {resolve({...snapshot(2), snapshotSignalVersion: "2:0"}); await pending;});
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it("응답보다 새로운 신호를 놓치지 않고 후속 조회한다", async () => {
    let resolve!: (value: ClubMeetingSnapshot) => void;
    setup();
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    // 최초 호출은 setup에서 이미 시작했다. 다음 수동 요청 대신 focus로 조회한다.
    await tick();
    await visible();
    signal(2);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({...snapshot(3), snapshotSignalVersion: "2:0"});
    await act(async () => resolve({...snapshot(2), snapshotSignalVersion: "1:0"}));
    await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it("숨김 화면에서는 구독과 읽기를 멈추고 복귀를 하나로 합친다", async () => {
    const {unmount} = setup(snapshot(1), true);
    await tick(120_000);
    expect(getClubMeetingSnapshot).not.toHaveBeenCalled();
    expect(signals.listeners).toHaveLength(0);
    await visible();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    expect(signals.listeners).toHaveLength(4);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(signals.listeners.every(item => item.stop.mock.calls.length > 0)).toBe(true);
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    await visible();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    unmount();
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it("시작 1시간 전부터 종료 경계까지 신호를 처리하고 그 전에는 한 번만 깨운다", async () => {
    setup({...snapshot(1), runtimeWindow: {opensAtMs: 60_000, closesAtMs: 120_000}, snapshotSignalVersion: "1:0"});
    await tick();
    signal(2);
    await tick(59_999);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({...snapshot(2), runtimeWindow: {opensAtMs: 60_000, closesAtMs: 120_000}, snapshotSignalVersion: "2:0"});
    await tick(1);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    await tick(60_000);
    signal(3);
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it.each([null, {opensAtMs: -120_000, closesAtMs: -1}])("비활성 창 %s에서는 신호가 와도 자동 읽지 않는다", async runtimeWindow => {
    setup({...snapshot(1), runtimeWindow});
    await tick(); signal(2); await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
  });

  it("실행 창이 끝난 최초 FINISHED processing도 polling 없이 완료 신호로 갱신한다", async () => {
    const runtimeWindow = {opensAtMs: -86_400_000, closesAtMs: -1};
    const {result} = setup({...snapshot(1), runtimeWindow, rideStatus: "FINISHED", completion: {state: "processing", summary: null}});
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({...snapshot(2), runtimeWindow, snapshotSignalVersion: "2:0", rideStatus: "FINISHED", completion: {state: "ready", summary: null}});
    signal(2); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.data?.completion?.state).toBe("ready");
    signal(3); await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it("완료 복구 만료 타이머는 하나이며 5분 만료가 조회나 수동 재연장을 만들지 않는다", async () => {
    const value = {...snapshot(1), runtimeWindow: {opensAtMs: -86_400_000, closesAtMs: -1},
      rideStatus: "FINISHED" as const, completion: {state: "processing" as const, summary: null}};
    const {result} = setup(value); await tick();
    expect(vi.getTimerCount()).toBe(1);
    await tick(299_999);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(vi.getTimerCount()).toBe(0);
    signal(2); await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {await result.current.reload();});
    signal(3); await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("processing 조회 성공도 최초 복구 기한을 연장하지 않는다", async () => {
    const value = {...snapshot(1), runtimeWindow: {opensAtMs: -86_400_000, closesAtMs: -1},
      rideStatus: "FINISHED" as const, completion: {state: "processing" as const, summary: null}};
    setup(value); await tick(240_000);
    signal(2); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    await tick(60_000);
    signal(3); await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it("완료 처리 요청 실패의 재시도도 최초 5분 경계 뒤에는 시작하지 않는다", async () => {
    const value = {...snapshot(1), runtimeWindow: {opensAtMs: -86_400_000, closesAtMs: -1},
      rideStatus: "FINISHED" as const, completion: {state: "processing" as const, summary: null}};
    const {result} = setup(value); await tick(299_000);
    vi.mocked(getClubMeetingSnapshot).mockRejectedValue({code: "functions/unavailable"});
    signal(2); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.error).not.toBeNull();
    await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it.each([-1, 60_000])("완료 복구 예외는 일반 모임의 닫힌/미래 창 %s를 열지 않는다", async boundary => {
    setup({...snapshot(1), rideStatus: "OPEN", runtimeWindow: boundary < 0 ?
      {opensAtMs: -100_000, closesAtMs: boundary} : {opensAtMs: boundary, closesAtMs: 120_000}});
    await tick(); signal(2); await tick(1000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
  });

  it("이미 완료 복구를 사용한 scope는 ready 뒤 processing으로 돌아가도 창을 새로 열지 않는다", async () => {
    const value = {...snapshot(1), runtimeWindow: {opensAtMs: -86_400_000, closesAtMs: -1},
      rideStatus: "FINISHED" as const, completion: {state: "processing" as const, summary: null}};
    const {result} = setup(value); await tick();
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({...value, completion: {state: "ready", summary: null}});
    await act(async () => {await result.current.reload();});
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue(value);
    await act(async () => {await result.current.reload();});
    signal(2); await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it("처음 OPEN이던 화면도 FINISHED processing 전환 뒤 닫힌 창 밖의 완료 신호를 받는다", async () => {
    const runtimeWindow = {opensAtMs: -86_400_000, closesAtMs: -1};
    const {result} = setup({...snapshot(1), runtimeWindow, rideStatus: "OPEN"}); await tick();
    const info = {kind: "CLUB_MEETING", groupId: "club", creatorId: "user", status: "OPEN"};
    emit("events/event", {info});
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({...snapshot(2), runtimeWindow,
      rideStatus: "FINISHED", completion: {state: "processing", summary: null}});
    emit("events/event", {info: {...info, status: "FINISHED"}}); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.data?.completion?.state).toBe("processing");
    await tick(120_000);
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({...snapshot(3), runtimeWindow, snapshotSignalVersion: "3:0",
      rideStatus: "FINISHED", completion: {state: "ready", summary: null}});
    signal(3); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    expect(result.current.data?.completion?.state).toBe("ready");
    signal(4); await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
  });

  it("완료 복구 중 권한 거부는 즉시 지우고 focus나 신호가 다시 열지 않는다", async () => {
    const value = {...snapshot(1), runtimeWindow: {opensAtMs: -86_400_000, closesAtMs: -1},
      rideStatus: "FINISHED" as const, completion: {state: "processing" as const, summary: null}};
    const {result} = setup(value); await tick();
    vi.mocked(getClubMeetingSnapshot).mockRejectedValueOnce({code: "functions/permission-denied"});
    signal(2); await tick();
    expect(result.current.data).toBeNull();
    await visible(); await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it("scope 전환은 이전 완료 복구 타이머를 폐기하고 새 일반 모임으로 넘기지 않는다", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const runtimeWindow = {opensAtMs: -86_400_000, closesAtMs: -1};
    vi.mocked(getClubMeetingSnapshot).mockResolvedValueOnce({...snapshot(1), runtimeWindow,
      rideStatus: "FINISHED", completion: {state: "processing", summary: null}}).mockResolvedValue({...snapshot(2), runtimeWindow, rideStatus: "OPEN"});
    const {result, rerender} = renderHook(({uid}) => useClubMeeting("event", uid, "club"), {initialProps: {uid: "first"}});
    await tick(120_000);
    rerender({uid: "second"}); await tick();
    signal(2); await tick(600_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.data?.rideStatus).toBe("OPEN");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("일시 실패만 세 번 재시도하고 원문 개인정보를 기록하지 않는다", async () => {
    setup();
    await tick();
    vi.mocked(getClubMeetingSnapshot).mockRejectedValue({code: "private user payload", details: "private roster"});
    await visible();
    await tick(60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(5);
    expect(logClientError).toHaveBeenCalledTimes(4);
    for (const call of vi.mocked(logClientError).mock.calls) {
      expect((call[1] as Error).message).toBe("모임 스냅샷 읽기 실패");
      expect(call[2]).toEqual({code: "unknown", terminal: false});
    }
    await tick(500 * 60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(5);
  });

  it.each(["functions/permission-denied", "functions/unauthenticated", "functions/not-found", "functions/failed-precondition"])("%s 권한 종료는 즉시 화면을 지우고 재시도하지 않는다", async code => {
    const {result} = setup(); await tick();
    const error = {code, details: {reason: "account-deleting"}};
    vi.mocked(getClubMeetingSnapshot).mockRejectedValue(error);
    await act(async () => {await expect(result.current.reload()).rejects.toEqual(error);});
    expect(result.current.data).toBeNull();
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it("신호 권한 거부는 진행 중 요청도 무효화하며 개인정보 없이 기록한다", async () => {
    const {result} = setup(); await tick();
    let resolve!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    let pending!: Promise<void>;
    act(() => {pending = result.current.reload();});
    act(() => signals.listeners[0]!.error({code: "permission-denied", message: "private roster"}));
    await act(async () => {resolve(snapshot(2)); await pending;});
    expect(result.current.data).toBeNull();
    expect(vi.mocked(logClientError).mock.calls[0]![2]).toEqual({code: "permission-denied", terminal: true});
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
  });

  it("callable 권한 거부 후 ACL·복귀·focus는 재조회하지 않고 명시적 reload만 복구한다", async () => {
    const {result} = setup(); await tick();
    emit("groups/club", {isActive: true, membershipVersion: 1});
    vi.mocked(getClubMeetingSnapshot).mockRejectedValueOnce({code: "functions/permission-denied"});
    await act(async () => {await expect(result.current.reload()).rejects.toMatchObject({code: "functions/permission-denied"});});
    expect(result.current.data).toBeNull();
    emit("groups/club", {isActive: false, membershipVersion: 2});
    await tick();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await visible(); await tick(120_000);
    act(() => window.dispatchEvent(new Event("focus"))); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBeNull();
    await act(async () => {await result.current.reload();});
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    expect(result.current.data?.revision).toBe(1);
  });

  it("신호 권한 거부 뒤 focus도 복구하지 않으며 reload 성공 후에만 구독한다", async () => {
    const {result} = setup(); await tick();
    act(() => signals.listeners[0]!.error({code: "permission-denied"}));
    await visible(); await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBeNull();
    expect(signals.listeners.every(item => item.stop.mock.calls.length > 0)).toBe(true);
    await act(async () => {await result.current.reload();});
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.data?.revision).toBe(1);
    expect(signals.listeners.some(item => !item.stop.mock.calls.length)).toBe(true);
  });

  it("그룹·회원의 출석 revision과 프로필 갱신은 모임 스냅샷을 다시 읽지 않는다", async () => {
    setup(); await tick();
    emit("groups/club", {isActive: true, membershipVersion: 4, memberCount: 2, attendanceRevision: 1});
    emit("groups/club/members/user", {status: "active", attendanceRevision: 1, displayName: "이전 이름"});
    emit("groups/club", {isActive: true, membershipVersion: 4, memberCount: 2, attendanceRevision: 2});
    emit("groups/club/members/user", {status: "active", attendanceRevision: 2, displayName: "새 이름"});
    await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
  });

  it("회원수·멤버십 버전과 호출자 자격 변경은 개인정보 재검증을 유지한다", async () => {
    const {result} = setup(); await tick();
    emit("groups/club", {isActive: true, membershipVersion: 4, memberCount: 2});
    emit("groups/club/members/user", {status: "active"});
    emit("groups/club", {isActive: true, membershipVersion: 5, memberCount: 2}); await tick();
    emit("groups/club", {isActive: true, membershipVersion: 5, memberCount: 1}); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    vi.mocked(getClubMeetingSnapshot).mockRejectedValueOnce({code: "functions/permission-denied"});
    emit("groups/club/members/user", {status: "inactive"}); await tick();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(4);
    expect(result.current.data).toBeNull();
  });

  it.each(["kind", "groupId", "creatorId"])("실행 창 밖의 event %s 변경은 진행 중인 예전 권한 응답을 무효화한다", async field => {
    const original = {...snapshot(1), isHost: true, runtimeWindow: null,
      meeting: {...newClubMeeting(), hostId: "user"}};
    const {result} = setup(original); await tick();
    const info = {kind: "CLUB_MEETING", groupId: "club", creatorId: "user", status: "OPEN"};
    emit("events/event", {info});
    let resolve!: (value: ClubMeetingSnapshot) => void;
    vi.mocked(getClubMeetingSnapshot).mockImplementationOnce(() => new Promise(r => {resolve = r;}));
    let pending!: Promise<void>;
    act(() => {pending = result.current.reload();});
    const next = {...original, revision: 2, isHost: false, meeting: {...original.meeting, hostId: "other"}};
    if (field === "creatorId") vi.mocked(getClubMeetingSnapshot).mockResolvedValueOnce(next);
    else vi.mocked(getClubMeetingSnapshot).mockRejectedValueOnce({code: "functions/not-found"});
    emit("events/event", {info: {...info, [field]: "other"}});
    expect(result.current.data).toBeNull();
    await tick();
    await act(async () => {resolve(original); await pending;});
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(3);
    if (field === "creatorId") expect(result.current.data).toMatchObject({revision: 2, isHost: false});
    else expect(result.current.data).toBeNull();
  });

  it("이전 scope의 신호와 실패가 새 화면을 바꾸지 않는다", async () => {
    vi.useFakeTimers();
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue(snapshot(1));
    const {result, rerender} = renderHook(({uid}) => useClubMeeting("event", uid, "club"), {initialProps: {uid: "first"}});
    await tick();
    const old = signals.listeners[0]!;
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue(snapshot(2));
    rerender({uid: "second"});
    await tick();
    act(() => {
      old.next({data: () => ({updatedAt: {seconds: 9, nanoseconds: 0}}), metadata: {fromCache: false}});
      old.error({code: "permission-denied"});
    });
    await tick(120_000);
    expect(result.current.data?.revision).toBe(2);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(logClientError).not.toHaveBeenCalled();
  });

  it("과거 신호·캐시 응답은 더 새로운 서버 스냅샷을 다시 읽게 하지 않는다", async () => {
    setup({...snapshot(1), snapshotSignalVersion: "3:0"}); await tick();
    emit("events/event/meeting_snapshot_signals/latest", {updatedAt: {seconds: 9, nanoseconds: 0}}, true);
    signal(2); await tick(120_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(1);
  });

  it("신호 구독 실패는 제한된 횟수만 복구하고 이전 구독 콜백은 무시한다", async () => {
    const {result} = setup(); await tick();
    const old = signals.listeners[0]!;
    act(() => old.error({code: "unavailable", message: "private"}));
    expect(result.current.error).not.toBeNull();
    await tick(1000);
    act(() => old.error({code: "permission-denied"}));
    expect(result.current.data).not.toBeNull();
    signal(0); await tick();
    expect(result.current.error).toBeNull();
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    expect(logClientError).toHaveBeenCalledTimes(1);
  });

  it("서비스 제공자를 바꾼 뒤 이전 응답과 신호를 무시한다", async () => {
    vi.useFakeTimers();
    let resolve!: (value: ClubMeetingSnapshot) => void;
    const previous = vi.fn(() => new Promise<ClubMeetingSnapshot>(r => {resolve = r;}));
    const next = vi.fn().mockResolvedValue(snapshot(2));
    vi.mocked(createClubMeetingsApi)
      .mockReturnValueOnce({getClubMeetingSnapshot: previous} as unknown as ReturnType<typeof createClubMeetingsApi>)
      .mockReturnValueOnce({getClubMeetingSnapshot: next} as unknown as ReturnType<typeof createClubMeetingsApi>);
    let services = {auth: {}, functions: {}} as FirebaseServices;
    const {result, rerender} = renderHook(() => useClubMeeting("event", "user", "club"), {
      wrapper: ({children}) => <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider>,
    });
    const old = signals.listeners[0]!;
    services = {auth: {}, functions: {}} as FirebaseServices;
    rerender(); await tick();
    await act(async () => resolve(snapshot(1)));
    act(() => old.error({code: "permission-denied"}));
    expect(result.current.data?.revision).toBe(2);
    expect(logClientError).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("과거 공지는 명시적 페이지 요청만 읽고 새로고침은 최신 페이지로 돌아간다", async () => {
    const {result} = setup({...snapshot(1), noticeNextCursor: "n480"}); await tick();
    vi.mocked(getClubMeetingSnapshot).mockResolvedValue({...snapshot(2), noticePageCursor: "n480", noticeNextCursor: "n460"});
    await act(async () => {await result.current.loadOlderNotices();});
    expect(getClubMeetingSnapshot).toHaveBeenLastCalledWith("event", "n480");
    await tick(500 * 60_000);
    expect(getClubMeetingSnapshot).toHaveBeenCalledTimes(2);
    await act(async () => {await result.current.reload();});
    expect(getClubMeetingSnapshot).toHaveBeenLastCalledWith("event", undefined);
  });
});
