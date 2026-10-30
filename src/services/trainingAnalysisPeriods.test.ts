import { webcrypto } from "node:crypto";
import timeWire from "./stageRunTimeCorrections.fixture.json";
import type { TrainingAnalysisPeriodsRequest } from "@shared/types/training-analysis-periods";
import { compiledBikeProvenanceWire } from "./activityBikeDistanceEvidence.fixture";
import { expandedPeriodFixture } from "../utils/expandedRunDistances.fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { loadTrainingAnalysisPeriods, trainingAnalysisPeriodsAvailable, validTrainingAnalysisPeriodsRequest, validRunningPaceZoneAnalysis, validateTrainingAnalysisPeriodsResponse } from "./trainingAnalysisPeriods";
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
import { periodFixture, request, runningPeriodFixture, runningPacePeriodFixture, runningPaceAnalysisFixture, stageRunEffortFixture } from "./trainingAnalysisPeriods.fixture";
const stage = { appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1", firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net", trainingAnalysisPeriodsEnabled: true };
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
    const app = { options: { projectId: "miranae-orider-g1" } };
    const services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } },
      functions: { region: "asia-northeast3", app: kind === "foreign-app" ? {} : app, customDomain: kind === "production-transport" ? "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" : kind === "default-transport" ? undefined : stage.firebaseFunctionsBase },
      ensureAppCheckReady: vi.fn() } as unknown as FirebaseServices;
    await expect(loadTrainingAnalysisPeriods(services, "owner", request)).rejects.toThrow(kind === "foreign-app" ? "account_changed" : "stage/callable-context-mismatch");
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
    const app = { options: { projectId: "miranae-orider-g1" } };
    const auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
    const services = { auth, functions: { region: "asia-northeast3", app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn(async () => {}) } as unknown as FirebaseServices;
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
    const app = { options: { projectId: "miranae-orider-g1" } };
    const services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { region: "asia-northeast3", app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn(async () => {}) } as unknown as FirebaseServices;
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

describe("explicit running GAP pace-zone channel", () => {
  it("requires true RUN-only opt-in and keeps the default response wire identical", () => {
    const old = runningPeriodFixture(), before = JSON.stringify(old);
    const base = { discipline: "run" as const, periods: old.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) };
    expect(validateTrainingAnalysisPeriodsResponse(old, base)).toBe(old);
    expect(JSON.stringify(old)).toBe(before);
    expect(validTrainingAnalysisPeriodsRequest(base)).toBe(true);
    expect(validTrainingAnalysisPeriodsRequest({ ...base, includeRunningPaceZones: true })).toBe(true);
    for (const request of [{ ...base, includeRunningPaceZones: false }, { ...base, includeRunningPaceZones: "true" }, { ...base, discipline: "bike", includeRunningPaceZones: true }]) expect(validTrainingAnalysisPeriodsRequest(request as any)).toBe(false);
  });
  it("validates observed groups with their own source snapshot and accepts an unsupported legacy response", () => {
    const data = runningPacePeriodFixture();
    const request = { discipline: "run" as const, includeRunningPaceZones: true as const, periods: data.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) };
    expect(validateTrainingAnalysisPeriodsResponse(data, request)).toBe(data);
    const legacy = structuredClone(data); legacy.periods[0]!.zones.pace = { status: "unavailable", reason: "canonical_pace_zones_unavailable" };
    expect(validateTrainingAnalysisPeriodsResponse(legacy, request)).toBe(legacy);
    expect(() => validateTrainingAnalysisPeriodsResponse(data, { ...request, includeRunningPaceZones: undefined })).toThrow();
  });
  it.each(["count", "candidate", "truncated", "status", "reason", "groups", "policy", "basis", "timing", "threshold", "thresholdSource", "boundaries", "zones", "zoneNan", "eligible", "intervalNull", "intervalScope", "intervalPartition", "sourceId", "sourceTime", "sourceCount", "revision", "profileRevision", "calculatedAt", "duplicateSource", "duplicateGroup"])("rejects malformed observed pace %s", field => {
    const data = runningPacePeriodFixture(), pace: any = data.periods[0]!.zones.pace, group = pace.groups[0], source = group.sources[0];
    if (field === "count") pace.eligibleActivityCount++;
    if (field === "candidate") pace.candidateActivityCount++;
    if (field === "truncated") pace.truncated = true;
    if (field === "status") pace.status = "unavailable";
    if (field === "reason") pace.reason = "canonical_pace_zones_unavailable";
    if (field === "groups") pace.groups = [];
    if (field === "policy") group.policy = "strava";
    if (field === "basis") group.basis = "activity_time";
    if (field === "timing") group.timingBasis = "moving_time";
    if (field === "threshold") group.thresholdPaceSecPerKm = 0;
    if (field === "thresholdSource") group.thresholdSource = "current_profile";
    if (field === "boundaries") group.upperSpeedRatios[0] = 0.8;
    if (field === "zones") group.zoneSeconds.pop();
    if (field === "zoneNan") group.zoneSeconds[0] = NaN;
    if (field === "eligible") group.eligibleGapSeconds++;
    if (field === "intervalNull") group.intervalCoverage = null;
    if (field === "intervalScope") group.intervalCoverage.scope = "whole_activity";
    if (field === "intervalPartition") group.intervalCoverage.observedIntervalSeconds++;
    if (field === "sourceId") source.sourceActivityId = "other";
    if (field === "sourceTime") source.startTime++;
    if (field === "sourceCount") source.contributingActivityCount = 2;
    if (field === "revision") source.metricsRevision = "";
    if (field === "profileRevision") source.thresholdProfileRevision = "";
    if (field === "calculatedAt") source.calculatedAt = NaN;
    if (field === "duplicateSource") group.sources.push(source);
    if (field === "duplicateGroup") pace.groups.push(group);
    const request = { discipline: "run" as const, includeRunningPaceZones: true as const, periods: data.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) };
    expect(() => validateTrainingAnalysisPeriodsResponse(data, request)).toThrow("invalid_training_analysis_periods_response");
  });
  it.each(["thresholdMissingActivityCount", "profileReadFailedActivityCount", "gapInputUnavailableActivityCount", "legacyUnsupportedActivityCount"] as const)("accepts a distinct unavailable period bucket %s", bucket => {
    const data = runningPacePeriodFixture(), pace = data.periods[0]!.zones.pace;
    if (!("groups" in pace)) throw new Error("fixture");
    pace.status = "unavailable"; pace.reason = "canonical_pace_zones_unavailable"; pace.eligibleActivityCount = 0; pace[bucket] = 1; pace.groups = [];
    const request = { discipline: "run" as const, includeRunningPaceZones: true as const, periods: data.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) };
    expect(validateTrainingAnalysisPeriodsResponse(data, request)).toBe(data);
  });
  it.each(["threshold_missing", "profile_read_failed", "gap_input_unavailable"] as const)("keeps %s unavailable without inventing zero observations", reason => {
    const analysis = runningPaceAnalysisFixture();
    analysis.state = "unavailable"; analysis.reason = reason; analysis.zoneSeconds.fill(0); analysis.eligibleGapSeconds = 0; analysis.intervalCoverage = null;
    if (reason !== "gap_input_unavailable") { analysis.thresholdPaceSecPerKm = null; analysis.thresholdSource = null; }
    expect(validRunningPaceZoneAnalysis(analysis)).toBe(true);
    expect(analysis.intervalCoverage).toBeNull();
  });
});

