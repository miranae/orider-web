import { act, renderHook, waitFor } from "@testing-library/react";
import { collection, getDocs } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";
import { FirebaseServicesProvider } from "../contexts/FirebaseServicesContext";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { normalizePlanSport, usePlanModel } from "./usePlanModel";
import { planSnapshotKey, readPlanSnapshot } from "../embedded/planSnapshotCache";
import * as trainingSurfaceCache from "../embedded/trainingSurfaceCache";
import {
  clearTrainingSurfaceCache,
  getTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
  setTrainingSurfaceCache,
} from "../embedded/trainingSurfaceCache";

const mocks = vi.hoisted(() => ({
  locale: "ko",
  user: { uid: "owner" } as { uid: string } | null,
  freshTraining: vi.fn(() => ({ revalidating: false, justRecomputed: false, currentTsb: null as number | null })),
  fitnessTimeseries: vi.fn(() => ({ timeseries: null, loaded: true })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: mocks.locale } }),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("./useFreshTraining", () => ({
  useFreshTraining: mocks.freshTraining,
}));

vi.mock("./useFitnessTimeseries", () => ({
  useFitnessTimeseries: mocks.fitnessTimeseries,
}));

const firestore = { name: "embedded-firestore" };
const services = {
  firestore,
  auth: {},
  functions: {},
  ensureAppCheckReady: vi.fn(),
} as never;

function wrapper({ children }: { children: ReactNode }) {
  return <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider>;
}

describe("usePlanModel", () => {
  afterEach(() => { delete window.__ORIDER_TRAINING_CACHE_SCOPE__; vi.useRealTimers(); vi.restoreAllMocks(); });
  beforeEach(() => {
    clearTrainingSurfaceCache();
    mocks.locale = "ko";
    mocks.user = { uid: "owner" };
    mocks.freshTraining.mockReset().mockReturnValue({revalidating: false, justRecomputed: false, currentTsb: null});
    mocks.fitnessTimeseries.mockReset().mockReturnValue({timeseries: null, loaded: true});
    resetRuntimeConfigForTests({trainingDecisionEnabled: false});
    vi.mocked(collection).mockClear();
    vi.mocked(getDocs).mockClear();
  });

  it.each([
    ["bike", "bike"],
    ["run", "run"],
    ["swim", "swim"],
    ["cycling", "bike"],
    ["tri", "bike"],
    ["RUN", "bike"],
    ["", "bike"],
    [null, "bike"],
  ])("normalizes sport %j to %s", (input, expected) => {
    expect(normalizePlanSport(input)).toBe(expected);
  });

  it("assembles the active goal, plan weeks, and progress with injected Firestore", async () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    setCollectionDocs("goals", [{
      id: "goal-run",
      userId: "owner",
      discipline: "run",
      status: "active",
      eventDate: tomorrow,
      courseName: "10K",
    }]);
    setCollectionDocs("goals/goal-run/plan", [{
      id: "week-01",
      weekNumber: 1,
      phase: "build",
      startDate: tomorrow,
      plannedTSS: 80,
      days: [{
        date: tomorrow,
        dayOfWeek: 1,
        workout: "tempoRun",
        plannedTSS: 80,
        plannedDurationMin: 45,
        actualTSS: 40,
        completed: true,
        skipped: false,
      }],
    }]);

    const { result } = renderHook(() => usePlanModel("run"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.discipline).toBe("run");
    expect(result.current.goalLoading).toBe(false);
    expect(result.current.planLoading).toBe(false);
    expect(result.current.goalError).toBeNull();
    expect(result.current.planError).toBeNull();
    expect(result.current.goal?.id).toBe("goal-run");
    expect(result.current.weeks).toHaveLength(1);
    expect(result.current.totalTSS).toBe(80);
    expect(result.current.completedTSS).toBe(40);
    expect(result.current.progress).toBe(50);
    expect(collection).toHaveBeenCalledWith(firestore, "goals");
    expect(collection).toHaveBeenCalledWith(firestore, "goals", "goal-run", "plan");
    expect(mocks.freshTraining).toHaveBeenCalledWith("run", true, true);
    expect(mocks.fitnessTimeseries).not.toHaveBeenCalled();
  });

  it("uses the bike model for an unsupported embedded sport value", async () => {
    setCollectionDocs("goals", []);

    const { result } = renderHook(() => usePlanModel("rowing"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.discipline).toBe("bike");
    expect(result.current.goal).toBeNull();
    expect(mocks.freshTraining).toHaveBeenCalledWith("bike", true, true);
    expect(mocks.fitnessTimeseries).not.toHaveBeenCalled();
  });

  it("commits a fresh goal and its weeks atomically", async () => {
    const getDocsMock = vi.mocked(getDocs);
    const originalImplementation = getDocsMock.getMockImplementation()!;
    let resolvePlan: ((value: unknown) => void) | null = null;
    getDocsMock
      .mockResolvedValueOnce({
        empty: false,
        docs: [{
          id: "goal-run",
          data: () => ({
            userId: "owner",
            discipline: "run",
            status: "active",
            eventDate: Date.now() + 24 * 60 * 60 * 1000,
            courseName: "10K",
          }),
        }],
      } as never)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePlan = resolve;
      }) as never);

    const { result } = renderHook(() => usePlanModel("run"), { wrapper });

    await waitFor(() => expect(resolvePlan).not.toBeNull());
    expect(result.current.goal).toBeNull();
    expect(result.current.goalLoading).toBe(true);
    expect(result.current.planLoading).toBe(true);
    expect(result.current.loading).toBe(true);

    act(() => resolvePlan?.({ empty: true, docs: [] }));
    await waitFor(() => expect(result.current.planLoading).toBe(false));
    expect(result.current.goal?.id).toBe("goal-run");
    expect(result.current.weeks).toEqual([]);
    getDocsMock.mockImplementation(originalImplementation);
  });

  it("renders a remounted Plan from memory while refreshing and preserves it on refresh failure", async () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    setCollectionDocs("goals", [{
      id: "goal-bike",
      userId: "owner",
      discipline: "bike",
      status: "active",
      eventDate: tomorrow,
      courseName: "서울 라이딩",
    }]);
    setCollectionDocs("goals/goal-bike/plan", [{
      id: "week-01",
      weekNumber: 1,
      phase: "build",
      startDate: tomorrow,
      plannedTSS: 60,
      days: [],
    }]);

    const first = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(first.result.current.freshLoaded).toBe(true));
    expect(first.result.current.weeks).toHaveLength(1);
    first.unmount();

    const getDocsMock = vi.mocked(getDocs);
    const originalImplementation = getDocsMock.getMockImplementation()!;
    getDocsMock.mockClear();
    getDocsMock.mockRejectedValueOnce(new Error("offline"));
    const second = renderHook(() => usePlanModel("bike"), { wrapper });

    expect(second.result.current.cacheHit).toBe(true);
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.goal?.id).toBe("goal-bike");
    expect(second.result.current.weeks).toHaveLength(1);
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(1));
    expect(second.result.current.freshLoaded).toBe(false);
    await waitFor(() => expect(second.result.current.goalError).toEqual(new Error("offline")));
    expect(second.result.current.loadError).toEqual(new Error("offline"));
    expect(second.result.current.weeks).toHaveLength(1);
    act(() => second.result.current.retryLoad());
    await waitFor(() => expect(second.result.current.freshLoaded).toBe(true));
    expect(second.result.current.loadError).toBeNull();
    getDocsMock.mockImplementation(originalImplementation);
  });

  it("does not let a cancelled sport generation write into the cache", async () => {
    const getDocsMock = vi.mocked(getDocs);
    const originalImplementation = getDocsMock.getMockImplementation()!;
    let resolveBike: ((value: unknown) => void) | null = null;
    getDocsMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveBike = resolve;
      }) as never)
      .mockResolvedValueOnce({ empty: true, docs: [] } as never)
      .mockResolvedValueOnce({ empty: true, docs: [] } as never);

    const hook = renderHook(({ sport }) => usePlanModel(sport), {
      wrapper,
      initialProps: { sport: "bike" },
    });
    hook.rerender({ sport: "run" });
    await waitFor(() => expect(hook.result.current.freshLoaded).toBe(true));

    resolveBike?.({
      empty: false,
      docs: [{ id: "stale-bike", data: () => ({ discipline: "bike" }) }],
    });
    await Promise.resolve();

    prepareTrainingSurfaceCacheOwner("owner");
    expect(getTrainingSurfaceCache({
      uid: "owner",
      surface: "plan",
      sport: "bike",
      locale: "ko",
    })).toBeNull();
    getDocsMock.mockImplementation(originalImplementation);
  });

  it("preserves the cached goal and weeks when only the fresh plan request fails", async () => {
    const cacheKey = {
      uid: "owner",
      surface: "plan" as const,
      sport: "bike",
      locale: "ko",
    };
    const cachedTuple = {
      goal: { id: "cached-goal", discipline: "bike" },
      weeks: [{ id: "cached-week", weekNumber: 1, days: [] }],
    };
    prepareTrainingSurfaceCacheOwner("owner");
    setTrainingSurfaceCache(cacheKey, cachedTuple);
    const getDocsMock = vi.mocked(getDocs);
    const originalImplementation = getDocsMock.getMockImplementation()!;
    getDocsMock
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ id: "fresh-goal", data: () => ({ discipline: "bike" }) }],
      } as never)
      .mockRejectedValueOnce(new Error("plan offline"));

    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(getDocsMock).toHaveBeenCalledTimes(2));

    expect(hook.result.current.goal?.id).toBe("cached-goal");
    expect(hook.result.current.weeks[0]?.id).toBe("cached-week");
    expect(getTrainingSurfaceCache<typeof cachedTuple>(cacheKey)).toEqual(cachedTuple);
    await waitFor(() => expect(hook.result.current.planError).toEqual(new Error("plan offline")));
    expect(hook.result.current.loadError).toEqual(new Error("plan offline"));
    expect(hook.result.current.freshLoaded).toBe(false);
    act(() => hook.result.current.retryLoad());
    await waitFor(() => expect(hook.result.current.freshLoaded).toBe(true));
    expect(hook.result.current.loadError).toBeNull();
    getDocsMock.mockImplementation(originalImplementation);
  });

  it("keeps manual plan refresh errors visible until a successful retry without losing the saved weeks", async () => {
    setCollectionDocs("goals", [{ id: "goal", userId: "owner", discipline: "bike", status: "active" }]);
    setCollectionDocs("goals/goal/plan", [{ id: "week", weekNumber: 1, days: [] }]);
    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(hook.result.current.freshLoaded).toBe(true));
    const failure = new Error("manual plan offline");
    vi.mocked(getDocs).mockRejectedValueOnce(failure);
    await act(async () => { await expect(hook.result.current.refreshPlanWeeks()).rejects.toBe(failure); });
    expect(hook.result.current.planError).toBe(failure);
    expect(hook.result.current.freshLoaded).toBe(false);
    expect(hook.result.current.goal?.id).toBe("goal");
    expect(hook.result.current.weeks[0]?.id).toBe("week");
    await act(async () => { await hook.result.current.refreshPlanWeeks(); });
    expect(hook.result.current.loadError).toBeNull();
    expect(hook.result.current.freshLoaded).toBe(true);
  });

  it("never exposes the previous sport tuple while the next key is taking ownership", () => {
    prepareTrainingSurfaceCacheOwner("owner");
    setTrainingSurfaceCache({
      uid: "owner", surface: "plan", sport: "bike", locale: "ko",
    }, { goal: { id: "bike-goal" }, weeks: [{ id: "bike-week", days: [] }] });
    setTrainingSurfaceCache({
      uid: "owner", surface: "plan", sport: "run", locale: "ko",
    }, { goal: { id: "run-goal" }, weeks: [{ id: "run-week", days: [] }] });
    const getDocsMock = vi.mocked(getDocs);
    const originalImplementation = getDocsMock.getMockImplementation()!;
    getDocsMock.mockImplementation(() => new Promise(() => {}) as never);
    const hook = renderHook(({ sport }) => usePlanModel(sport), {
      wrapper,
      initialProps: { sport: "bike" },
    });

    expect(hook.result.current.goal?.id).toBe("bike-goal");
    hook.rerender({ sport: "run" });

    expect(hook.result.current.goal?.id).not.toBe("bike-goal");
    expect(hook.result.current.weeks[0]?.id).not.toBe("bike-week");
    getDocsMock.mockImplementation(originalImplementation);
  });

  it("does not reread the cache on same-key renders or a manual data refresh", async () => {
    prepareTrainingSurfaceCacheOwner("owner");
    setTrainingSurfaceCache({
      uid: "owner", surface: "plan", sport: "bike", locale: "ko",
    }, { goal: { id: "cached-goal", discipline: "bike" }, weeks: [] });
    const getDocsMock = vi.mocked(getDocs);
    const originalImplementation = getDocsMock.getMockImplementation()!;
    getDocsMock
      .mockImplementationOnce(() => new Promise(() => {}) as never)
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ id: "fresh-week", data: () => ({ weekNumber: 1, days: [] }) }],
      } as never);
    const cacheRead = vi.spyOn(trainingSurfaceCache, "getTrainingSurfaceCache");
    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    try {
      expect(hook.result.current.goal?.id).toBe("cached-goal");
      const initialReads = cacheRead.mock.calls.length;
      hook.rerender();
      expect(cacheRead).toHaveBeenCalledTimes(initialReads);

      await act(async () => hook.result.current.refreshPlanWeeks());
      expect(hook.result.current.weeks[0]?.id).toBe("fresh-week");
      expect(cacheRead).toHaveBeenCalledTimes(initialReads);
    } finally {
      hook.unmount();
      cacheRead.mockRestore();
      getDocsMock.mockReset().mockImplementation(originalImplementation);
    }
  });

  it("loads the matching cache on sport locale and user transitions", () => {
    prepareTrainingSurfaceCacheOwner("owner");
    for (const [sport, locale, id] of [
      ["bike", "ko", "bike-ko"],
      ["run", "ko", "run-ko"],
      ["run", "en", "run-en"],
    ]) {
      setTrainingSurfaceCache({ uid: "owner", surface: "plan", sport, locale }, {
        goal: { id }, weeks: [{ id: `${id}-week`, days: [] }],
      });
    }
    const getDocsMock = vi.mocked(getDocs);
    const originalImplementation = getDocsMock.getMockImplementation()!;
    getDocsMock.mockImplementation(() => new Promise(() => {}) as never);
    const hook = renderHook(({ sport }) => usePlanModel(sport), {
      wrapper, initialProps: { sport: "bike" },
    });
    try {
      expect(hook.result.current.goal?.id).toBe("bike-ko");
      hook.rerender({ sport: "run" });
      expect(hook.result.current.goal?.id).toBe("run-ko");
      mocks.locale = "en";
      hook.rerender({ sport: "run" });
      expect(hook.result.current.goal?.id).toBe("run-en");
      expect(hook.result.current.weeks[0]?.id).toBe("run-en-week");

      mocks.user = { uid: "next-owner" };
      prepareTrainingSurfaceCacheOwner("next-owner");
      setTrainingSurfaceCache({
        uid: "next-owner", surface: "plan", sport: "run", locale: "en",
      }, { goal: { id: "next-goal" }, weeks: [] });
      hook.rerender({ sport: "run" });
      expect(hook.result.current.goal?.id).toBe("next-goal");
      expect(hook.result.current.weeks).toEqual([]);
      expect(hook.result.current.cacheHit).toBe(true);
    } finally {
      hook.unmount();
      getDocsMock.mockImplementation(originalImplementation);
    }
  });

  it("does not let a late manual refresh reclaim a previous cache owner", async () => {
    prepareTrainingSurfaceCacheOwner("owner");
    setTrainingSurfaceCache({
      uid: "owner",
      surface: "plan",
      sport: "bike",
      locale: "ko",
    }, {
      goal: { id: "owner-goal", discipline: "bike" },
      weeks: [],
    });
    const getDocsMock = vi.mocked(getDocs);
    const originalImplementation = getDocsMock.getMockImplementation()!;
    let resolveLoad: ((value: unknown) => void) | null = null;
    let resolveRefresh: ((value: unknown) => void) | null = null;
    getDocsMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveLoad = resolve;
      }) as never)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve;
      }) as never);
    const mounted = renderHook(() => usePlanModel("bike"), { wrapper });
    expect(mounted.result.current.goal?.id).toBe("owner-goal");
    let refreshPromise: Promise<void> = Promise.resolve();
    act(() => {
      refreshPromise = mounted.result.current.refreshPlanWeeks();
    });
    mounted.unmount();
    prepareTrainingSurfaceCacheOwner("next-owner");
    const nextKey = {
      uid: "next-owner",
      surface: "plan" as const,
      sport: "bike",
      locale: "ko",
    };
    setTrainingSurfaceCache(nextKey, { goal: null, weeks: [{ id: "next-week" }] });

    resolveRefresh?.({ empty: true, docs: [] });
    await refreshPromise;
    resolveLoad?.({ empty: true, docs: [] });
    await Promise.resolve();

    expect(getTrainingSurfaceCache(nextKey)).toEqual({
      goal: null,
      weeks: [{ id: "next-week" }],
    });
    getDocsMock.mockImplementation(originalImplementation);
  });

  it("clears cached Plan data immediately when Auth logs out", async () => {
    prepareTrainingSurfaceCacheOwner("owner");
    const cacheKey = {
      uid: "owner",
      surface: "plan" as const,
      sport: "bike",
      locale: "ko",
    };
    setTrainingSurfaceCache(cacheKey, { goal: { id: "private-goal" }, weeks: [] });
    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    expect(hook.result.current.cacheHit).toBe(true);

    mocks.user = null;
    hook.rerender();

    await waitFor(() => expect(hook.result.current.user).toBeNull());
    expect(getTrainingSurfaceCache(cacheKey)).toBeNull();
  });
  it("uses projection TSB without subscribing to timeseries and respects the recovery flag", () => {
    mocks.freshTraining.mockReturnValue({ revalidating: false, justRecomputed: false, currentTsb: -20 });
    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    expect(hook.result.current.currentTsb).toBe(-20);
    expect(mocks.freshTraining).toHaveBeenCalledWith("bike", true, true);
    expect(mocks.fitnessTimeseries).not.toHaveBeenCalled();

    resetRuntimeConfigForTests({ trainingDecisionEnabled: true });
    hook.rerender();
    expect(hook.result.current.currentTsb).toBeNull();
    expect(mocks.fitnessTimeseries).not.toHaveBeenCalled();

    resetRuntimeConfigForTests({ trainingDecisionEnabled: false });
    hook.rerender();
    expect(hook.result.current.currentTsb).toBe(-20);
  });

  it("native 계획은 3분 재진입과 복귀 요청을 생략하고 retry는 즉시 다시 읽는다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    setCollectionDocs("goals", [{ id: "native-goal", userId: "owner", discipline: "bike", eventDate: Date.now() }]);
    setCollectionDocs("goals/native-goal/plan", [{ id: "week", weekNumber: 1, days: [] }]);
    const first = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(first.result.current.freshLoaded).toBe(true));
    first.unmount();
    vi.mocked(getDocs).mockClear();
    const second = renderHook(() => usePlanModel("bike"), { wrapper });
    expect(second.result.current.goal?.id).toBe("native-goal");
    expect(second.result.current.freshLoaded).toBe(true);
    expect(getDocs).not.toHaveBeenCalled();
    await act(async () => second.result.current.refreshPlanWeeks(false));
    expect(getDocs).not.toHaveBeenCalled();
    act(() => second.result.current.retryLoad());
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2));
    expect(readPlanSnapshot(planSnapshotKey("owner", "bike", "ko"))?.fresh).toBe(true);
  });

  it("native 빈계획도 3분 재사용하며 stale 데이터는 실패 시 timestamp를 갱신하지 않는다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    setCollectionDocs("goals", []);
    const first = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(first.result.current.freshLoaded).toBe(true));
    first.unmount();
    const key = planSnapshotKey("owner", "bike", "ko");
    expect(readPlanSnapshot(key)).toMatchObject({ data: { goal: null, weeks: [] }, fresh: true });
    vi.mocked(Date.now).mockReturnValue(now + 180_000);
    const getDocsMock = vi.mocked(getDocs);
    const original = getDocsMock.getMockImplementation()!;
    getDocsMock.mockRejectedValueOnce(new Error("offline"));
    const second = renderHook(() => usePlanModel("bike"), { wrapper });
    expect(second.result.current.loading).toBe(false);
    await waitFor(() => expect(readPlanSnapshot(key)?.fresh).toBe(false));
    expect(readPlanSnapshot(key)?.savedAt).toBe(now);
    second.unmount();
    getDocsMock.mockImplementation(original);
  });

  it("visible native 계획은 KST 자정에 3분보다 먼저 한번 재조회한다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    const midnight = Date.parse("2026-10-15T14:59:40Z");
    vi.spyOn(Date, "now").mockReturnValue(midnight);
    setCollectionDocs("goals", []);
    const first = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(first.result.current.freshLoaded).toBe(true));
    first.unmount();
    vi.mocked(getDocs).mockClear();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const second = renderHook(() => usePlanModel("bike"), { wrapper });
    expect(getDocs).not.toHaveBeenCalled();
    vi.mocked(Date.now).mockReturnValue(midnight + 20_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(second.result.current.freshLoaded).toBe(true);
  });

  it("stale 복귀는 주차뿐 아니라 같은 ID 목표 metadata와 목표 교체도 다시 읽는다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    const now = Date.parse("2026-10-15T03:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    setCollectionDocs("goals", [{ id: "goal", userId: "owner", discipline: "bike", title: "이전 목표", eventDate: now }]);
    setCollectionDocs("goals/goal/plan", [{ id: "week", days: [], weekNumber: 1 }]);
    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(hook.result.current.freshLoaded).toBe(true));
    setCollectionDocs("goals", [{ id: "goal", userId: "owner", discipline: "bike", title: "수정된 목표", eventDate: now + 86_400_000 }]);
    vi.mocked(Date.now).mockReturnValue(now + 180_000);
    await act(async () => hook.result.current.refreshPlanWeeks(false));
    await waitFor(() => expect(hook.result.current.goal?.title).toBe("수정된 목표"));
    expect(hook.result.current.goal?.eventDate).toBe(now + 86_400_000);
    setCollectionDocs("goals", [{ id: "replacement", userId: "owner", discipline: "bike", title: "새 활성 목표", status: "active", eventDate: now }]);
    setCollectionDocs("goals/replacement/plan", [{ id: "replacement-week", days: [], weekNumber: 1 }]);
    vi.mocked(Date.now).mockReturnValue(now + 360_000);
    await act(async () => hook.result.current.refreshPlanWeeks(false));
    await waitFor(() => expect(hook.result.current.goal?.id).toBe("replacement"));
    expect(hook.result.current.weeks[0]?.id).toBe("replacement-week");
  });

  it("stale 빈계획 복귀도 새로 생성된 목표를 조회한다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    const now = Date.parse("2026-10-15T03:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    setCollectionDocs("goals", []);
    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(hook.result.current.freshLoaded).toBe(true));
    setCollectionDocs("goals", [{ id: "created", userId: "owner", discipline: "bike", eventDate: now }]);
    setCollectionDocs("goals/created/plan", []);
    vi.mocked(Date.now).mockReturnValue(now + 180_000);
    await act(async () => hook.result.current.refreshPlanWeeks(false));
    await waitFor(() => expect(hook.result.current.goal?.id).toBe("created"));
  });

  it("주차만 강제 갱신하면 목표 savedAt과 freshness 만료 시각을 연장하지 않는다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    const now = Date.parse("2026-10-15T03:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    setCollectionDocs("goals", [{ id: "goal", userId: "owner", discipline: "bike", eventDate: now }]);
    setCollectionDocs("goals/goal/plan", [{ id: "week", days: [], weekNumber: 1 }]);
    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(hook.result.current.freshLoaded).toBe(true));
    const key = planSnapshotKey("owner", "bike", "ko");
    const initial = readPlanSnapshot(key)!;
    vi.mocked(Date.now).mockReturnValue(now + 120_000);
    setCollectionDocs("goals/goal/plan", [{ id: "edited-week", days: [], weekNumber: 1 }]);
    await act(async () => hook.result.current.refreshPlanWeeks());
    expect(hook.result.current.weeks[0]?.id).toBe("edited-week");
    expect(readPlanSnapshot(key)).toMatchObject({ savedAt: initial.savedAt, freshUntil: initial.freshUntil, fresh: true });
    vi.mocked(Date.now).mockReturnValue(now + 180_000);
    expect(readPlanSnapshot(key)?.fresh).toBe(false);
  });

  it("늦은 주차 응답은 동일 ID의 새 목표 metadata와 성공 스냅샷을 덮지 않는다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    setCollectionDocs("goals", [{ id: "goal", userId: "owner", discipline: "bike", title: "old", eventDate: Date.now() }]);
    setCollectionDocs("goals/goal/plan", [{ id: "old-week", days: [], weekNumber: 1 }]);
    const hook = renderHook(() => usePlanModel("bike"), { wrapper });
    await waitFor(() => expect(hook.result.current.freshLoaded).toBe(true));
    let resolveWeeks: ((value: unknown) => void) | undefined;
    vi.mocked(getDocs).mockImplementationOnce(() => new Promise(resolve => { resolveWeeks = resolve; }) as never);
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = hook.result.current.refreshPlanWeeks(); });
    setCollectionDocs("goals", [{ id: "goal", userId: "owner", discipline: "bike", title: "new metadata", eventDate: Date.now() + 86_400_000 }]);
    setCollectionDocs("goals/goal/plan", [{ id: "new-week", days: [], weekNumber: 1 }]);
    act(() => hook.result.current.retryLoad());
    await waitFor(() => expect(hook.result.current.goal?.title).toBe("new metadata"));
    await act(async () => {
      resolveWeeks?.({ docs: [{ id: "late-old-week", data: () => ({ days: [], weekNumber: 1 }) }] });
      await pending;
    });
    expect(hook.result.current.weeks[0]?.id).toBe("new-week");
    expect(readPlanSnapshot(planSnapshotKey("owner", "bike", "ko"))?.data).toMatchObject({
      goal: { title: "new metadata" }, weeks: [{ id: "new-week" }],
    });
  });

  it("주차 응답 대기 중 fresh 만료를 넘으면 목표를 fresh로 표시하지 않는다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "12345678-1234-1234-1234-123456789abc";
    const now = Date.parse("2026-10-15T03:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    setCollectionDocs("goals", [{ id: "goal", userId: "owner", discipline: "bike", eventDate: now }]);
    setCollectionDocs("goals/goal/plan", []);
    const hook = renderHook(() => usePlanModel("bike", false), { wrapper });
    await waitFor(() => expect(hook.result.current.freshLoaded).toBe(true));
    vi.mocked(Date.now).mockReturnValue(now + 120_000);
    vi.mocked(getDocs).mockImplementationOnce(() => {
      vi.mocked(Date.now).mockReturnValue(now + 180_001);
      return Promise.resolve({ docs: [] }) as never;
    });
    await act(async () => hook.result.current.refreshPlanWeeks());
    expect(hook.result.current.freshLoaded).toBe(false);
    expect(readPlanSnapshot(planSnapshotKey("owner", "bike", "ko"))).toMatchObject({ savedAt: now, fresh: false });
  });

});
