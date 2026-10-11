import { httpsCallable } from "firebase/functions";
import type { PowerCurvePeriodsRequest, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const DURATIONS = new Set([1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600]);
export const POWER_DURATION_GRID = Object.freeze([...new Set([1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600, 5400, 7200, 10800, 21600, 43200, 86400,
  ...Array.from({ length: 79 }, (_, i) => Math.round(Math.exp(Math.log(86400) * i / 78))),
])].sort((a, b) => a - b));
const SOURCES = new Set(["strava_api", "direct_file", "orider_native", "apple_health", "health_connect"]);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export function validPowerCurvePeriodsRequest(request: PowerCurvePeriodsRequest, now = Date.now()) {
  return request?.unit === "W" && Array.isArray(request.periods) && request.periods.length >= 1 && request.periods.length <= 2
    && request.periods.every(period => integer(period?.fromInclusive) && integer(period?.toExclusive)
      && period.fromInclusive < period.toExclusive && period.toExclusive <= now);
}
/** Calendar inputs are UTC days; the UI's inclusive end date becomes an exclusive next midnight. */
export function utcPowerCurvePeriod(from: string, through: string, now: number) {
  const parse = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return NaN;
    const value = Date.parse(`${date}T00:00:00.000Z`);
    return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value : NaN;
  };
  const fromInclusive = parse(from), end = parse(through);
  if (!Number.isFinite(end) || end > now) return null;
  const period = { fromInclusive, toExclusive: Math.min(end + 86_400_000, now) };
  return validPowerCurvePeriodsRequest({ unit: "W", periods: [period] }, now) ? period : null;
}
export function validatePowerCurvePeriodsResponse(response: PowerCurvePeriodsResponse, request: PowerCurvePeriodsRequest) {
  const invalid = () => { throw new Error("invalid_power_curve_periods_response"); };
  if (!response || response.version !== 1 || response.discipline !== "bike" || response.unit !== "W"
      || !integer(response.asOf) || !Number.isFinite(new Date(response.asOf).getTime())
      || request.periods.some(period => response.asOf < period.toExclusive) || !/^[a-f0-9]{64}$/u.test(response.inputDigest)
      || !Array.isArray(response.periods) || response.periods.length !== request.periods.length) invalid();
  response.periods.forEach((period, index) => {
    const requested = request.periods[index]!;
    if (!period) invalid();
    const coverage = period.coverage;
    if (!period || period.fromInclusive !== requested.fromInclusive || period.toExclusive !== requested.toExclusive
        || !["complete", "partial"].includes(period.status) || !coverage || !Array.isArray(period.points)) invalid();
    const counts = [coverage.scannedActivityCount, coverage.candidateActivityCount, coverage.includedActivityCount,
      coverage.pendingActivityCount, coverage.missingActivityCount, coverage.incompleteActivityCount,
      coverage.ineligibleActivityCount, coverage.skippedActivityCount];
    if (!counts.every(integer) || coverage.scanLimit !== 1000 || coverage.scannedActivityCount > coverage.scanLimit
        || typeof coverage.truncated !== "boolean" || coverage.candidateCountKnown !== !coverage.truncated
        || coverage.scannedActivityCount !== coverage.candidateActivityCount + coverage.skippedActivityCount
        || coverage.candidateActivityCount !== coverage.includedActivityCount + coverage.pendingActivityCount + coverage.missingActivityCount + coverage.incompleteActivityCount + coverage.ineligibleActivityCount) invalid();
    const partial = coverage.truncated || coverage.pendingActivityCount > 0 || coverage.missingActivityCount > 0 || coverage.incompleteActivityCount > 0;
    if (period.status !== (partial ? "partial" : "complete") || period.points.length > 11
        || coverage.includedActivityCount === 0 && period.points.length > 0) invalid();
    if (Object.prototype.hasOwnProperty.call(period, "powerDurationObservations")) validateDenseObservations(period.powerDurationObservations, period);
    let previous = 0;
    for (const point of period.points) {
      if (!point || !DURATIONS.has(point.durationSeconds) || point.durationSeconds <= previous
          || !Number.isFinite(point.watts) || point.watts <= 0 || point.watts > 3000
          || typeof point.sourceActivityId !== "string" || !point.sourceActivityId || point.sourceActivityId.length > 512 || point.sourceActivityId.includes("/")
          || !integer(point.startTime) || point.startTime < period.fromInclusive || point.startTime >= period.toExclusive
          || !SOURCES.has(point.source) || typeof point.cohortEligible !== "boolean" || !/^\d+:\d+$/u.test(point.metricsRevision)) invalid();
      previous = point.durationSeconds;
    }
  });
  return response;
}
function validateDenseObservations(value: unknown, period: PowerCurvePeriodsResponse["periods"][number]) {
  const invalid = () => { throw new Error("invalid_power_curve_periods_response"); };
  const record = (input: unknown): Record<string, unknown> | null => input !== null && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  const data = record(value);
  if (!data) return invalid();
  const counts = record(data.counts), reasons = record(data.unavailableReasonCounts);
  const countKeys = ["available", "missing", "pending", "incomplete", "malformed", "unavailable"];
  const reasonKeys = ["incomplete_input", "virtual_power", "unknown_provenance", "unaligned_elapsed_axis", "missing_power", "input_limit"];
  if (Object.keys(data).sort().join(",") !== ["algorithmVersion", "gridVersion", "timingBasis", "scope", "fromInclusive", "toExclusive", "partial", "scanTruncated", "inputCandidateCount", "counts", "unavailableReasonCounts", "points"].sort().join(",")
    || data.algorithmVersion !== "power-duration-grid-v1" || data.gridVersion !== 1 || data.timingBasis !== "sample_owned_elapsed"
    || data.scope !== "observed_power_candidates" || data.fromInclusive !== period.fromInclusive || data.toExclusive !== period.toExclusive
    || typeof data.partial !== "boolean" || data.scanTruncated !== period.coverage.truncated
    || !integer(data.inputCandidateCount) || data.inputCandidateCount !== period.coverage.candidateActivityCount
    || !counts || !reasons || Object.keys(counts).length !== countKeys.length || Object.keys(reasons).length !== reasonKeys.length
    || !countKeys.every(key => integer(counts[key])) || !reasonKeys.every(key => integer(reasons[key]))
    || data.partial !== (data.scanTruncated || countKeys.slice(1).some(key => Number(counts[key]) > 0))
    || countKeys.reduce((sum, key) => sum + Number(counts[key]), 0) !== data.inputCandidateCount
    || reasonKeys.reduce((sum, key) => sum + Number(reasons[key]), 0) !== counts.unavailable
    || !Array.isArray(data.points) || data.points.length > POWER_DURATION_GRID.length) return invalid();
  let previous = 0;
  for (const raw of Array.from(data.points)) {
    const point = record(raw);
    if (!point || Object.keys(point).sort().join(",") !== ["durationSeconds", "maxAveragePowerW", "sourceActivityId", "startTime", "parentRevision", "provenance", "observedActivityCount"].sort().join(",")
      || !POWER_DURATION_GRID.includes(Number(point.durationSeconds)) || point.durationSeconds !== Number(point.durationSeconds)
      || Number(point.durationSeconds) <= previous || typeof point.maxAveragePowerW !== "number" || !Number.isFinite(point.maxAveragePowerW) || point.maxAveragePowerW < 0
      || !integer(point.observedActivityCount) || point.observedActivityCount < 1 || point.observedActivityCount > Number(counts.available)
      || typeof point.sourceActivityId !== "string" || !point.sourceActivityId.trim() || point.sourceActivityId.length > 256 || point.sourceActivityId.includes("/")
      || typeof point.parentRevision !== "string" || !point.parentRevision.trim() || point.parentRevision.length > 256
      || typeof point.provenance !== "string" || !["strava_api", "direct_file", "orider_native"].includes(point.provenance)
      || !integer(point.startTime) || point.startTime < period.fromInclusive || point.startTime >= period.toExclusive) return invalid();
    previous = Number(point.durationSeconds);
  }
}
export async function loadPowerCurvePeriods(services: FirebaseServices, uid: string, request: PowerCurvePeriodsRequest) {
  const matches = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (!validPowerCurvePeriodsRequest(request)) throw new Error("invalid_power_curve_periods_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const result = await httpsCallable<PowerCurvePeriodsRequest, PowerCurvePeriodsResponse>(services.functions, "getPowerCurvePeriods")(request);
  if (!matches()) throw new Error("account_changed");
  return validatePowerCurvePeriodsResponse(result.data, request);
}