describe("manual running effort preference read", () => {
  it("preserves default RUN response identity and strictly validates opt-in overlay bindings", () => {
    const old = runningPeriodFixture(), bytes = JSON.stringify(old), plain = { discipline: "run" as const, periods: old.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) };
    expect(validateTrainingAnalysisPeriodsResponse(old, plain)).toBe(old); expect(JSON.stringify(old)).toBe(bytes);
    expect(validTrainingAnalysisPeriodsRequest({ ...plain, includeStageRunEffortPreferences: true })).toBe(true);
    expect(validTrainingAnalysisPeriodsRequest({ ...plain, discipline: "bike", includeStageRunEffortPreferences: true })).toBe(false);
    const data = stageRunEffortFixture(); const request = { ...plain, includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const };
    expect(validateTrainingAnalysisPeriodsResponse(data, request)).toBe(data);
    expect(() => validateTrainingAnalysisPeriodsResponse(data, plain)).toThrow();
  });
  it.each(["scope", "revision", "ready", "target", "duplicate", "legacyExcluded", "expandedExcluded"])("rejects inconsistent effort overlay %s", field => {
    const data = stageRunEffortFixture(), running = data.periods[0]!.running!, overlay: any = running.stageEffortOverlay!, binding = overlay.preferenceBindings[0];
    if (field === "scope") overlay.scope = "global";
    if (field === "revision") binding.metricsRevision = "stale";
    if (field === "ready") binding.metricsRevision = null;
    if (field === "target") binding.excludedTargets = ["3km"];
    if (field === "duplicate") overlay.preferenceBindings.push(binding);
    if (field === "legacyExcluded") binding.excludedTargets = ["5km"];
    if (field === "expandedExcluded") binding.excludedTargets = ["400m"];
    const request = { discipline: "run" as const, includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const, periods: data.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) };
    expect(() => validateTrainingAnalysisPeriodsResponse(data, request)).toThrow();
  });
});

