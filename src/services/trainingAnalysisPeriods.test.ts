import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { loadTrainingAnalysisPeriods, trainingAnalysisPeriodsAvailable, validTrainingAnalysisPeriodsRequest, validateTrainingAnalysisPeriodsResponse } from "./trainingAnalysisPeriods";
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
import { periodFixture, request, runningPeriodFixture } from "./trainingAnalysisPeriods.fixture";
const stage = { appEnvironment: "stage", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net", trainingAnalysisPeriodsEnabled: true };
beforeEach(() => { resetRuntimeConfigForTests(stage); mocks.call.mockReset().mockResolvedValue({ data: periodFixture() }); mocks.callable.mockReset().mockReturnValue(mocks.call); });
describe("training period boundary", () => {
  it("requires explicit stage capability and exact compute origin", async () => {
    for (const config of [{}, { ...stage, trainingAnalysisPeriodsEnabled: false }, { ...stage, appEnvironment: "production" }, { ...stage, firebaseFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" }]) {
      resetRuntimeConfigForTests(config); expect(trainingAnalysisPeriodsAvailable()).toBe(false);
      await expect(loadTrainingAnalysisPeriods({} as FirebaseServices, "owner", request)).rejects.toThrow("api_unavailable");
    }
    expect(mocks.callable).not.toHaveBeenCalled();
  });
  it.each(["production-transport", "default-transport", "foreign-app"])("rejects %s before App Check or any network call", async kind => {
    const app = {};
    const services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } },
      functions: { app: kind === "foreign-app" ? {} : app, customDomain: kind === "production-transport" ? "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" : kind === "default-transport" ? undefined : stage.firebaseFunctionsBase },
      ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
    await expect(loadTrainingAnalysisPeriods(services, "owner", request)).rejects.toThrow("stage/callable-context-mismatch");
    expect(services.ensureAppCheckReady).not.toHaveBeenCalled();
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("accepts at most two finite historical ordered periods", () => {
    expect(validTrainingAnalysisPeriodsRequest(request, 10000)).toBe(true);
    expect(validTrainingAnalysisPeriodsRequest({ ...request, periods: Array(3).fill(request.periods[0]) }, 10000)).toBe(false);
    expect(validTrainingAnalysisPeriodsRequest({ ...request, periods: [{ fromInclusive: 10000, toExclusive: 1000 }] })).toBe(false);
    expect(validTrainingAnalysisPeriodsRequest(request, 9999)).toBe(false);
  });
  it("reads one callable and rejects account changes around App Check and response", async () => {
    const app = {};
    const auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
    const services = { auth, functions: { app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn(async () => {}) } as unknown as FirebaseServices;
    await expect(loadTrainingAnalysisPeriods(services, "owner", request)).resolves.toEqual(periodFixture());
    expect(mocks.callable).toHaveBeenCalledWith(services.functions, "getTrainingAnalysisPeriods");
    expect(mocks.call).toHaveBeenCalledTimes(1);
    auth.currentUser.uid = "other";
    await expect(loadTrainingAnalysisPeriods(services, "owner", request)).rejects.toThrow("account_changed");
    auth.currentUser.uid = "owner";
    mocks.call.mockImplementationOnce(async () => { auth.currentUser.uid = "other"; return { data: periodFixture() }; });
    await expect(loadTrainingAnalysisPeriods(services, "owner", request)).rejects.toThrow("account_changed");
  });
  it("validates totals, time windows, coverage, provenance and sensor denominators", () => {
    expect(validateTrainingAnalysisPeriodsResponse(periodFixture(), request)).toEqual(periodFixture());
    for (const mutate of [
      (r: TrainingAnalysisPeriodsResponse) => { r.periods[0]!.totals.movingTimeSec.totalValue = 0; },
      (r: TrainingAnalysisPeriodsResponse) => { r.periods[0]!.activities[0]!.startTime = 10000; },
      (r: TrainingAnalysisPeriodsResponse) => { r.periods[0]!.zones.heartRate.observedSeconds = 100; },
      (r: TrainingAnalysisPeriodsResponse) => { r.periods[0]!.zones.power.groups[0]!.seconds = [Number.NaN]; },
      (r: TrainingAnalysisPeriodsResponse) => { r.periods[0]!.coverage.truncated = true; },
      (r: TrainingAnalysisPeriodsResponse) => { r.periods[0]!.totals.distanceM.sourceActivityIds = ["other"]; },
    ]) { const value = periodFixture(); mutate(value); expect(() => validateTrainingAnalysisPeriodsResponse(value, request)).toThrow("invalid_training_analysis_periods_response"); }
  });
  it("preserves explicit summary provenance and rejects contradictory fallback counts", () => {
    const value = periodFixture();
    value.periods[0]!.activities[0]!.sourceBasis.distanceM = "activity_summary";
    value.periods[0]!.totals.distanceM.summaryFallbackCount = 1;
    value.periods[0]!.totals.distanceM.sourceBasis = "activity_summary";
    expect(validateTrainingAnalysisPeriodsResponse(value, request)).toEqual(value);
    value.periods[0]!.totals.distanceM.summaryFallbackCount = 0;
    expect(() => validateTrainingAnalysisPeriodsResponse(value, request)).toThrow("invalid_training_analysis_periods_response");
  });
  it("accepts confirmed zero zone time without converting it to missing", () => {
    const value = periodFixture();
    for (const channel of [value.periods[0]!.zones.heartRate, value.periods[0]!.zones.power]) { channel.observedSeconds = 0; channel.groups[0]!.observedSeconds = 0; channel.groups[0]!.seconds.fill(0); }
    expect(validateTrainingAnalysisPeriodsResponse(value, request)).toEqual(value);
  });
});

describe("additive running period evidence", () => {
  const runRequest = (value: TrainingAnalysisPeriodsResponse) => ({ discipline: "run" as const, periods: value.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) });
  it("accepts legacy absence and canonical running distance/3-minute/2-hour sources", () => {
    const value = runningPeriodFixture();
    expect(validateTrainingAnalysisPeriodsResponse(value, runRequest(value))).toEqual(value);
    value.periods.forEach(period => { delete period.running; });
    expect(validateTrainingAnalysisPeriodsResponse(value, runRequest(value))).toEqual(value);
  });
  it.each(["source", "time", "revision", "contributors", "coverage", "unit", "duration", "duplicate-basis", "wrong-discipline"])("rejects contradictory running %s", kind => {
    const value = runningPeriodFixture(), running = value.periods[0]!.running!, point = running.bestDistances.points[0]!;
    if (kind === "source") point.sourceActivityId = "foreign";
    if (kind === "time") point.startTime++;
    if (kind === "revision") point.metricsRevision = "hash";
    if (kind === "contributors") point.contributingActivityCount = 2;
    if (kind === "coverage") running.bestDistances.coverage.eligibleActivityCount = 2;
    if (kind === "unit") running.bestDistances.points[0]!.distanceM = 1000;
    if (kind === "duration") running.paceCurves[0]!.points[0]!.durationSeconds = 5;
    if (kind === "duplicate-basis") running.paceCurves.push(structuredClone(running.paceCurves[0]!));
    if (kind === "wrong-discipline") value.discipline = "bike";
    expect(() => validateTrainingAnalysisPeriodsResponse(value, { ...runRequest(value), discipline: value.discipline })).toThrow("invalid_training_analysis_periods_response");
  });
  it("validates exact speed conversion and excludes noncanonical durations", () => {
    const value = runningPeriodFixture(), curve = value.periods[0]!.running!.paceCurves[0]!;
    curve.sourceBasis = "speed_curve_kmh_converted";
    curve.points = curve.points.filter(point => point.durationSeconds === 300).map(point => ({ ...point, speedKph: 15 }));
    expect(validateTrainingAnalysisPeriodsResponse(value, runRequest(value))).toEqual(value);
    curve.points[0]!.paceSecPerKm++;
    expect(() => validateTrainingAnalysisPeriodsResponse(value, runRequest(value))).toThrow("invalid_training_analysis_periods_response");
    curve.points[0]!.paceSecPerKm = 240; curve.points[0]!.durationSeconds = 7200;
    expect(() => validateTrainingAnalysisPeriodsResponse(value, runRequest(value))).toThrow("invalid_training_analysis_periods_response");
  });
});

describe("optional observed running distribution boundary", () => {
  const requestFor = (value: TrainingAnalysisPeriodsResponse) => ({ discipline: "run" as const, periods: value.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) });
  function supplied() {
    const value = runningPeriodFixture();
    value.periods.forEach(period => {
      const running = period.running!, curve = running.paceCurves[0]!, source = period.activities[0]!;
      curve.observedStatistics = curve.points.map(point => ({ durationSeconds: point.durationSeconds, observedBestPaceSecPerKm: point.paceSecPerKm, observedMedianPaceSecPerKm: point.paceSecPerKm + 20, contributingActivityCount: point.contributingActivityCount }));
      running.evidence = { version: 1, scope: "observed_representatives", timingBasis: "elapsed_including_stops", activities: [{ activityId: source.activityId, startTime: source.startTime, metricsRevision: "opaque-revision", distanceRecords: [{ distance: "5km", elapsedSec: 1200 }], paceCurve: { sourceBasis: curve.sourceBasis, unit: "sec_per_km", points: curve.points.map(({ durationSeconds, paceSecPerKm, speedKph }) => ({ durationSeconds, paceSecPerKm, speedKph })) } }] };
    });
    return value;
  }
  it("accepts additive absence, valid opaque provenance and unknown fields without recalculating statistics", () => {
    const old = runningPeriodFixture(); expect(validateTrainingAnalysisPeriodsResponse(old, requestFor(old))).toBe(old);
    const value = supplied(); Object.assign(value.periods[0]!.running!.evidence!, { futureMetadata: { version: 2 } });
    expect(validateTrainingAnalysisPeriodsResponse(value, requestFor(value))).toBe(value);
    expect(value.periods[0]!.running!.paceCurves[0]!.observedStatistics![0]!.observedMedianPaceSecPerKm).toBe(280);
  });
  it.each(["activities-object", "statistics-object", "evidence-null", "duplicate-activity", "foreign-source", "wrong-date", "revision-empty", "revision-long", "wrong-unit", "wrong-timing", "unknown-basis", "points-object", "duplicate-duration", "unsupported-duration", "invalid-pace", "canonical-speed", "bad-distance", "duplicate-distance", "count-zero", "count-over-source", "invalid-median", "duplicate-statistic", "too-many-activities", "too-many-statistics"])("rejects malformed optional %s through the normal invalid-response error", kind => {
    const value = supplied(), running = value.periods[0]!.running!, evidence = running.evidence!, activity = evidence.activities[0]!, pace = activity.paceCurve!, stats = running.paceCurves[0]!.observedStatistics!;
    if (kind === "activities-object") evidence.activities = {} as never;
    if (kind === "statistics-object") running.paceCurves[0]!.observedStatistics = {} as never;
    if (kind === "evidence-null") running.evidence = null as never;
    if (kind === "duplicate-activity") evidence.activities.push(structuredClone(activity));
    if (kind === "foreign-source") activity.activityId = "foreign";
    if (kind === "wrong-date") activity.startTime++;
    if (kind === "revision-empty") activity.metricsRevision = " ";
    if (kind === "revision-long") activity.metricsRevision = "a".repeat(257);
    if (kind === "wrong-unit") pace.unit = "kmh" as never;
    if (kind === "wrong-timing") evidence.timingBasis = "moving" as never;
    if (kind === "unknown-basis") pace.sourceBasis = "unknown" as never;
    if (kind === "points-object") pace.points = {} as never;
    if (kind === "duplicate-duration") pace.points.push(structuredClone(pace.points[0]!));
    if (kind === "unsupported-duration") pace.points[0]!.durationSeconds = 47;
    if (kind === "invalid-pace") pace.points[0]!.paceSecPerKm = Infinity;
    if (kind === "canonical-speed") pace.points[0]!.speedKph = 12;
    if (kind === "bad-distance") activity.distanceRecords[0]!.elapsedSec = -1;
    if (kind === "duplicate-distance") activity.distanceRecords.push(structuredClone(activity.distanceRecords[0]!));
    if (kind === "count-zero") stats[0]!.contributingActivityCount = 0;
    if (kind === "count-over-source") stats[0]!.contributingActivityCount = 2;
    if (kind === "invalid-median") stats[0]!.observedMedianPaceSecPerKm = NaN;
    if (kind === "duplicate-statistic") stats.push(structuredClone(stats[0]!));
    if (kind === "too-many-activities") evidence.activities = Array(201).fill(activity);
    if (kind === "too-many-statistics") running.paceCurves[0]!.observedStatistics = Array(10).fill(stats[0]);
    expect(() => validateTrainingAnalysisPeriodsResponse(value, requestFor(value))).toThrow("invalid_training_analysis_periods_response");
  });
  it("rejects an observed best that disagrees with the existing winning curve point", () => {
    const value = supplied();
    value.periods[0]!.running!.paceCurves[0]!.observedStatistics![0]!.observedBestPaceSecPerKm = 1;
    expect(() => validateTrainingAnalysisPeriodsResponse(value, requestFor(value))).toThrow("invalid_training_analysis_periods_response");
  });
  it("rejects a malformed optional payload through the callable error path with one request", async () => {
    const value = supplied(); value.periods[0]!.running!.evidence!.activities = {} as never;
    const app = {};
    const services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn(async () => {}) } as unknown as FirebaseServices;
    mocks.call.mockResolvedValueOnce({ data: value });
    await expect(loadTrainingAnalysisPeriods(services, "owner", requestFor(value))).rejects.toThrow("invalid_training_analysis_periods_response");
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
  it("allows canonical emptiness and keeps legacy seven-duration/kmh contracts separate", () => {
    const value = supplied(), running = value.periods[0]!.running!, curve = running.paceCurves[0]!;
    curve.sourceBasis = "speed_curve_kmh_converted";
    curve.points = curve.points.filter(point => point.durationSeconds === 300).map(point => ({ ...point, speedKph: 15 }));
    curve.observedStatistics = curve.observedStatistics!.filter(point => point.durationSeconds === 300);
    const pace = running.evidence!.activities[0]!.paceCurve!;
    pace.sourceBasis = curve.sourceBasis; pace.points = curve.points.map(({ durationSeconds, paceSecPerKm, speedKph }) => ({ durationSeconds, paceSecPerKm, speedKph }));
    expect(validateTrainingAnalysisPeriodsResponse(value, requestFor(value))).toBe(value);
    pace.points[0]!.durationSeconds = 180;
    expect(() => validateTrainingAnalysisPeriodsResponse(value, requestFor(value))).toThrow("invalid_training_analysis_periods_response");
    const empty = supplied(), r = empty.periods[0]!.running!;
    r.paceCurves[0]!.points = []; r.paceCurves[0]!.observedStatistics = []; r.paceCurves[0]!.coverage.eligibleActivityCount = 0; r.paceCurves[0]!.coverage.noObservedEffortActivityCount = 1;
    r.evidence!.activities[0]!.paceCurve = null;
    expect(validateTrainingAnalysisPeriodsResponse(empty, requestFor(empty))).toBe(empty);
  });
});
