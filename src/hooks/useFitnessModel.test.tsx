import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import type { ActivityMetricStatus } from "../features/fitness/useActivityDerivedDocuments";
import { activityDerivedDocumentRevision } from "../features/fitness/derivedDocumentReadAttempts";
import * as cache from "../embedded/trainingSurfaceCache";
import { useFitnessModel } from "./useFitnessModel";

const mocks = vi.hoisted(() => ({
  user: { uid: "rider-a", isAnonymous: false },
  firestore: {},
  t: (key: string) => key,
  status: new Map<string, ActivityMetricStatus>(),
  derived: vi.fn(),
  snapshot: null as null | ((value: { docs: { id: string; data: () => Activity }[] }) => void),
  timeseries: null as FitnessTimeseriesDoc | null,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t, i18n: { language: "ko" } }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, profile: null }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ firestore: mocks.firestore }) }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => path,
  query: (path: string) => path,
  doc: vi.fn(), limit: vi.fn(), orderBy: vi.fn(), where: vi.fn(),
  onSnapshot: (path: string, callback: typeof mocks.snapshot) => {
    if (path === "activities") mocks.snapshot = callback;
    return vi.fn();
  },
}));
vi.mock("../features/fitness/useActivityDerivedDocuments", () => ({
  useActivityDerivedDocuments: (...args: unknown[]) => {
    mocks.derived(...args);
    return { streamsMap: new Map(), metricsMap: new Map(), metricStatusMap: mocks.status };
  },
}));
vi.mock("./useFtpHistory", () => ({ useFtpHistory: () => ({ entries: [] }) }));
vi.mock("./useMobile", () => ({ useMobile: () => false }));
vi.mock("./usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
vi.mock("./useBikeFtpDecision", () => ({ useBikeFtpDecision: () => ({ decision: null }) }));
vi.mock("./useCoachRiderInsight", () => ({ useCoachRiderInsight: () => ({ insight: null }) }));
vi.mock("./useUserFitness", () => ({ useUserFitness: () => ({ fitness: null }) }));
vi.mock("./useFitnessClock", () => ({ useFitnessClock: () => Date.now() }));
vi.mock("./useConsistencyStreak", () => ({ useConsistencyStreak: () => ({ summary: null }) }));
vi.mock("./useRunRecords", () => ({ useRunRecords: () => ({ run: null }) }));
vi.mock("./useMilestones", () => ({ useMilestones: () => ({ achieved: new Map(), markCelebrated: vi.fn() }) }));
vi.mock("./useFreshTraining", () => ({ useFreshTraining: () => ({ revalidating: false, justRecomputed: false }) }));
vi.mock("./useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({
  timeseries: mocks.timeseries, loaded: true, error: null, cacheHit: true, freshLoaded: true,
}) }));

const bike = { id: "bike", userId: "rider-a", type: "Ride", startTime: Date.now(), summary: { ridingTimeMillis: 3600000, distanceMeters: 20000 } } as Activity;
const run = { ...bike, id: "run", type: "Run" } as Activity;
const options = { enableCoachRiderInsight: false };
function setStatus(activity: Activity, state: ActivityMetricStatus["state"]) {
  mocks.status.set(activity.id, { revision: activityDerivedDocumentRevision(activity), state });
}
function seed(sport: string, activities = [bike, run]) {
  cache.prepareTrainingSurfaceCacheOwner(mocks.user.uid);
  cache.setTrainingSurfaceCache({ uid: mocks.user.uid, surface: "fitness", sport, locale: "ko", range: sport === "tri" ? 365 : 90 }, { activities });
}
beforeEach(() => {
  mocks.user = { uid: "rider-a", isAnonymous: false };
  mocks.timeseries = null;
  mocks.status.clear();
  mocks.derived.mockClear();
  cache.clearTrainingSurfaceCache();
  setStatus(bike, "loaded");
  setStatus(run, "loaded");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("useFitnessModel", () => {
  it("유효한 빈 정본을 활동 기반 fallback으로 바꾸지 않는다", () => {
    seed("bike");
    mocks.timeseries = { discipline: "bike", schemaVersion: 1, computedAt: Date.now(), startDate: null, endDate: null, pointCount: 0, points: [] };
    const { result } = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.hasCanonicalHistory).toBe(true);
    expect(result.current.fitnessData).toEqual([]);
    expect(result.current.mobilePageProps.pmcHistoryPoints).toEqual([]);
  });

  it("스키마 검증에 실패한 시계열을 정본 이력으로 소비하지 않는다", () => {
    seed("bike");
    mocks.timeseries = {
      discipline: "bike", schemaVersion: 999, computedAt: Date.now(),
      startDate: "2023-01-01", endDate: "2023-01-01", pointCount: 1,
      points: [{ date: "2023-01-01", ctl: 99999, atl: 99999, tsb: 0, dailyLoad: 99999 }],
    };
    const { result } = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.hasCanonicalHistory).toBe(false);
    expect(result.current.fitnessData.some((point) => point.ctl === 99999)).toBe(false);
    expect(result.current.mobilePageProps.pmcHistoryCanonical).toBe(false);
  });
  it.each(["loading", "error"] as const)("자전거 분석은 러닝 %s 상태에 막히지 않는다", (state) => {
    seed("bike");
    setStatus(run, state);
    const { result } = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.derivedMetricsSettled).toBe(true);
    expect(result.current.derivedMetricsError).toBe(false);
    expect(result.current.disciplineActivities).toEqual([bike]);
    expect(mocks.derived).toHaveBeenLastCalledWith("rider-a", [bike, run]);
  });
  it.each(["loading", "error"] as const)("선택한 자전거의 %s 상태는 유지한다", (state) => {
    seed("bike");
    setStatus(bike, state);
    const { result } = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.derivedMetricsSettled).toBe(state !== "loading");
    expect(result.current.derivedMetricsError).toBe(state === "error");
  });
  it.each(["loading", "error"] as const)("철인은 러닝 %s 상태도 합산한다", (state) => {
    seed("tri");
    setStatus(run, state);
    const { result } = renderHook(() => useFitnessModel("tri", options));
    expect(result.current.derivedMetricsSettled).toBe(state !== "loading");
    expect(result.current.derivedMetricsError).toBe(state === "error");
  });
  it("같은 키의 데이터 갱신과 재렌더는 캐시를 다시 복제하지 않는다", () => {
    seed("bike");
    const getter = vi.spyOn(cache, "getTrainingSurfaceCache");
    const { rerender, result } = renderHook(() => useFitnessModel("bike", options));
    getter.mockClear();
    act(() => mocks.snapshot!({ docs: [{ id: bike.id, data: () => bike }] }));
    rerender();
    expect(result.current.activities).toEqual([bike]);
    expect(getter).not.toHaveBeenCalled();
  });
  it("종목과 계정 키가 바뀌면 해당 캐시를 다시 읽는다", () => {
    seed("bike");
    seed("run", [run]);
    const getter = vi.spyOn(cache, "getTrainingSurfaceCache");
    const { rerender, result } = renderHook(({ sport }) => useFitnessModel(sport, options), { initialProps: { sport: "bike" } });
    getter.mockClear();
    rerender({ sport: "run" });
    expect(getter).toHaveBeenCalledWith(expect.objectContaining({ uid: "rider-a", sport: "run" }));
    expect(result.current.activities).toEqual([run]);
    getter.mockClear();
    mocks.user = { uid: "rider-b", isAnonymous: false };
    rerender({ sport: "run" });
    expect(getter).toHaveBeenCalledWith(expect.objectContaining({ uid: "rider-b", sport: "run" }));
    expect(result.current.activities).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});