it("parses actual compiled backend Stage wire after target filtering, including all-removed and missing recomputation", async () => {
  const { default: wire } = await import("./runEffortStageWire.fixture.json");
  for (const [name, scenario] of Object.entries(wire.cases)) {
    const data = scenario.response as unknown as TrainingAnalysisPeriodsResponse;
    const request = scenario.request as unknown as Parameters<typeof validateTrainingAnalysisPeriodsResponse>[1];
    expect(validateTrainingAnalysisPeriodsResponse(data, request)).toBe(data);
    const services = { auth: { app: { options: { projectId: "miranae-orider-g1" } }, currentUser: { uid: "owner", isAnonymous: false } }, functions: {}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices;
    Object.assign(services.functions, { region: "asia-northeast3", app: services.auth.app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" });
    mocks.call.mockResolvedValueOnce({ data });
    expect(await loadTrainingAnalysisPeriods(services, "owner", request)).toEqual(data);
    expect(mocks.call).toHaveBeenLastCalledWith(request);
    const running = data.periods[0]!.running!;
    const expanded = running.expandedDistanceAnalysis!.distances.find(row => row.distance === "5km")!;
    if (name === "allRemoved") {
      expect(running.bestDistances.coverage).toMatchObject({ eligibleActivityCount: 0, excludedOnlyActivityCount: 1, noObservedEffortActivityCount: 0 });
      expect(running.bestDistances.points).toEqual([]);
      expect(expanded).toMatchObject({ observedEffortActivityCount: 0, excludedEffortActivityCount: 1, noObservedEffortActivityCount: 0, sources: [], bestTimeSeconds: null });
    }
    if (name === "partial") {
      expect(running.bestDistances.coverage).toMatchObject({ eligibleActivityCount: 2, excludedOnlyActivityCount: 0 });
      expect(running.bestDistances.points.find(point => point.distance === "5km")!.sourceActivityId).toBe("b");
      expect(expanded.sources.map(source => source.sourceActivityId)).toEqual(["b"]);
    }
    if (name === "recomputedMissing") expect(expanded).toMatchObject({ excludedEffortActivityCount: 0, noObservedEffortActivityCount: 1 });
    if (name === "metricsAbsent") expect(running.stageEffortOverlay!.preferenceBindings[0]).toMatchObject({ metricsRevision: null, mutationReady: false, excludedTargets: ["5km"] });
    const doubleCounted = structuredClone(data);
    if (name === "allRemoved") {
      doubleCounted.periods[0]!.running!.bestDistances.coverage.noObservedEffortActivityCount = 1;
      expect(() => validateTrainingAnalysisPeriodsResponse(doubleCounted, request)).toThrow();
    }
  }
  const old = wire.default.response as unknown as TrainingAnalysisPeriodsResponse;
  expect(validateTrainingAnalysisPeriodsResponse(old, wire.default.request as unknown as Parameters<typeof validateTrainingAnalysisPeriodsResponse>[1])).toBe(old);
  expect(old.periods[0]!.running!.stageEffortOverlay).toBeUndefined();
  expect(old.periods[0]!.running!.bestDistances.coverage.excludedOnlyActivityCount).toBeUndefined();
});


it.each([null, NaN, -1])("rejects explicit malformed excluded-only coverage %s", async excludedOnlyActivityCount => {
  const { default: wire } = await import("./runEffortStageWire.fixture.json");
  const data = structuredClone(wire.cases.partial.response) as unknown as TrainingAnalysisPeriodsResponse;
  Object.assign(data.periods[0]!.running!.bestDistances.coverage, { excludedOnlyActivityCount });
  const request = wire.cases.partial.request as unknown as Parameters<typeof validateTrainingAnalysisPeriodsResponse>[1];
  expect(() => validateTrainingAnalysisPeriodsResponse(data, request)).toThrow("invalid_training_analysis_periods_response");
});

describe("separate stored-distance snapshot wire", () => {
  it("accepts actual compiled backend before/excluded/restored responses without changing canonical stats", async () => {
    const { default: wire } = await import("./stageRunDistanceSnapshot.fixture.json");
    for (const name of ["before", "excluded", "restored"] as const) {
      const response = wire.cases[name] as TrainingAnalysisPeriodsResponse;
      const request = { discipline: "run" as const, periods: response.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })),
        includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const, stageRunDistanceSnapshotActivityIds: ["a"] as [string] };
      expect(validateTrainingAnalysisPeriodsResponse(response, request)).toBe(response);
      expect(response.periods[0]!.running!.expandedDistanceAnalysis).toEqual(wire.cases.baseline.periods[0]!.running!.expandedDistanceAnalysis);
    }
  });
  it("rejects unrequested derived data, false provenance, corrupted anchors, mismatched source/binding and extra rank claims", async () => {
    const { default: wire } = await import("./stageRunDistanceSnapshot.fixture.json");
    const response = wire.cases.before as TrainingAnalysisPeriodsResponse;
    const request = { discipline: "run" as const, periods: response.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })),
      includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const, stageRunDistanceSnapshotActivityIds: ["a"] as [string] };
    expect(() => validateTrainingAnalysisPeriodsResponse(response, { ...request, stageRunDistanceSnapshotActivityIds: undefined })).toThrow();
    for (const patch of [
      (value: any) => { value.originalClockVerified = true; }, (value: any) => { value.coverage = "complete"; },
      (value: any) => { value.sources[0].records["400m"].exactElapsedSec = -1; },
      (value: any) => { value.sources[0].derivedRevision = "b".repeat(64); },
      (value: any) => { value.sources[0].activityId = "foreign"; }, (value: any) => { value.sources[0].observedTargets = []; },
      (value: any) => { value.sources[0].records["400m"].startIndex = 20; }, (value: any) => { value.rank = 1; },
    ]) {
      const altered = structuredClone(response); patch(altered.periods[0]!.stageDerivedRunDistances);
      expect(() => validateTrainingAnalysisPeriodsResponse(altered, request)).toThrow();
    }
    for (const ids of [[], ["a", "b"], ["../a"], [null]]) expect(validTrainingAnalysisPeriodsRequest({ ...request, stageRunDistanceSnapshotActivityIds: ids } as any)).toBe(false);
    expect(validTrainingAnalysisPeriodsRequest({ ...request, includeStageRunEffortPreferences: undefined })).toBe(false);
  });
});

