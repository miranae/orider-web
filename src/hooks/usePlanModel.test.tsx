import { act, renderHook, waitFor } from "@testing-library/react";
import { collection, getDocs } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";
import { FirebaseServicesProvider } from "../contexts/FirebaseServicesContext";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { normalizePlanSport, usePlanModel } from "./usePlanModel";
import {
  clearTrainingSurfaceCache,
  getTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
  setTrainingSurfaceCache,
} from "../embedded/trainingSurfaceCache";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner" } as { uid: string } | null,
  freshTraining: vi.fn(() => ({ revalidating: false, justRecomputed: false })),
  fitnessTimeseries: vi.fn(() => ({ timeseries: null, loaded: true })),
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
  beforeEach(() => {
    clearTrainingSurfaceCache();
    mocks.user = { uid: "owner" };
    mocks.freshTraining.mockClear();
    mocks.fitnessTimeseries.mockClear();
    vi.mocked(collection).mockClear();
    vi.mocked(getDocs).mockClear();
  });

  it.each([
    ["bike", "bike"],
    ["run", "run"],
    ["swim", "swim"],
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
    expect(mocks.freshTraining).toHaveBeenCalledWith("run");
    expect(mocks.fitnessTimeseries).toHaveBeenCalledWith("owner", "run");
  });

  it("uses the bike model for an unsupported embedded sport value", async () => {
    setCollectionDocs("goals", []);

    const { result } = renderHook(() => usePlanModel("rowing"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.discipline).toBe("bike");
    expect(result.current.goal).toBeNull();
    expect(mocks.freshTraining).toHaveBeenCalledWith("bike");
    expect(mocks.fitnessTimeseries).toHaveBeenCalledWith("owner", "bike");
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
    expect(second.result.current.loadError).toBeNull();
    expect(second.result.current.weeks).toHaveLength(1);
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
    getDocsMock.mockImplementation(originalImplementation);
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
});
