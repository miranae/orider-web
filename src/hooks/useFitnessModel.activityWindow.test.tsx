import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import { getDoc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { clearDocData, setCollectionDocs, setDocData } from "../__tests__/mocks/firebase";
import { clearTrainingSurfaceCache } from "../embedded/trainingSurfaceCache";
import { useFitnessModel } from "./useFitnessModel";
const mocks = vi.hoisted(() => ({user:{uid:"rider-a",isAnonymous:false},firestore:{}, functions:{}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined), timeseries:null as FitnessTimeseriesDoc|null}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, profile: null }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("./useTrainingDecision", () => ({useTrainingDecision:()=>({enabled:false,envelope:null})}));
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


const now = Date.parse("2026-10-08T12:00:00Z");
const day = 86_400_000;
const document = { version: 1, windowDays: 90, maxEntries: 768, generation: 1, updatedAt: now, truncated: false,
  entries: [
    { activityId: "now", startTime: now, mmp: { "5s": 300.4 } },
    { activityId: "recent-boundary", startTime: now - 28 * day, mmp: { "5s": 350.6 } },
    { activityId: "previous-boundary", startTime: now - 56 * day, mmp: { "5s": 500.5 } },
    { activityId: "expired", startTime: now - 56 * day - 1, mmp: { "5s": 900 } },
    { activityId: "future", startTime: now + 1, mmp: { "5s": 1000 } },
  ].map(fields => ({ ...fields, activityType: "Ride", discipline: "bike", hrZoneSec: [100, 0, 0, 0, 0], powerZoneSec: null,
    swolf: null, distancePerStroke: null, loadFocus: { load: 0, source: "unclassified", allocations: [], hasAnaerobicBikeDetail: false } })),
};
beforeEach(() => {
  clearTrainingSurfaceCache();
  vi.mocked(getDoc).mockClear(); vi.mocked(onSnapshot).mockClear(); vi.mocked(httpsCallable).mockClear();
  vi.spyOn(Date, "now").mockReturnValue(now);
  setCollectionDocs("activities", []);
  setDocData("users/rider-a/fitness/activity_window", document);
  for (const [id, discipline] of [["pace_run", "run"], ["css_swim", "swim"]]) setDocData(`users/rider-a/fitness/${id}`,
    {version: 1, discipline, windowDays: 56, maxEntries: 256, generation: 1, updatedAt: now, truncated: false, entries: []});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("fitness entry request budget", () => {
  it("실제 모델 진입은 활동 metrics 0개와 집계 윈도 1개만 읽고 활동 목록 없이 존/MMP를 표시한다", async () => {
    const { result } = renderHook(() => useFitnessModel("bike", {enableCoachRiderInsight: false}));
    await waitFor(() => expect(result.current.derivedMetricsSettled).toBe(true));
    const subscriptionPaths = vi.mocked(onSnapshot).mock.calls.map(([ref]) => (ref as {path:string}).path);
    const readPaths = vi.mocked(getDoc).mock.calls.map(([ref]) => (ref as {path:string}).path);
    expect(subscriptionPaths.filter(path => path === "users/rider-a/fitness/activity_window")).toHaveLength(1);
    expect([...subscriptionPaths, ...readPaths].some(path => path?.startsWith("activity_metrics/"))).toBe(false);
    expect(result.current.activities).toEqual([]);
    expect(result.current.zoneDistribution).toEqual([100, 0, 0, 0, 0]);
    expect(result.current.powerCurveProgressions.map(period => period.points)).toEqual([
      [{durationSeconds: 5, maxPower: 351}], [{durationSeconds: 5, maxPower: 501}],
    ]);
    expect(vi.mocked(httpsCallable).mock.calls.some(([, name]) => name === "ensureFitnessCurves")).toBe(false);
  });
  it("윈도 누락이면 callable 1회 재조회 후 부재를 오류로 종료한다", async () => {
    clearDocData("users/rider-a/fitness/activity_window");
    const { result, rerender } = renderHook(() => useFitnessModel("bike", { enableCoachRiderInsight: false }));
    await waitFor(() => expect(vi.mocked(getDoc).mock.calls.some(([ref]) =>
      (ref as {path:string}).path === "users/rider-a/fitness/activity_window")).toBe(true));
    expect(vi.mocked(httpsCallable).mock.calls.filter(([, name]) => name === "ensureFitnessCurves")).toHaveLength(1);
    expect(result.current.derivedMetricsSettled).toBe(true);
    expect(result.current.derivedMetricsError).toBe(true);
    rerender();
    expect(vi.mocked(httpsCallable).mock.calls.filter(([, name]) => name === "ensureFitnessCurves")).toHaveLength(1);
  });

});