describe("qualified earlier stored-distance format", () => {
  it("accepts actual compiled qualified legacy before/excluded/restored wire without promoting canonical metrics", async () => {
    const { default: wire } = await import("./stageRunDistanceSnapshotLegacy.fixture.json");
    for (const name of ["before", "excluded", "restored"] as const) {
      const response = wire.cases[name] as TrainingAnalysisPeriodsResponse;
      const request = { discipline: "run" as const, periods: response.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })),
        includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const, stageRunDistanceSnapshotActivityIds: ["a"] as [string] };
      expect(validateTrainingAnalysisPeriodsResponse(response, request)).toBe(response);
      expect(response.periods[0]!.running!.expandedDistanceAnalysis).toEqual(wire.cases.baseline.periods[0]!.running!.expandedDistanceAnalysis);
      expect(response.periods[0]!.stageDerivedRunDistances!.sources[0]).toMatchObject({ qualification: "legacy_manifest_revision_and_gcs_token_pinned", manifestObjectIncarnationVerified: false });
    }
  });
  it("requires both exact legacy fields, rejects explicit undefined, stale revisions and tokens in period output", async () => {
    const { default: wire } = await import("./stageRunDistanceSnapshotLegacy.fixture.json");
    const response = wire.cases.before as TrainingAnalysisPeriodsResponse;
    const request = { discipline: "run" as const, periods: response.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })),
      includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const, stageRunDistanceSnapshotActivityIds: ["a"] as [string] };
    for (const patch of [
      (source: any) => { delete source.qualification; }, (source: any) => { delete source.manifestObjectIncarnationVerified; },
      (source: any) => { source.qualification = "unknown"; }, (source: any) => { source.manifestObjectIncarnationVerified = true; },
      (source: any) => { source.qualification = undefined; source.manifestObjectIncarnationVerified = undefined; },
      (source: any) => { source.gcsIncarnationToken = "must-not-be-exposed"; }, (source: any) => { source.derivedRevision = "b".repeat(64); },
    ]) {
      const copy = structuredClone(response); patch(copy.periods[0]!.stageDerivedRunDistances!.sources[0]);
      expect(() => validateTrainingAnalysisPeriodsResponse(copy, request)).toThrow();
    }
    const { default: modernWire } = await import("./stageRunDistanceSnapshot.fixture.json");
    const modern = structuredClone(modernWire.cases.before) as TrainingAnalysisPeriodsResponse;
    modern.periods[0]!.stageDerivedRunDistances!.sources[0]!.manifestObjectIncarnationVerified = false;
    expect(() => validateTrainingAnalysisPeriodsResponse(modern, request)).toThrow();
  });
});

