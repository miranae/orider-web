import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTrainingSurfaceCache, prepareTrainingSurfaceCacheOwner } from "../../../embedded/trainingSurfaceCache";
import { planSnapshotKey, readPlanSnapshot, run30SnapshotKey, writePlanSnapshot } from "../../../embedded/planSnapshotCache";
import type { Goal } from "@shared/types/goal";
import type { Run30Program } from "./run30Api";
import { useRun30Program } from "./useRun30Program";
const mocks = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string; isAnonymous?: boolean } | null,
  api: { getCurrentProgram: vi.fn(), enroll: vi.fn(), confirmChange: vi.fn(), previewEnrollment: vi.fn(), previewChange: vi.fn() },
}));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
const services = { functions: {}, ensureAppCheckReady: vi.fn() };
vi.mock("../../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => services }));
vi.mock("./run30Api", async (original) => ({ ...await original<typeof import("./run30Api")>(), createRun30Api: () => mocks.api }));
const program: Run30Program = {
  goalId: "goal", template: "run-30-intro-v1", revision: 1, startDate: "2026-10-15", history: [],
  retryDates: [], totalStages: 10, remainingStages: 10, next: null, sessions: [],
  safetyGuidance: "", nextWorkoutDecision: null, todayAction: "rest",
};
const now = Date.parse("2026-10-15T03:00:00Z");
function seed(value: Run30Program | null = program) {
  prepareTrainingSurfaceCacheOwner("u1");
  writePlanSnapshot(run30SnapshotKey("u1"), value);
}
describe("useRun30Program snapshot", () => {
  beforeEach(() => {
    clearTrainingSurfaceCache();
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    mocks.user = { uid: "u1" };
    Object.values(mocks.api).forEach(mock => mock.mockReset());
    mocks.api.getCurrentProgram.mockResolvedValue(program);
    vi.spyOn(Date, "now").mockReturnValue(now);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); clearTrainingSurfaceCache(); delete window.__ORIDER_TRAINING_CACHE_SCOPE__; });
  it("fresh 캐시는 프로그램 또는 부재를 즉시 표시하고 요청을 생략한다", () => {
    for (const value of [program, null]) {
      seed(value);
      const hook = renderHook(() => useRun30Program(true));
      expect(hook.result.current).toMatchObject({ status: "ready", program: value, cacheHit: true });
      expect(mocks.api.getCurrentProgram).not.toHaveBeenCalled();
      hook.unmount();
    }
  });
  it("3분 지난 캐시는 먼저 보이며 실패를 성공으로 저장하지 않는다", async () => {
    seed();
    vi.mocked(Date.now).mockReturnValue(now + 180_000);
    mocks.api.getCurrentProgram.mockRejectedValue(new Error("offline"));
    const hook = renderHook(() => useRun30Program(true));
    expect(hook.result.current.program).toEqual(program);
    await waitFor(() => expect(mocks.api.getCurrentProgram).toHaveBeenCalledOnce());
    expect(hook.result.current.status).toBe("ready");
    expect(readPlanSnapshot(run30SnapshotKey("u1"))).toMatchObject({ savedAt: now, fresh: false });
  });
  it("복귀는 fresh 요청을 생략하고 변경 후 refresh와 retry는 강제 조회한다", async () => {
    seed();
    const hook = renderHook(() => useRun30Program(true));
    await act(async () => hook.result.current.refresh(false));
    expect(mocks.api.getCurrentProgram).not.toHaveBeenCalled();
    await act(async () => hook.result.current.refresh());
    expect(mocks.api.getCurrentProgram).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.retry());
    await waitFor(() => expect(mocks.api.getCurrentProgram).toHaveBeenCalledTimes(2));
  });
  it("visible fresh 캐시는 자정 또는 3분 만료에 한번 갱신하며 숨으면 중단한다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    seed();
    const hook = renderHook(({ visible }) => useRun30Program(true, visible), { initialProps: { visible: false } });
    vi.mocked(Date.now).mockReturnValue(now + 180_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(mocks.api.getCurrentProgram).not.toHaveBeenCalled();
    hook.unmount();
    vi.mocked(Date.now).mockReturnValue(now);
    seed();
    const shown = renderHook(() => useRun30Program(true));
    vi.mocked(Date.now).mockReturnValue(now + 180_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(mocks.api.getCurrentProgram).toHaveBeenCalledTimes(1);
    expect(shown.result.current.cacheHit).toBe(false);
  });

  it("프로그램 부재 응답이 반복되어도 매 fresh 만료 timer를 다시 설정한다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    seed(null);
    mocks.api.getCurrentProgram.mockResolvedValue(null);
    renderHook(() => useRun30Program(true));
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      vi.mocked(Date.now).mockReturnValue(now + cycle * 180_000);
      await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
      expect(mocks.api.getCurrentProgram).toHaveBeenCalledTimes(cycle);
    }
  });

  it("fresh 없는 일반웹과 활성화되지 않은 종목은 기존 동작을 유지한다", async () => {
    delete window.__ORIDER_TRAINING_CACHE_SCOPE__;
    const hook = renderHook(({ enabled }) => useRun30Program(enabled), { initialProps: { enabled: false } });
    expect(mocks.api.getCurrentProgram).not.toHaveBeenCalled();
    hook.rerender({ enabled: true });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    expect(mocks.api.getCurrentProgram).toHaveBeenCalledOnce();
    expect(readPlanSnapshot(run30SnapshotKey("u1"))).toBeNull();
  });
  it("계정과 scope 변경 시 이전 값 및 늦은 응답을 숨긴다", async () => {
    seed();
    const hook = renderHook(() => useRun30Program(true));
    let resolve: ((value: Run30Program) => void) | undefined;
    mocks.api.getCurrentProgram.mockImplementation(() => new Promise(value => { resolve = value; }));
    mocks.user = { uid: "u2" };
    hook.rerender();
    expect(hook.result.current.program).toBeNull();
    expect(hook.result.current.status).toBe("loading");
    mocks.user = null;
    hook.rerender();
    await act(async () => resolve?.(program));
    expect(hook.result.current.program).toBeNull();
    expect(hook.result.current.status).toBe("idle");
    expect(readPlanSnapshot(run30SnapshotKey("u1"))).toBeNull();
  });
  it("변경 성공 직후 Run30과 모든 언어의 러닝계획을 무효화한다", async () => {
    seed();
    const key = planSnapshotKey("u1", "run", "ko");
    writePlanSnapshot(key, { goal: { id: "goal", userId: "u1" } as Goal, weeks: [] });
    const hook = renderHook(() => useRun30Program(true));
    mocks.api.enroll.mockResolvedValue({ goalId: "new" });
    await act(async () => { await hook.result.current.api.enroll({ startDate: "2026-10-16", enrollmentKey: "key" }); });
    expect(readPlanSnapshot(key)?.fresh).toBe(false);
    expect(readPlanSnapshot(run30SnapshotKey("u1"))?.fresh).toBe(false);
  });
});
