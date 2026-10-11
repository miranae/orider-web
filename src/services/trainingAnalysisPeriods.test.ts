import { compiledBikeProvenanceWire } from "./activityBikeDistanceEvidence.fixture";
import { expandedPeriodFixture } from "../utils/expandedRunDistances.fixture";
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

describe("optional distance observed statistics", () => {
  const requestFor = (value: TrainingAnalysisPeriodsResponse) => ({ discipline: "run" as const, periods: value.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) });
  function suppliedDistance() {
    const value = runningPeriodFixture();
    value.periods.forEach(period => { period.running!.bestDistances.observedStatistics = period.running!.bestDistances.points.map(point => ({ distance: point.distance, bestTimeSeconds: point.elapsedSec, medianTimeSeconds: point.elapsedSec + 30, contributingActivityCount: point.contributingActivityCount })); });
    return value;
  }
  it("accepts new observed statistics and unchanged old responses without recomputation", () => {
    const value = suppliedDistance(); expect(validateTrainingAnalysisPeriodsResponse(value, requestFor(value))).toBe(value);
    expect(value.periods[0]!.running!.bestDistances.observedStatistics![0]!.medianTimeSeconds).toBe(1230);
    const old = runningPeriodFixture(); expect(validateTrainingAnalysisPeriodsResponse(old, requestFor(old))).toBe(old);
    value.periods.forEach(period => { period.running!.bestDistances.observedStatistics = []; });
    expect(validateTrainingAnalysisPeriodsResponse(value, requestFor(value))).toBe(value);
  });
  it.each(["object", "null", "duplicate", "over-five", "unsupported", "nan", "zero", "false-best", "median-too-fast", "n-zero", "n-over-source", "no-source"])("rejects malformed distance statistics %s", kind => {
    const value = suppliedDistance(), best = value.periods[0]!.running!.bestDistances, statistic = best.observedStatistics![0]!;
    if (kind === "object") best.observedStatistics = {} as never;
    if (kind === "null") best.observedStatistics = null as never;
    if (kind === "duplicate") best.observedStatistics!.push(structuredClone(statistic));
    if (kind === "over-five") best.observedStatistics = Array(6).fill(statistic);
    if (kind === "unsupported") statistic.distance = "2km" as never;
    if (kind === "nan") statistic.medianTimeSeconds = NaN;
    if (kind === "zero") statistic.bestTimeSeconds = 0;
    if (kind === "false-best") statistic.bestTimeSeconds = 1;
    if (kind === "median-too-fast") statistic.medianTimeSeconds = 1100;
    if (kind === "n-zero") statistic.contributingActivityCount = 0;
    if (kind === "n-over-source") statistic.contributingActivityCount = 2;
    if (kind === "no-source") statistic.distance = "half";
    expect(() => validateTrainingAnalysisPeriodsResponse(value, requestFor(value))).toThrow("invalid_training_analysis_periods_response");
  });
});

it("opts in only running expanded14 and preserves unflagged legacy response bytes", () => {
  const data = runningPeriodFixture(), query = { discipline: "run" as const, periods: data.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) };
  const before = JSON.stringify(data);
  expect(validateTrainingAnalysisPeriodsResponse(data, query)).toBe(data);
  expect(JSON.stringify(data)).toBe(before);
  data.periods.forEach(period => { period.running!.expandedDistanceAnalysis = expandedPeriodFixture(period); });
  expect(() => validateTrainingAnalysisPeriodsResponse(data, query)).toThrow();
  expect(validateTrainingAnalysisPeriodsResponse(data, { ...query, includeExpandedRunDistances: true })).toBe(data);
  expect(validTrainingAnalysisPeriodsRequest({ ...request, includeExpandedRunDistances: true })).toBe(false);
  data.periods[0]!.running!.expandedDistanceAnalysis!.distances.pop();
  expect(() => validateTrainingAnalysisPeriodsResponse(data, { ...query, includeExpandedRunDistances: true })).toThrow();
});

describe("cycling climb opt-in channel", () => {
  it("keeps legacy absence valid and only accepts bike true opt-in", () => {
    expect(validateTrainingAnalysisPeriodsResponse(periodFixture(), request)).toEqual(periodFixture());
    expect(validTrainingAnalysisPeriodsRequest({ ...request, includeCyclingClimbObservations: true }, 10000)).toBe(true);
    expect(validTrainingAnalysisPeriodsRequest({ ...request, discipline: "run", includeCyclingClimbObservations: true }, 10000)).toBe(false);
    expect(validTrainingAnalysisPeriodsRequest({ ...request, includeCyclingClimbObservations: false } as unknown as typeof request, 10000)).toBe(false);
    const data = periodFixture(); data.periods[0]!.cyclingClimbObservations = { version: 1, scope: "observed_representatives", climbQuality: "unknown", candidateActivityCount: 1, supportedActivityCount: 0, observedActivityCount: 0, noObservedActivityCount: 0, unsupportedActivityCount: 1, unavailableActivityCount: 0, truncated: false, sources: [] };
    expect(() => validateTrainingAnalysisPeriodsResponse(data, request)).toThrow("invalid_training_analysis_periods_response");
    expect(validateTrainingAnalysisPeriodsResponse(data, { ...request, includeCyclingClimbObservations: true })).toBe(data);
    data.periods[0]!.cyclingClimbObservations.observedActivityCount = 1;
    expect(() => validateTrainingAnalysisPeriodsResponse(data, { ...request, includeCyclingClimbObservations: true })).toThrow("invalid_training_analysis_periods_response");
  });
});