describe("stored activity start/end clock window", () => {
  it("accepts actual modern and legacy fallback wire while retaining unknown original clocks and canonical stats", async () => {
    const modern = await import("./stageRunDistanceSnapshotWall.fixture.json");
    const legacy = await import("./stageRunDistanceSnapshotLegacyWall.fixture.json");
    for (const wire of [modern.default, legacy.default]) for (const name of ["before", "excluded", "restored"] as const) {
      const response = wire.cases[name] as TrainingAnalysisPeriodsResponse;
      const request = { discipline: "run" as const, periods: response.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })),
        includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const, stageRunDistanceSnapshotActivityIds: ["a"] as [string] };
      expect(validateTrainingAnalysisPeriodsResponse(response, request)).toBe(response);
      expect(response.periods[0]!.stageDerivedRunDistances).toMatchObject({ originalClockVerified: false, coverage: "unknown", quality: "unknown", sources: [{ timeBasis: "stored_activity_wall_clock_window" }] });
      expect(response.periods[0]!.running!.expandedDistanceAnalysis).toEqual(wire.cases.baseline.periods[0]!.running!.expandedDistanceAnalysis);
    }
  });
  it("rejects present undefined/null/unknown time bases without treating them as the older omitted wire", async () => {
    const { default: wire } = await import("./stageRunDistanceSnapshotWall.fixture.json");
    const request = { discipline: "run" as const, periods: wire.cases.before.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })),
      includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const, stageRunDistanceSnapshotActivityIds: ["a"] as [string] };
    for (const value of [undefined, null, "unknown", "measured_sensor_elapsed", true]) {
      const response = structuredClone(wire.cases.before) as TrainingAnalysisPeriodsResponse;
      (response.periods[0]!.stageDerivedRunDistances!.sources[0]! as any).timeBasis = value;
      expect(() => validateTrainingAnalysisPeriodsResponse(response, request)).toThrow();
    }
  });
});

