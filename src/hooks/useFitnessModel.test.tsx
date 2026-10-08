import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
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
  metrics: new Map<string, ActivityMetrics>(),
  derived: vi.fn(),
  subscriptionCallbacks: [] as Array<{ path: string; callback: (...args: unknown[]) => void }>,
  subscriptions: vi.fn(),
  unsubscribe: vi.fn(),
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
    mocks.subscriptions(path);
    if (callback) mocks.subscriptionCallbacks.push({ path, callback: callback as (...args: unknown[]) => void });
    if (path === "activities") mocks.snapshot = callback;
    return mocks.unsubscribe;
  },
}));
vi.mock("../features/fitness/useActivityDerivedDocuments", () => ({
  useActivityDerivedDocuments: (...args: unknown[]) => {
    mocks.derived(...args);
    return { metricsMap: mocks.metrics, metricStatusMap: mocks.status };
  },
}));
vi.mock("./useFtpHistory", () => ({ useFtpHistory: () => ({ entries: [] }) }));
vi.mock("./useMobile", () => ({ useMobile: () => false }));
vi.mock("./usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
vi.mock("../features/fitness/useFitnessCurves", () => ({ useFitnessCurves: () => ({
  run: { recent28: [], prev28: [] }, swim: { recent28: [], prev28: [] },
}) }));
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
  mocks.metrics.clear();
  mocks.derived.mockClear();
  mocks.subscriptions.mockClear();
  mocks.subscriptionCallbacks.length = 0;
  mocks.unsubscribe.mockClear();
  cache.clearTrainingSurfaceCache();
  setStatus(bike, "loaded");
  setStatus(run, "loaded");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("useFitnessModel", () => {
  it.each([{ loadSnapshot: null, pmc: null }, { loadSnapshot: null }, { pmc: null }, { inputInvalidatedAt: null }, {}])("현대 계약 필드 %j의 무효 근거와 legacy 차트를 보존한다", fields => {
    seed("bike");
    const now = Date.parse("2026-09-06T12:00:00Z");
    const point = { date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 70 };
    mocks.timeseries = { discipline: "bike", schemaVersion: 1, computedAt: now, startDate: point.date,
      endDate: point.date, pointCount: 1, points: [point], ...fields } as FitnessTimeseriesDoc;
    const { result } = renderHook(() => useFitnessModel("bike", options));
    const modern = Object.keys(fields).length > 0;
    if (modern) expect(result.current.currentPoint).toBeNull();
    expect(result.current.pmcHistoryPoints[0]).toMatchObject({ ctl: 40, dailyLoad: 70,
      loadStatus: modern ? "unconfirmed" : "snapshot", calculationStatus: modern ? "estimated" : "server" });
  });
  it("새 입력이 기존 실패 시도보다 늦으면 무효화 시각부터 기다리고 snapshot 없이 지연으로 전환한다", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-09-06T12:00:00Z");
    vi.setSystemTime(now);
    seed("bike");
    const point = { date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 40 };
    mocks.timeseries = { discipline: "bike", schemaVersion: 1, computedAt: now - 120000, points: [point],
      startDate: point.date, endDate: point.date, pointCount: 1,
      inputInvalidatedAt: { seconds: now / 1000, nanoseconds: 0 },
      pmc: { status: "failed", attemptId: "old", inputRevision: 1, processedInputRevision: 1, asOf: now - 120000, deadlineAt: now - 60000, errorCode: "old" },
    };
    const { result, unmount } = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.pmcHistoryPoints[0].calculationStatus).toBe("pending");
    act(() => vi.advanceTimersByTime(60001));
    expect(result.current.pmcHistoryPoints[0]).toMatchObject({ ctl: 40, loadStatus: "unconfirmed", calculationStatus: "stale" });
    unmount();
    vi.useRealTimers();
  });
  it("손상된 현대 snapshot은 headline 정본이나 숨은 클라이언트 폴백이 되지 않는다", () => {
    seed("bike");
    const now = Date.parse("2026-09-06T12:00:00Z");
    const point = {date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 70};
    mocks.timeseries = {discipline: "bike", schemaVersion: 1, computedAt: now, startDate: point.date, endDate: point.date, pointCount: 1, points: [point],
      loadSnapshot: {inputRevision: 2, inputDigest: "", asOf: now, inputReadTime: {seconds: now / 1000, nanoseconds: 0}, coverageStartDate: point.date, coverageEndDate: point.date, points: [{date: point.date, dailyLoad: 70, status: "final", quality: "precomputed"}]},
      pmc: {status: "processed", attemptId: "invalid", inputRevision: 2, processedInputRevision: 2, asOf: now, deadlineAt: now + 1000, errorCode: null}};
    const {result} = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.currentPoint).toBeNull();
    expect(result.current.pmcHistoryPoints[0]).toMatchObject({ctl: 40, loadStatus: "unconfirmed", calculationStatus: "estimated"});
  });

  it("새 snapshot 없이 deadline에 도달해도 PMC 대기를 처리 지연으로 바꾼다", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-09-06T12:00:00Z");
    vi.setSystemTime(now);
    seed("bike");
    const point = { date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 40 };
    mocks.timeseries = { discipline: "bike", schemaVersion: 1, computedAt: now, points: [point],
      startDate: point.date, endDate: point.date, pointCount: 1,
      loadSnapshot: { inputRevision: 2, inputDigest: "a".repeat(64), asOf: now, inputReadTime: { seconds: now / 1000, nanoseconds: 0 },
        coverageStartDate: point.date, coverageEndDate: point.date,
        points: [{ date: point.date, dailyLoad: 70, status: "final", quality: "estimated" }] },
      pmc: { status: "pending", attemptId: "next", inputRevision: 2, processedInputRevision: 1, asOf: now - 1, deadlineAt: now + 1000, errorCode: null },
    };
    const { result, unmount } = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.pmcHistoryPoints[0].calculationStatus).toBe("pending");
    act(() => vi.advanceTimersByTime(1001));
    expect(result.current.pmcHistoryPoints[0]).toMatchObject({ dailyLoad: 70, ctl: 40, loadStatus: "final", calculationStatus: "stale" });
    unmount();
    vi.useRealTimers();
  });

  it("이력 표시 상태를 별도 전달하고 기존 KPI 입력은 보존한다", () => {
    seed("bike");
    const point = { date: "2026-09-06", ctl: 40, atl: 45, tsb: -5, dailyLoad: 70 };
    mocks.timeseries = { discipline: "bike", schemaVersion: 1, computedAt: Date.parse("2026-09-06T12:00:00Z"),
      startDate: point.date, endDate: point.date, pointCount: 1, points: [point] };
    const { result } = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.fitnessData).toEqual([point]);
    expect(result.current.currentPoint).toEqual(point);
    expect(result.current.pmcHistoryPoints).toEqual([{ ...point, loadStatus: "snapshot", calculationStatus: "server" }]);
    expect(result.current.mobilePageProps.pmcHistoryPoints).toBe(result.current.pmcHistoryPoints);
  });

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
    expect(mocks.derived).toHaveBeenLastCalledWith("rider-a", [bike, run], true);
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

