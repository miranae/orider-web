import { httpsCallable } from "firebase/functions";
import type { TrainingAnalysisPeriodsRequest, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";
import { validPowerCurvePeriodsRequest } from "./powerCurvePeriods";

const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-9;
const id = (value: unknown): value is string => typeof value === "string" && !!value && value.length <= 512 && !value.includes("/");
/** 새 API는 검증된 stage compute에만 명시적으로 켠다. */
export function trainingAnalysisPeriodsAvailable() {
  const config = getRuntimeConfig();
  return config.trainingAnalysisPeriodsEnabled === true && config.appEnvironment === "stage"
    && config.firebaseFunctionsBase === "https://asia-northeast3-orider-dev.cloudfunctions.net";
}
export function validTrainingAnalysisPeriodsRequest(request: TrainingAnalysisPeriodsRequest, now = Date.now()) {
  return !!request && ["bike", "run", "swim"].includes(request.discipline)
    && validPowerCurvePeriodsRequest({ unit: "W", periods: request.periods }, now);
}
export function validateTrainingAnalysisPeriodsResponse(response: TrainingAnalysisPeriodsResponse, request: TrainingAnalysisPeriodsRequest) {
  const invalid = () => { throw new Error("invalid_training_analysis_periods_response"); };
  if (!response || response.version !== 1 || response.discipline !== request.discipline || !count(response.asOf)
    || !Number.isFinite(new Date(response.asOf).getTime()) || request.periods.some(period => period.toExclusive > response.asOf)
    || !/^[a-f0-9]{64}$/u.test(response.inputDigest) || !Array.isArray(response.periods) || response.periods.length !== request.periods.length) invalid();
  response.periods.forEach((period, index) => {
    const expected = request.periods[index]!, coverage = period?.coverage;
    if (!period || period.fromInclusive !== expected.fromInclusive || period.toExclusive !== expected.toExclusive
      || !["complete", "partial"].includes(period.status) || !coverage || !period.totals || !period.zones || !Array.isArray(period.activities)) invalid();
    const counts = [coverage.scannedActivityCount, coverage.candidateActivityCount, coverage.representativeActivityCount,
      coverage.deduplicatedActivityCount, coverage.includedActivityCount, coverage.pendingActivityCount, coverage.missingActivityCount,
      coverage.incompleteActivityCount, coverage.skippedActivityCount];
    if (!counts.every(count) || coverage.scanLimit !== 200 || coverage.scannedActivityCount > 200
      || typeof coverage.truncated !== "boolean" || coverage.candidateCountKnown !== !coverage.truncated
      || coverage.deduplicationBasis !== "explicit_identity_within_period"
      || coverage.scannedActivityCount !== coverage.candidateActivityCount + coverage.skippedActivityCount
      || coverage.candidateActivityCount !== coverage.representativeActivityCount + coverage.deduplicatedActivityCount
      || coverage.representativeActivityCount !== coverage.includedActivityCount + coverage.pendingActivityCount + coverage.missingActivityCount + coverage.incompleteActivityCount
      || period.activities.length !== coverage.representativeActivityCount) invalid();
    const activityIds = new Set<string>();
    for (const activity of period.activities) {
      if (!activity || !id(activity.activityId) || activityIds.has(activity.activityId) || !count(activity.startTime)
        || activity.startTime < expected.fromInclusive || activity.startTime >= expected.toExclusive
        || [activity.distanceM, activity.movingTimeSec, activity.elevationGainM].some(value => value !== null && !nonnegative(value))) invalid();
      activityIds.add(activity.activityId);
    }
    for (const field of ["distanceM", "movingTimeSec", "elevationGainM"] as const) {
      const total = period.totals[field];
      if (!total || !count(total.knownActivityCount) || !count(total.missingActivityCount)
        || total.knownActivityCount + total.missingActivityCount !== coverage.representativeActivityCount
        || !Array.isArray(total.sourceActivityIds) || new Set(total.sourceActivityIds).size !== total.knownActivityCount
        || total.sourceActivityIds.length !== total.knownActivityCount || total.sourceActivityIds.some(value => !activityIds.has(value))) invalid();
      const known = period.activities.filter(activity => activity[field] !== null);
      if (known.length !== total.knownActivityCount || known.some(activity => !total.sourceActivityIds.includes(activity.activityId))) invalid();
      if (period.activities.some(activity => !activity.sourceBasis || !["canonical_metrics", "activity_summary", "unavailable"].includes(activity.sourceBasis[field])
        || (activity[field] === null) !== (activity.sourceBasis[field] === "unavailable"))) invalid();
      const fallback = known.filter(activity => activity.sourceBasis[field] === "activity_summary").length;
      const basis = known.length === 0 ? "unavailable" : fallback === 0 ? "canonical_metrics" : fallback === known.length ? "activity_summary" : "mixed";
      if (total.summaryFallbackCount !== fallback || total.sourceBasis !== basis) invalid();
      const sum = known.reduce((value, activity) => value + activity[field]!, 0);
      if (total.knownActivityCount === 0 ? total.observedValue !== null : !nonnegative(total.observedValue) || !near(total.observedValue, sum)) invalid();
      if (coverage.truncated || total.missingActivityCount > 0 ? total.totalValue !== null : !nonnegative(total.totalValue) || !near(total.totalValue, sum)) invalid();
    }
    for (const channel of ["heartRate", "power"] as const) {
      const zones = period.zones[channel], size = channel === "heartRate" ? 5 : 7;
      const candidates = channel === "power" && request.discipline !== "bike" ? 0 : coverage.representativeActivityCount;
      if (!zones || ![zones.candidateActivityCount, zones.eligibleActivityCount, zones.missingSensorActivityCount, zones.contextUnknownActivityCount].every(count)
        || zones.candidateActivityCount !== candidates || zones.eligibleActivityCount + zones.missingSensorActivityCount + zones.contextUnknownActivityCount !== candidates
        || !nonnegative(zones.observedSeconds) || !Array.isArray(zones.groups) || zones.groups.length > candidates) invalid();
      const seen = new Set<string>();
      for (const group of zones.groups) {
        if (!group || !Array.isArray(group.seconds) || group.seconds.length !== size || !Array.from(group.seconds).every(nonnegative)
          || !nonnegative(group.observedSeconds) || !near(group.observedSeconds, group.seconds.reduce((a, b) => a + b, 0))
          || !Array.isArray(group.activityIds) || group.activityIds.length === 0 || new Set(group.activityIds).size !== group.activityIds.length || group.activityIds.some(value => !activityIds.has(value) || seen.has(value))) invalid();
        group.activityIds.forEach(value => seen.add(value));
        if (channel === "heartRate" && !("boundaries" in group) || channel === "power" && "boundaries" in group) invalid();
        if ("boundaries" in group) {
          const bounds = group.boundaries;
          if (!bounds || !["lthr", "max_hr"].includes(bounds.reference) || !nonnegative(bounds.referenceBpm) || bounds.referenceBpm < 50 || bounds.referenceBpm > 250
            || bounds.sport !== (request.discipline === "swim" ? "other" : request.discipline) || !Array.isArray(bounds.zones) || bounds.zones.length !== 5
            || Array.from(bounds.zones).some((zone, zoneIndex) => !zone || zone.zone !== zoneIndex + 1 || !nonnegative(zone.minPct) || !nonnegative(zone.minBpm)
              || zone.maxPct !== null && (!nonnegative(zone.maxPct) || zone.maxPct <= zone.minPct)
              || zone.maxBpmExclusive !== null && (!nonnegative(zone.maxBpmExclusive) || zone.maxBpmExclusive <= zone.minBpm))) invalid();
        } else if (!nonnegative(group.ftp) || group.ftp <= 0 || !["measured", "virtual"].includes(group.powerSource)) invalid();
      }
      if (seen.size !== zones.eligibleActivityCount || !near(zones.observedSeconds, zones.groups.reduce((sum, group) => sum + group.observedSeconds, 0))) invalid();
    }
    if (period.zones.power.reason !== (request.discipline === "bike" ? "recorded_ftp" : "not_applicable")
      || period.zones.pace?.status !== "unavailable" || period.zones.pace.reason !== "canonical_pace_zones_unavailable") invalid();
    const partial = coverage.truncated || Object.values(period.totals).some(total => total.missingActivityCount > 0)
      || period.zones.heartRate.missingSensorActivityCount + period.zones.heartRate.contextUnknownActivityCount
      + period.zones.power.missingSensorActivityCount + period.zones.power.contextUnknownActivityCount > 0;
    if (period.status !== (partial ? "partial" : "complete")) invalid();
  });
  return response;
}
export async function loadTrainingAnalysisPeriods(services: FirebaseServices, uid: string, request: TrainingAnalysisPeriodsRequest) {
  if (!trainingAnalysisPeriodsAvailable()) throw new Error("api_unavailable");
  const matches = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (services.functions.app !== services.auth.app
    || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("stage/callable-context-mismatch");
  if (!validTrainingAnalysisPeriodsRequest(request)) throw new Error("invalid_training_analysis_periods_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const result = await httpsCallable<TrainingAnalysisPeriodsRequest, TrainingAnalysisPeriodsResponse>(services.functions, "getTrainingAnalysisPeriods")(request);
  if (!matches()) throw new Error("account_changed");
  return validateTrainingAnalysisPeriodsResponse(result.data, request);
}