it("accepts only the explicitly selected bound native alias absent from canonical timeline", async () => {
  const { default: wire } = await import("./stageRunDistanceSelectedAlias.fixture.json");
  const response = structuredClone(wire.cases.before) as TrainingAnalysisPeriodsResponse;
  const period = response.periods[0]!;
  expect(period.activities.map(row => row.activityId)).toEqual(["strava_123"]);
  expect(period.coverage).toMatchObject({ candidateActivityCount: 2, representativeActivityCount: 1 });
  for (const field of ["activities", "coverage", "totals", "zones"] as const) expect(period[field]).toEqual(wire.cases.baseline.periods[0]![field]);
  const request = { discipline: "run" as const, periods: response.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })),
    includeStageRunEffortPreferences: true as const, includeExpandedRunDistances: true as const, stageRunDistanceSnapshotActivityIds: ["a"] as [string] };
  expect(validateTrainingAnalysisPeriodsResponse(response, request)).toBe(response);
  for (const patch of [
    (p: typeof period) => { p.stageDerivedRunDistances!.sources[0]!.activityId = "unbound"; },
    (p: typeof period) => { p.running!.stageEffortOverlay!.preferenceBindings[0]!.activityId = "unbound"; },
    (p: typeof period) => { p.running!.stageEffortOverlay!.preferenceBindings[0]!.derivedRevision = "b".repeat(64); },
    (p: typeof period) => { p.stageDerivedRunDistances!.sources[0]!.startTime = p.toExclusive; },
    (p: typeof period) => { p.stageDerivedRunDistances!.sources[0]!.startTime = p.fromInclusive - 1; },
    (p: typeof period) => { p.stageDerivedRunDistances!.sources[0]!.startTime = NaN; },
    (p: typeof period) => { p.running!.stageEffortOverlay!.preferenceBindings[0]!.activityIncarnation = ""; },
    (p: typeof period) => { p.activities[0]!.activityId = "a"; p.activities[0]!.startTime += 1; },
  ]) {
    const invalid = structuredClone(response); patch(invalid.periods[0]!);
    expect(() => validateTrainingAnalysisPeriodsResponse(invalid, request)).toThrow();
  }
  expect(() => validateTrainingAnalysisPeriodsResponse(response, { ...request, stageRunDistanceSnapshotActivityIds: ["different"] })).toThrow();
});

it("rechecks the owner after asynchronous native time-source digest verification without further network reads", async () => {
  const fixture = timeWire.cases.find(value => value.mode === "canonical_available")!;
  const app = { options: { projectId: "miranae-orider-g1" } }, auth = { app, currentUser: { uid: "owner", isAnonymous: false } };
  const services = { auth, functions: { region: "asia-northeast3", app, customDomain: stage.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn(async () => {}) } as unknown as FirebaseServices;
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(done => { entered = done; }), blocked = new Promise<void>(done => { release = done; });
  vi.stubGlobal("crypto", { subtle: { digest: async (algorithm: AlgorithmIdentifier, data: Parameters<typeof webcrypto.subtle.digest>[1]) => { entered(); await blocked; return webcrypto.subtle.digest(algorithm, data); } } });
  mocks.call.mockResolvedValueOnce({ data: fixture.response });
  const pending = loadTrainingAnalysisPeriods(services, "owner", fixture.request as TrainingAnalysisPeriodsRequest);
  const rejected = expect(pending).rejects.toThrow("account_changed");
  await started; auth.currentUser.uid = "other"; release(); await rejected;
  expect(mocks.call).toHaveBeenCalledTimes(1); expect(services.ensureAppCheckReady).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