it("validates bike-only true opt-in and isolates a malformed optional distance channel from existing strict data", async () => {
  const { cyclingDistancePeriodFixture } = await import("../utils/cyclingDistancePeriods.fixture");
  const response = cyclingDistancePeriodFixture(), opted = { ...request, includeCyclingDistanceObservations: true as const };
  expect(validTrainingAnalysisPeriodsRequest(opted, 10000)).toBe(true);
  expect(validTrainingAnalysisPeriodsRequest({ ...opted, discipline: "run" }, 10000)).toBe(false);
  expect(validTrainingAnalysisPeriodsRequest({ ...opted, includeCyclingDistanceObservations: false } as unknown as typeof opted, 10000)).toBe(false);
  expect(validateTrainingAnalysisPeriodsResponse(response,opted).periods[0]!.cyclingDistanceObservations).toEqual(response.periods[0]!.cyclingDistanceObservations);
  const original = structuredClone(response); delete response.periods[0]!.cyclingDistanceObservations!.distances[12];
  const safe = validateTrainingAnalysisPeriodsResponse(response,opted); expect(safe.periods[0]!.cyclingDistanceObservations).toBeUndefined();
  expect(safe.periods[0]!.totals).toEqual(original.periods[0]!.totals);expect(safe.periods[0]!.zones).toEqual(original.periods[0]!.zones);
  expect(response.periods[0]!.cyclingDistanceObservations).toBeDefined();
  expect(validateTrainingAnalysisPeriodsResponse(original,request).periods[0]!.cyclingDistanceObservations).toBeUndefined();
  original.periods[0]!.totals.distanceM.totalValue = -1; expect(() => validateTrainingAnalysisPeriodsResponse(original,opted)).toThrow("invalid_training_analysis_periods_response");
});

it.each(["pendingActivityCount", "missingActivityCount", "incompleteActivityCount"] as const)("isolates contradictory supported/unsupported claims on%s while preserving valid parent data", async state => {
  const { cyclingDistancePeriodFixture } = await import("../utils/cyclingDistancePeriods.fixture");
  for(const claim of ["supported","unsupported"] as const){
    const response=cyclingDistancePeriodFixture(), p=response.periods[0]!;
    p.coverage.includedActivityCount=0;p.coverage[state]=1;p.status="partial";
    for(const field of ["distanceM","movingTimeSec","elevationGainM"] as const){p.activities[0]!.sourceBasis[field]="activity_summary";p.totals[field].sourceBasis="activity_summary";p.totals[field].summaryFallbackCount=1;}
    for(const channel of ["heartRate","power"] as const){p.zones[channel].groups=[];p.zones[channel].eligibleActivityCount=0;p.zones[channel].missingSensorActivityCount=1;p.zones[channel].observedSeconds=0;}
    if(claim === "unsupported") for(const d of p.cyclingDistanceObservations!.distances){d.supportedActivityCount=d.observedEffortActivityCount=d.noObservedEffortActivityCount=0;d.unsupportedActivityCount=1;d.sources=[];d.bestTimeSeconds=d.medianTimeSeconds=null;}
    const before=structuredClone(response), safe=validateTrainingAnalysisPeriodsResponse(response,{...request,includeCyclingDistanceObservations:true});
    expect(safe.periods[0]!.cyclingDistanceObservations).toBeUndefined();
    expect(safe.periods[0]!.coverage).toEqual(before.periods[0]!.coverage);expect(safe.periods[0]!.zones).toEqual(before.periods[0]!.zones);expect(safe.periods[0]!.totals).toEqual(before.periods[0]!.totals);expect(response).toEqual(before);
  }
});

it("isolates malformed v2 cycling provenance while preserving every existing period field",async()=>{
  const { cyclingDistancePeriodFixture } = await import("../utils/cyclingDistancePeriods.fixture");
  const response=cyclingDistancePeriodFixture(), period=response.periods[0]!;
  Object.assign(period.cyclingDistanceObservations!.distances[1]!.sources[0]!.provenance,{originalClockVerified:true});
  const before=JSON.stringify(response), safe=validateTrainingAnalysisPeriodsResponse(response,{...request,includeCyclingDistanceObservations:true});
  expect(safe.periods[0]!.cyclingDistanceObservations).toBeUndefined();
  for(const field of ["activities","coverage","totals","zones"] as const)expect(safe.periods[0]![field]).toBe(period[field]);
  expect(JSON.stringify(response)).toBe(before);
});

it("accepts full actual compiled period wire and exactly matches backend legacy normalization",()=>{
  const wires=compiledBikeProvenanceWire.period;
  const raw=wires.legacyWire.result as TrainingAnalysisPeriodsResponse;
  const normalized=wires.normalizedLegacyWire.result as TrainingAnalysisPeriodsResponse;
  const modern=wires.modernWire.result as TrainingAnalysisPeriodsResponse;
  const request={discipline:"bike" as const,includeCyclingDistanceObservations:true as const,periods:raw.periods.map(({fromInclusive,toExclusive})=>({fromInclusive,toExclusive}))};
  expect(validateTrainingAnalysisPeriodsResponse(raw,request)).toEqual(normalized);
  expect(validateTrainingAnalysisPeriodsResponse(modern,request)).toBe(modern);
  expect(validateTrainingAnalysisPeriodsResponse(periodFixture(),{...request,periods:periodFixture().periods.map(({fromInclusive,toExclusive})=>({fromInclusive,toExclusive}))})).toEqual(periodFixture());
});
