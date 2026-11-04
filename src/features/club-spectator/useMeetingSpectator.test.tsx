import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useSpectatorPreferences } from "./preferences";
import { useMeetingSpectator } from "./useMeetingSpectator";
import { spectatorFixture } from "./fixtures";
const control = vi.hoisted(() => ({request: vi.fn(), signals: [] as {path: string; next: () => void; error: (error: unknown) => void; stop: ReturnType<typeof vi.fn>}[], services: {auth: {currentUser: {uid: "member"} as {uid: string} | null}, functions: {}, firestore: {}, ensureAppCheckReady: vi.fn(async () => {})}}));
vi.mock("firebase/firestore", () => ({doc: (_db: unknown, path: string) => path, onSnapshot: vi.fn((path: string, next: () => void, error: (error: unknown) => void) => {const stop = vi.fn(); control.signals.push({path, next, error, stop}); return stop;})}));
vi.mock("firebase/functions", () => ({httpsCallable: vi.fn(() => control.request)}));
vi.mock("../../contexts/FirebaseServicesContext", () => ({useFirebaseServices: () => control.services}));
vi.mock("../../services/errorLogger", () => ({logClientError: vi.fn()}));
beforeEach(() => { vi.clearAllMocks(); control.signals = []; control.services.auth.currentUser = {uid: "member"}; Object.defineProperty(document, "hidden", {configurable: true, value: false}); });
afterEach(() => { vi.useRealTimers(); });
const data = () => ({...spectatorFixture(Date.now()), groupId: "club", eventId: "meeting"});
describe("회원 관전 조회 경계", () => {
  it("주입된 인증 API로 조회하고 권한 오류 발생 즉시 위치를 지운다", async () => {
    control.request.mockResolvedValueOnce({data: data()}).mockRejectedValueOnce(new Error("permission-denied"));
    const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
    await waitFor(() => expect(result.current.data?.eventId).toBe("meeting"));
    expect(httpsCallable).toHaveBeenCalledWith(control.services.functions, "getClubMeetingSpectator", {timeout: 15000});
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeNull();
  });
  it("계정 전환 뒤 늦은 응답이 이전 회원의 코스와 위치를 노출하지 않는다", async () => {
    let resolve!: (response: unknown) => void;
    control.request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const {result, rerender} = renderHook(({uid}) => useMeetingSpectator("club", "meeting", uid), {initialProps: {uid: "member" as string | undefined}});
    await waitFor(() => expect(control.request).toHaveBeenCalledTimes(1));
    control.services.auth.currentUser = null;
    rerender({uid: undefined});
    await act(async () => resolve({data: data()}));
    expect(result.current.data).toBeNull();
  });
  it("숨김 시 정보를 지우고 복귀 때 이전 요청과 겹치지 않게 최신 요청을 실행한다", async () => {
    let resolve!: (response: unknown) => void;
    control.request.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue({data: data()});
    const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
    await waitFor(() => expect(control.request).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, "hidden", {configurable: true, value: true});
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "hidden", {configurable: true, value: false});
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(control.request).toHaveBeenCalledTimes(1);
    await act(async () => resolve({data: {...data(), title: "old"}}));
    await waitFor(() => expect(result.current.data?.title).toBe("저녁 한강 가상라이딩"));
    expect(control.request).toHaveBeenCalledTimes(2);
  });
  it("다른 클럽 응답을 거부한다", async () => {
    control.request.mockResolvedValue({data: {...data(), groupId: "other"}});
    const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.data).toBeNull();
  });
});

it("주기 조회 없이 변경 신호로 새 값을 읽고 구독 권한 오류에는 이전 위치를 지운다", async () => {
  control.request.mockResolvedValue({data: data()});
  const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect(onSnapshot).toHaveBeenCalledTimes(4);
  vi.useFakeTimers();
  for (let i = 0; i < 20; i++) act(() => control.signals.find(s => s.path.endsWith("spectator_signals/latest"))!.next());
  await act(async () => { await vi.advanceTimersByTimeAsync(5001); });
  expect(control.request).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(control.request).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
  act(() => control.signals[0].error(new Error("permission-denied")));
  expect(result.current.data).toBeNull();
  expect(control.signals.every(s => s.stop.mock.calls.length === 1)).toBe(true);
});

