import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
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
  act(() => control.signals.find(s => s.path.endsWith("spectator_signals/latest"))!.next());
  await waitFor(() => expect(control.request).toHaveBeenCalledTimes(2));
  act(() => control.signals[0].error(new Error("permission-denied")));
  expect(result.current.data).toBeNull();
  expect(control.signals.every(s => s.stop.mock.calls.length === 1)).toBe(true);
});
