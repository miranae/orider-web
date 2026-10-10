import { httpsCallable } from "firebase/functions";
import type { PowerCurvePeriodsRequest, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const DURATIONS = new Set([1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600]);
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
