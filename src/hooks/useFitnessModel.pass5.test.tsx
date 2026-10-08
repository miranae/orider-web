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
    return { metricsMap: mocks.metrics, metricStatusMap: mocks.status };
  },
}));
vi.mock("./useFtpHistory", () => ({ useFtpHistory: () => ({ entries: [] }) }));
vi.mock("./useMobile", () => ({ useMobile: () => false }));
vi.mock("./usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
vi.mock("../features/fitness/useFitnessCurves", () => ({ useFitnessCurves: () => ({
  run: { recent28: [], prev28: [] }, swim: { recent28: [], prev28: [] },
  activityWindow: null, activityWindowLoaded: true, activityWindowError: false,
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
  cache.clearTrainingSurfaceCache();
  setStatus(bike, "loaded");
  setStatus(run, "loaded");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("pass5 accepted fitness IO", () => {
  const derived = { schemaVersion: 1, userId: "rider-a", inputBinding: "published", streamTss: 100 };
  it("prefers published canonical Strava load over raw 10", () => {
    const activity = { ...bike, source: "strava", summary: {...bike.summary, tss: 10}, serverDerivedLoad: derived } as Activity;
    seed("bike", [activity]);
    const {result} = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.dailyData.at(-1)?.totalLoad).toBe(100);
  });
  it("selects the physical Strava representative before aggregation", () => {
    const a = {...bike, id:"orider_twin", source:"orider", stravaTwinActivityId:222, summary:{...bike.summary,tss:70}} as Activity;
    const b = {...bike, id:"strava_222", source:"strava", stravaActivityId:222, summary:{...bike.summary,tss:80}} as Activity;
    seed("bike", [a,b]);
    const {result} = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.dailyData.at(-1)?.totalLoad).toBe(80);
  });
  it("retains summary-null healthy derived load through snapshot IO", () => {
    const activity = {...bike, summary:null, serverDerivedLoad:derived} as unknown as Activity;
    const {result} = renderHook(() => useFitnessModel("bike", options));
    act(() => mocks.snapshot!({docs:[{id:activity.id,data:()=>activity}]}));
    expect(result.current.activities).toEqual([activity]);
    expect(result.current.dailyData.at(-1)?.totalLoad).toBe(100);
  });
  it("preserves known 100 beside an unknown without manufacturing PMC or rest", () => {
    const known = {...bike, source:"strava", serverDerivedLoad:derived} as Activity;
    const unknown = {...bike,id:"unknown",summary:null} as unknown as Activity;
    seed("bike", [known,unknown]);
    const {result} = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.dailyData.at(-1)).toMatchObject({totalLoad:100,unknownCount:1});
    expect(result.current.fitnessData).toEqual([]);
    expect(result.current.rangeData.daily.at(-1)).toMatchObject({totalLoad:100,unknownCount:1});
    expect(result.current.weeklyStats).toMatchObject({thisWeekTSS:100,unknownCount:1,restDays:0});
    expect(result.current.mobilePageProps.data).toMatchObject({thisWeekTSS:100,loadUnknownCount:1});
  });
  it("tri retains known 100 in an unknown sport without confirming aggregate PMC", () => {
    seed("tri",[{...run, id:"known-run",summary:{...run.summary,tss:100}}, {...run,id:"unknown-run",summary:null} as unknown as Activity]);
    const {result} = renderHook(() => useFitnessModel("tri",options));
    expect(result.current.triFitnessBreakdown.run).toMatchObject({weeklyTSS:100,unknownCount:1,fitness:[]});
    expect(result.current.dailyData.at(-1)).toMatchObject({totalLoad:100,unknownCount:1});
    expect(result.current.weeklyStats).toMatchObject({thisWeekTSS:100,unknownCount:1,restDays:0});
  });
  it("tri preserves healthy canonical sport beside an unknown legacy sport", () => {
    const point = {date:new Date().toISOString().slice(0,10),ctl:40,atl:45,tsb:-5,dailyLoad:100};
    mocks.timeseries = {discipline:"bike",schemaVersion:1,computedAt:Date.now(),startDate:point.date,endDate:point.date,pointCount:1,points:[point]};
    seed("tri",[{...run,summary:null} as unknown as Activity]);
    const {result} = renderHook(() => useFitnessModel("tri",options));
    expect(result.current.triFitnessBreakdown.bike.fitness).toEqual([point]);
    expect(result.current.triFitnessBreakdown.bike.weeklyTSS).toBe(100);
    // 정본 날짜는 UTC이고 레거시 활동은 로컬 날짜라 자정 경계에서 같은 행이 아닐 수 있다.
    expect(result.current.dailyData.find(day => day.date === point.date)?.totalLoad).toBe(100);
    expect(result.current.dailyData.reduce((sum, day) => sum + (day.unknownCount ?? 0), 0)).toBe(1);
    expect(result.current.currentPoint).toBeNull();
  });
  it("keeps period-specific known flags for old100 and unknown today", () => {
    const old = {...bike,id:"old",startTime:Date.now()-14*86400000,summary:{...bike.summary,tss:100}};
    seed("bike",[old,{...bike,summary:null} as unknown as Activity]);
    const {result}=renderHook(()=>useFitnessModel("bike",options));
    expect(result.current.mobilePageProps.data).toMatchObject({thisWeekTSS:0,thisWeekUnknownCount:1,hasKnownThisWeekLoad:false,hasKnownWeeklyLoad:true});
    expect(result.current.weeklyStats.avgWeekTSS).toBeGreaterThan(0);
  });
  it("unknown-only input remains unconfirmed instead of a confirmed rest zero", () => {
    seed("bike", [{...bike,summary:null} as unknown as Activity]);
    const {result} = renderHook(() => useFitnessModel("bike", options));
    expect(result.current.dailyData.at(-1)).toMatchObject({unknownCount:1});
    expect(result.current.weeklyStats).toMatchObject({hasKnownLoad:false,unknownCount:1,restDays:0});
    expect(result.current.currentPoint).toBeNull();
  });
});