it("shows all seven historical power zones even without a current profile FTP", () => {
 seed("bike", [bike]);
 mocks.metrics.set(bike.id, { powerZoneSec: [100, 0, 0, 0, 0, 0, 100], contextSnapshot: { ftp: 175 } } as ActivityMetrics);
 const { result } = renderHook(() => useFitnessModel("bike", options));
 expect(result.current.mobilePageProps.data.zoneSource).toBe("power");
 expect(result.current.mobilePageProps.data.zones).toHaveLength(7);
 expect(result.current.mobilePageProps.data.zones[0]?.pct).toBe(50);
 expect(result.current.mobilePageProps.data.zones[6]?.pct).toBe(50);
 expect(result.current.mobilePageProps.data.zones.every((zone) => zone.rangeLabel === "")).toBe(true);
});

it("uses valid HR evidence when legacy power zones leave Z7 unknown", () => {
  seed("bike", [bike]);
  mocks.metrics.set(bike.id, {
    powerZoneSec: [100, 0, 0, 0, 0, 100], hrZoneSec: [100, 100, 0, 0, 0],
  } as ActivityMetrics);
  const { result } = renderHook(() => useFitnessModel("bike", options));
  expect(result.current.mobilePageProps.data.zoneSource).toBe("hr");
  expect(result.current.mobilePageProps.data.zones).toHaveLength(5);
  expect(result.current.mobilePageProps.data.zones[0]?.pct).toBe(50);
});


it("숨으면 활동 구독만 멈추고 복귀하는 동안 기존 활동 UI를 유지한다", () => {
  const hook = renderHook(({ active }) => useFitnessModel("bike", { ...options, active }),
    { initialProps: { active: true } });
  act(() => mocks.snapshot?.({ docs: [{ id: bike.id, data: () => bike }] }));
  expect(hook.result.current.loading).toBe(false);
  const subscriptionCount = mocks.subscriptions.mock.calls.length;
  hook.rerender({ active: false });
  expect(mocks.subscriptions).toHaveBeenCalledTimes(subscriptionCount);
  expect(mocks.unsubscribe).toHaveBeenCalled();
  expect(hook.result.current.activities).toEqual([bike]);
  hook.rerender({ active: true });
  expect(mocks.subscriptions.mock.calls.length).toBeGreaterThan(subscriptionCount);
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.activities).toEqual([bike]);
  act(() => mocks.snapshot?.({ docs: [] }));
  expect(hook.result.current.activities).toEqual([]);
});


