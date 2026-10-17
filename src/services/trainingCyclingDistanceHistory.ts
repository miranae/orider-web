import { legacyCyclingProvenance, validCyclingProvenance } from "../utils/cyclingDistancePeriods";
import { httpsCallable } from "firebase/functions";
import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import { BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import type { CyclingDistanceHistoryCursor, CyclingDistanceHistoryRequest, CyclingDistanceHistoryResponse, CyclingDistanceHistoryRow } from "@shared/types/training-cycling-distance-history";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { trainingAnalysisPeriodsAvailable } from "./trainingAnalysisPeriods";
import { historyPositionAfter, validHistoryDocumentId } from "./trainingAnalysisHistory";
import { getDiscipline } from "../utils/disciplineFilter";

// canonical totals는 v35부터 유효하다. outdated summary 상한은 서버 최신 계산 버전을 따른다.
const ACTIVITY_TOTALS_CALCULATOR_VERSION = 35;
// 이 history wire는 v34부터 유효하다. 최신 계산 버전 상승으로 이미 확정된 snapshot을 거부하지 않는다.
const HISTORY_MIN_CALCULATOR_VERSION = 34;

export const CYCLING_HISTORY_CAP = 5000;
export const CYCLING_HISTORY_TTL_MS = 1800000;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, keys: string[]) => record(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const date = (value: unknown): value is number => count(value) && Number.isFinite(new Date(value).getTime());
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160;
const revision = (value: unknown) => typeof value === "string" && /^(0|[1-9]\d*):(0|[1-9]\d*)$/u.test(value)
  && count(Number(value.split(":")[0])) && count(Number(value.split(":")[1])) && Number(value.split(":")[1]) < 1e9;
export const cyclingHistoryTimeMs = (time: CyclingDistanceHistoryCursor["readTime"]) => time.seconds * 1000 + time.nanoseconds / 1e6;
const time = (value: unknown): value is CyclingDistanceHistoryCursor["readTime"] => exact(value, ["seconds", "nanoseconds"])
  && count((value as CyclingDistanceHistoryCursor["readTime"]).seconds) && count((value as CyclingDistanceHistoryCursor["readTime"]).nanoseconds)
  && (value as CyclingDistanceHistoryCursor["readTime"]).nanoseconds < 1e9 && (value as CyclingDistanceHistoryCursor["readTime"]).nanoseconds % 1000 === 0
  && date(Math.floor(cyclingHistoryTimeMs(value as CyclingDistanceHistoryCursor["readTime"])));
export function cyclingHistoryBounds(request: CyclingDistanceHistoryRequest) {
  return request.rangeBasis === "calendar_year" ? { fromInclusive: Date.UTC(request.year, 0, 1) - 32400000, toExclusive: Date.UTC(request.year + 1, 0, 1) - 32400000 } : request.range;
}
function cursorValid(value: unknown, request: CyclingDistanceHistoryRequest, now: number): value is CyclingDistanceHistoryCursor {
  if (!exact(value, ["scope", "readTime", "range", "after", "requestBinding"])) return false;
  const c = value as CyclingDistanceHistoryCursor, bounds = cyclingHistoryBounds(request);
  if (c.scope !== "cycling_distance_history_v1_targets1" || !time(c.readTime) || !exact(c.range, ["fromInclusive", "toExclusive"])
    || !exact(c.after, ["startTime", "activityId"]) || !finite(c.after.startTime) || !validHistoryDocumentId(c.after.activityId)
    || typeof c.requestBinding !== "string" || !/^[a-f0-9]{64}$/u.test(c.requestBinding)) return false;
  const asOf = cyclingHistoryTimeMs(c.readTime);
  return asOf <= now && now - asOf < CYCLING_HISTORY_TTL_MS && c.range.fromInclusive === bounds.fromInclusive
    && c.range.toExclusive === Math.min(Math.floor(asOf), bounds.toExclusive) && c.after.startTime >= c.range.fromInclusive && c.after.startTime < c.range.toExclusive;
}
export function validCyclingDistanceHistoryRequest(value: CyclingDistanceHistoryRequest, now = Date.now()) {
  if (!record(value) || value.mode !== "cycling_distance_history_page" || value.discipline !== "bike" || value.calendarBasis !== "Asia/Seoul") return false;
  const keys = ["mode", "discipline", "calendarBasis", "rangeBasis", ...(value.cursor === undefined ? [] : ["cursor"]), ...(value.includeActivityTotals === undefined ? [] : ["includeActivityTotals"]), value.rangeBasis === "calendar_year" ? "year" : "range"];
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", calendar: "gregory", year: "numeric" }).formatToParts(now).find(part => part.type === "year")?.value);
  if (value.includeActivityTotals !== undefined && value.includeActivityTotals !== true || !exact(value, keys) || (value.rangeBasis === "calendar_year" ? !Number.isInteger(value.year) || value.year < 1972 || value.year > year
    : value.rangeBasis !== "explicit_range" || !exact(value.range, ["fromInclusive", "toExclusive"]) || !date(value.range.fromInclusive) || !date(value.range.toExclusive) || value.range.fromInclusive >= value.range.toExclusive || value.range.toExclusive > now)) return false;
  return value.cursor === undefined || cursorValid(value.cursor, value, now);
}
/** 선택 totals만 격리한다. 기존 거리 관측 계약이나 원본 객체를 변경하지 않는다. */
function validActivityTotals(row: CyclingDistanceHistoryRow): boolean {
  const t = row.activityTotals;
  if (!exact(t, ["scope", "distanceM", "elevationGainM", "sourceBasis", "distanceSource", "sourceLayer", "elevationQuality", "gpsEligibility"]) || !t || t.scope !== "observed_activity_totals" || t.gpsEligibility !== "unknown"
    || !exact(t.sourceBasis, ["distanceM", "elevationGainM"]) || ![null, "recorded_summary", "stream_counter"].includes(t.distanceSource)
    || ![null, "raw_parts", "inline_streams"].includes(t.sourceLayer) || !["reliable", "suspect", "unknown"].includes(t.elevationQuality)) return false;
  for (const key of ["distanceM", "elevationGainM"] as const) {
    const value = t[key], basis = t.sourceBasis[key];
    if (!["canonical_metrics", "activity_summary", "unavailable"].includes(basis) || value !== null && !finite(value) || (value === null) !== (basis === "unavailable")) return false;
    if (basis === "canonical_metrics" && (row.analysis.state !== "ready" || row.metricsRevision === null || row.analysis.inputCoverage !== "complete" || row.analysis.calculatorVersion === null || row.analysis.calculatorVersion < ACTIVITY_TOTALS_CALCULATOR_VERSION)) return false;
    if (basis === "activity_summary" && row.analysis.state !== "missing" && (row.analysis.state !== "outdated" || row.metricsRevision === null || row.analysis.inputCoverage !== "complete" || row.analysis.calculatorVersion == null || row.analysis.calculatorVersion <= 0 || row.analysis.calculatorVersion >= ACTIVITY_METRICS_VERSION)) return false;
  }
  if (t.sourceBasis.distanceM === "canonical_metrics" ? t.distanceSource === null : t.distanceSource !== null) return false;
  if (Object.values(t.sourceBasis).every(basis => basis !== "canonical_metrics") && t.sourceLayer !== null) return false;
  return t.sourceBasis.elevationGainM === "canonical_metrics" ? t.elevationQuality === "reliable"
    : t.elevationGainM !== null ? t.elevationQuality === "unknown" : t.elevationQuality !== "reliable";
}
/** 이 채널의 timestamp:nanos revision은 canonical-average의 SHA256과 별도 계약이다. */
export function validateCyclingDistanceHistoryResponse(value: unknown, request: CyclingDistanceHistoryRequest, now = Date.now()): CyclingDistanceHistoryResponse {
  const invalid = (): never => { throw new Error("invalid_cycling_distance_history_response"); };
  if (request.cursor && time(request.cursor.readTime) && now >= cyclingHistoryTimeMs(request.cursor.readTime) + CYCLING_HISTORY_TTL_MS) throw new Error("history_snapshot_expired");
  const legacyKeys = ["version", "mode", "discipline", "calendarBasis", "rangeBasis", "year", "targetsVersion", "timingBasis", "quality", "coverage", "scope", "queryScope", "range", "readTime", "expiresAt", "page", "activities"];
  const legacy = exact(value, legacyKeys) && (value as { timingBasis?: unknown }).timingBasis === "original_activity_elapsed";
  if (!validCyclingDistanceHistoryRequest(request, now) || !exact(value, [...legacyKeys, ...(legacy ? [] : ["provenanceVersion", "sourceBasis", "originalClockVerified"])])) invalid();
  const raw = value as CyclingDistanceHistoryResponse;
  const r: CyclingDistanceHistoryResponse = legacy ? { ...raw, provenanceVersion: 2, sourceBasis: "stored_distance_parts", originalClockVerified: false, timingBasis: "stored_explicit_activity_elapsed" } : raw;
  if (r.version !== 1 || r.mode !== request.mode || r.discipline !== "bike" || r.calendarBasis !== "Asia/Seoul" || r.rangeBasis !== request.rangeBasis || r.year !== (request.rangeBasis === "calendar_year" ? request.year : null)
    || r.targetsVersion !== 1 || r.provenanceVersion !== 2 || r.sourceBasis !== "stored_distance_parts" || r.originalClockVerified !== false || r.timingBasis !== "stored_explicit_activity_elapsed" || r.quality !== "unknown" || r.coverage !== "unknown" || r.scope !== "page" || r.queryScope !== "owner_activities_with_valid_start_time"
    || !time(r.readTime) || !exact(r.range, ["fromInclusive", "toExclusive"])) invalid();
  const asOf = cyclingHistoryTimeMs(r.readTime), responseMillis = r.readTime.seconds * 1000 + Math.floor(r.readTime.nanoseconds / 1e6), bounds = cyclingHistoryBounds(request);
  if (now - asOf >= CYCLING_HISTORY_TTL_MS) throw new Error("history_snapshot_expired");
  if (asOf > now || r.expiresAt !== responseMillis + CYCLING_HISTORY_TTL_MS || r.range.fromInclusive !== bounds.fromInclusive || r.range.toExclusive !== Math.min(responseMillis, bounds.toExclusive)) invalid();
  if (request.cursor && (r.readTime.seconds !== request.cursor.readTime.seconds || r.readTime.nanoseconds !== request.cursor.readTime.nanoseconds || r.range.toExclusive !== request.cursor.range.toExclusive)) invalid();
  const p = r.page;
  if (!exact(p, ["limit", "scannedActivityCount", "candidateActivityCount", "skippedActivityCount", "exhausted", "nextCursor", "observationCounts"]) || p.limit !== 50
    || ![p.scannedActivityCount, p.candidateActivityCount, p.skippedActivityCount].every(count) || p.scannedActivityCount > 50 || p.candidateActivityCount + p.skippedActivityCount !== p.scannedActivityCount
    || typeof p.exhausted !== "boolean" || !Array.isArray(r.activities) || r.activities.length !== p.candidateActivityCount || request.cursor && p.scannedActivityCount === 0
    || (p.exhausted ? p.nextCursor !== null : p.scannedActivityCount !== 50 || !cursorValid(p.nextCursor, request, now))
    || !exact(p.observationCounts, ["observed", "noObserved", "unsupported", "unavailable"]) || !Object.values(p.observationCounts).every(count)
    || Object.values(p.observationCounts).reduce((a, b) => a + b, 0) !== p.candidateActivityCount) invalid();
  if (p.nextCursor && (p.nextCursor.readTime.seconds !== r.readTime.seconds || p.nextCursor.readTime.nanoseconds !== r.readTime.nanoseconds || p.nextCursor.range.fromInclusive !== r.range.fromInclusive || p.nextCursor.range.toExclusive !== r.range.toExclusive
    || request.cursor && (p.nextCursor.requestBinding !== request.cursor.requestBinding || !historyPositionAfter(p.nextCursor.after, request.cursor.after)))) invalid();
  const cleanActivities: CyclingDistanceHistoryRow[] = [];
  let isolatedTotals = false;
  const seen = new Set<string>(), observed = { observed: 0, noObserved: 0, unsupported: 0, unavailable: 0 };
  let previous = request.cursor?.after;
  for (let rowIndex = 0; rowIndex < r.activities.length; rowIndex++) {
    if (!Object.prototype.hasOwnProperty.call(r.activities, rowIndex)) invalid();
    const row = r.activities[rowIndex]!;
    if (!exact(row, ["activityId", "startTime", "activityRevision", "metricsRevision", "representativeInput", "analysis", "distanceObservations", ...(request.includeActivityTotals === true && Object.prototype.hasOwnProperty.call(row, "activityTotals") ? ["activityTotals"] : [])]) || !validHistoryDocumentId(row.activityId) || seen.has(row.activityId) || !date(row.startTime) || row.startTime < r.range.fromInclusive || row.startTime >= r.range.toExclusive
      || !revision(row.activityRevision) || row.metricsRevision !== null && !revision(row.metricsRevision) || previous && !historyPositionAfter(row, previous)) invalid();
    seen.add(row.activityId); previous = row;
    const input = row.representativeInput, a = row.analysis, d = row.distanceObservations;
    if (!exact(input, ["source", "type", "discipline", "localSessionId", "stravaActivityId", "stravaTwinActivityId", "endTime", "movingSec", "hasLoad"]) || input.discipline !== "bike" || !text(input.type) || getDiscipline(input.type) !== "bike"
      || input.source !== null && !text(input.source) || input.localSessionId !== null && !text(input.localSessionId) || [input.stravaActivityId, input.stravaTwinActivityId].some(id => id !== null && (!count(id) || id <= 0))
      || input.endTime !== null && (!finite(input.endTime) || !Number.isFinite(new Date(input.endTime).getTime()) || input.endTime <= row.startTime) || input.movingSec !== null && !finite(input.movingSec) || typeof input.hasLoad !== "boolean") invalid();
    if (!exact(a, ["state", "calculatorVersion", "inputCoverage"]) || !["ready", "missing", "pending", "stale", "outdated", "partial", "invalid"].includes(a.state) || a.calculatorVersion !== null && !count(a.calculatorVersion)
      || ![null, "complete", "partial_terminal", "pending"].includes(a.inputCoverage) || a.state === "ready" && (a.inputCoverage !== "complete" || a.calculatorVersion === null || a.calculatorVersion < HISTORY_MIN_CALCULATOR_VERSION || row.metricsRevision === null)
      || a.state === "missing" && (a.calculatorVersion !== null || a.inputCoverage !== null || row.metricsRevision !== null)) invalid();
    if (!exact(d, ["state", "points", ...(!legacy && record(d) && (d.state === "observed" || d.state === "no_observed_efforts") ? ["provenance"] : [])]) || !["observed", "no_observed_efforts", "legacy_unsupported", "unavailable"].includes(d.state) || !Array.isArray(d.points) || d.points.length > BIKE_DISTANCE_TARGETS.length
      || (d.state === "observed" ? a.state !== "ready" || d.points.length === 0 : d.points.length !== 0) || (d.state === "no_observed_efforts" || d.state === "legacy_unsupported") && a.state !== "ready") invalid();
    if (!legacy && (d.state === "observed" || d.state === "no_observed_efforts") && !validCyclingProvenance(d.provenance)) invalid();
    const normalizedRow = legacy && (d.state === "observed" || d.state === "no_observed_efforts") ? { ...row, distanceObservations: { ...d, provenance: { ...legacyCyclingProvenance } } } : row;
    const distances = new Set<string>();
    for (let pointIndex = 0; pointIndex < d.points.length; pointIndex++) {
      if (!Object.prototype.hasOwnProperty.call(d.points, pointIndex)) invalid();
      const point = d.points[pointIndex]!;
      if (!exact(point, ["distance", "elapsedSec"]) || !BIKE_DISTANCE_TARGETS.includes(point.distance) || distances.has(point.distance) || !count(point.elapsedSec) || point.elapsedSec <= 0
        || input.endTime !== null && point.elapsedSec > Math.round((input.endTime - row.startTime) / 1000)) invalid();
      distances.add(point.distance);
    }
    if (Object.prototype.hasOwnProperty.call(row, "activityTotals") && !validActivityTotals(row)) {
      const { activityTotals: _invalidTotals, ...safe } = normalizedRow; void _invalidTotals; cleanActivities.push(safe); isolatedTotals = true;
    } else cleanActivities.push(normalizedRow);
    observed[d.state === "observed" ? "observed" : d.state === "no_observed_efforts" ? "noObserved" : d.state === "legacy_unsupported" ? "unsupported" : "unavailable"]++;
  }
  if (Object.keys(observed).some(key => observed[key as keyof typeof observed] !== p.observationCounts[key as keyof typeof observed])) invalid();
  if (p.nextCursor && previous && (historyPositionAfter(previous, p.nextCursor.after) || p.candidateActivityCount === p.scannedActivityCount && (previous.startTime !== p.nextCursor.after.startTime || previous.activityId !== p.nextCursor.after.activityId))) invalid();
  return isolatedTotals || legacy ? { ...r, activities: cleanActivities } : r;
}
export async function loadCyclingDistanceHistory(services: FirebaseServices, uid: string, request: CyclingDistanceHistoryRequest) {
  if (!trainingAnalysisPeriodsAvailable()) throw new Error("api_unavailable");
  const matches = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("stage/callable-context-mismatch");
  if (!validCyclingDistanceHistoryRequest(request)) throw new Error("invalid_cycling_distance_history_request");
  await services.ensureAppCheckReady(); if (!matches()) throw new Error("account_changed");
  const response = await httpsCallable<CyclingDistanceHistoryRequest, unknown>(services.functions, "getTrainingAnalysisPeriods")(request);
  if (!matches()) throw new Error("account_changed");
  return validateCyclingDistanceHistoryResponse(response.data, request);
}