it("선택 변경은 서버에 전달하되 기존 목록을 숨기거나 팔로우를 초기화하지 않는다", async () => {
  let finish!: (response: unknown) => void;
  control.request.mockResolvedValueOnce({data: data()}).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const {result, rerender} = renderHook(({selectedUid}) => useMeetingSpectator("club", "meeting", "member", selectedUid), {initialProps: {selectedUid: null as string | null}});
  await waitFor(() => expect(result.current.data).toBeTruthy());
  rerender({selectedUid: "rider-two"});
  await waitFor(() => expect(control.request).toHaveBeenCalledTimes(2));
  expect(result.current.data?.locations).toHaveLength(3);
  expect(control.request).toHaveBeenLastCalledWith({eventId: "meeting", selectedUid: "rider-two"});
  await act(async () => finish({data: {...data(), selectedUid: "rider-two"}}));
  expect(result.current.data?.selectedUid).toBe("rider-two");
});

it("일시 장애는 위치를 지우지 않고 최대 세 번 복구하며 권한 오류는 즉시 차단한다", async () => {
  control.request.mockResolvedValueOnce({data: data()});
  const {result} = renderHook(() => useMeetingSpectator("club", "meeting", "member"));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  vi.useFakeTimers();
  control.request.mockRejectedValue({code: "functions/unavailable"});
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(result.current.data).toBeTruthy();
  expect(result.current.error).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(7001); });
  expect(control.request).toHaveBeenCalledTimes(5);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(control.request).toHaveBeenCalledTimes(5);
  control.request.mockResolvedValue({data: data()});
  await act(async () => { window.dispatchEvent(new Event("online")); });
  expect(result.current.error).toBeNull();
  act(() => control.signals.at(-1)!.error({code: "permission-denied"}));
  expect(result.current.data).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(control.request).toHaveBeenCalledTimes(6);
});

it("복귀 때 친구 설정만 복원하고 새 회원 확인 실패 시 위치를 표시하지 않는다", async () => {
  localStorage.clear();
  control.request.mockImplementation(async ({selectedUid}: {selectedUid: string | null}) => ({data: {...data(), selectedUid}}));
  const first = renderHook(() => {
    const preferences = useSpectatorPreferences("member", "club", "meeting");
    return {preferences, live: useMeetingSpectator("club", "meeting", "member", preferences.value.selectedUid)};
  });
  await waitFor(() => expect(first.result.current.live.data).toBeTruthy());
  act(() => first.result.current.preferences.update({selectedUid: "rider-two", followed: ["rider-two"], search: "나래", followingOnly: true, mapMode: "rider"}));
  await waitFor(() => expect(first.result.current.live.data?.selectedUid).toBe("rider-two"));
  Object.defineProperty(document, "hidden", {configurable: true, value: true});
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(first.result.current.live.data).toBeNull();
  expect(first.result.current.preferences.value.search).toBe("나래");
  Object.defineProperty(document, "hidden", {configurable: true, value: false});
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() => expect(first.result.current.live.data?.selectedUid).toBe("rider-two"));
  first.unmount();
  control.request.mockRejectedValue({code: "functions/permission-denied"});
  const next = renderHook(() => {
    const preferences = useSpectatorPreferences("member", "club", "meeting");
    return {preferences, live: useMeetingSpectator("club", "meeting", "member", preferences.value.selectedUid)};
  });
  expect(next.result.current.preferences.value.selectedUid).toBe("rider-two");
  expect(next.result.current.live.data).toBeNull();
  await waitFor(() => expect(next.result.current.live.error).toBeTruthy());
  expect(next.result.current.live.data).toBeNull();
});