it("숨은 계정 전환은 목표를 무효화하고 이전 목표 콜백을 차단한다", () => {
  const hook = renderHook(({ active }) => useFitnessModel("bike", { ...options, active }),
    { initialProps: { active: true } });
  const callback = mocks.subscriptionCallbacks.find(entry => entry.path === "goals")!.callback;
  act(() => callback({ empty: false, docs: [{ id: "goal-a", data: () => ({ userId: "rider-a", discipline: "bike" }) }] }));
  expect(hook.result.current.activeGoal?.id).toBe("goal-a");
  hook.rerender({ active: false });
  expect(hook.result.current.activeGoal?.id).toBe("goal-a");
  mocks.user = { uid: "rider-b", isAnonymous: false };
  hook.rerender({ active: false });
  act(() => callback({ empty: false, docs: [{ id: "stale-goal", data: () => ({ userId: "rider-a", discipline: "bike" }) }] }));
  expect(hook.result.current.activeGoal).toBeNull();
  expect(hook.result.current.projection).toBeNull();
});


it("목표 교체와 빈 목표는 이전 projection을 지우고 늦은 목표 projection을 차단한다", () => {
  const hook = renderHook(() => useFitnessModel("bike", options));
  const goal = mocks.subscriptionCallbacks.find(entry => entry.path === "goals")!.callback;
  act(() => goal({ empty: false, docs: [{ id: "goal-a", data: () => ({ userId: "rider-a", discipline: "bike" }) }] }));
  const oldProjection = mocks.subscriptionCallbacks.at(-1)!.callback;
  act(() => oldProjection({ exists: () => true, data: () => ({ goalId: "goal-a" }) }));
  expect(hook.result.current.projection?.goalId).toBe("goal-a");
  act(() => goal({ empty: false, docs: [{ id: "goal-b", data: () => ({ userId: "rider-a", discipline: "bike" }) }] }));
  expect(hook.result.current.projection).toBeNull();
  act(() => oldProjection({ exists: () => true, data: () => ({ goalId: "goal-a" }) }));
  expect(hook.result.current.projection).toBeNull();
  const newProjection = mocks.subscriptionCallbacks.at(-1)!.callback;
  act(() => newProjection({ exists: () => true, data: () => ({ goalId: "goal-b" }) }));
  expect(hook.result.current.projection?.goalId).toBe("goal-b");
  act(() => goal({ empty: true, docs: [] }));
  expect(hook.result.current.projection).toBeNull();
  act(() => newProjection({ exists: () => true, data: () => ({ goalId: "goal-b" }) }));
  expect(hook.result.current.projection).toBeNull();
});


it("fresh snapshot 전 채택한 캐시도 TTL 후 복귀하면 기존 UI를 보존한다", () => {
  seed("bike", [bike]);
  const hook = renderHook(({ active }) => useFitnessModel("bike", { ...options, active }),
    { initialProps: { active: true } });
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.activities).toEqual([bike]);
  hook.rerender({ active: false });
  const future = Date.now() + 11 * 60 * 1000;
  vi.spyOn(Date, "now").mockReturnValue(future);
  hook.rerender({ active: true });
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.activities).toEqual([bike]);
});


it("복귀 후 같은 목표 구독을 다시 연결할 때 기존 projection을 보존한다", () => {
  const hook = renderHook(({ active }) => useFitnessModel("bike", { ...options, active }),
    { initialProps: { active: true } });
  const goalSnapshot = { empty: false, docs: [{ id: "goal-a", data: () => ({ userId: "rider-a", discipline: "bike" }) }] };
  act(() => mocks.subscriptionCallbacks.find(entry => entry.path === "goals")!.callback(goalSnapshot));
  act(() => mocks.subscriptionCallbacks.at(-1)!.callback({ exists: () => true, data: () => ({ goalId: "goal-a" }) }));
  hook.rerender({ active: false });
  hook.rerender({ active: true });
  act(() => mocks.subscriptionCallbacks.filter(entry => entry.path === "goals").at(-1)!.callback(goalSnapshot));
  expect(hook.result.current.projection?.goalId).toBe("goal-a");
});
