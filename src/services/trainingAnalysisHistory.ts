import { validExpandedDistanceRecords } from "../utils/expandedRunDistances";
import { httpsCallable } from "firebase/functions";
import { RUN_DISTANCES } from "@shared/types/personal-records";
import type { TrainingAnalysisHistoryRequest, TrainingAnalysisHistoryResponse, TrainingAnalysisHistoryCursor } from "@shared/types/training-analysis-history";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { trainingAnalysisPeriodsAvailable } from "./trainingAnalysisPeriods";
import { getDiscipline } from "../utils/disciplineFilter";

// 이 history wire는 v34부터 유효하다. 최신 계산 버전 상승으로 이미 확정된 snapshot을 거부하지 않는다.
const HISTORY_MIN_CALCULATOR_VERSION = 34;

export const HISTORY_TTL_MS = 1800000;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const positive = (value: unknown): value is number => finite(value) && value > 0;
export function validHistoryDocumentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("/") && value !== "." && value !== ".." && !/^__[\s\S]*__$/.test(value)
    && !Array.from(value).some(character => character.length === 1 && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff)
    && new TextEncoder().encode(value).length <= 1500;
}
const id = validHistoryDocumentId;
function compareDocumentIds(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, keys: string[]) => record(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
export function historyReadTimeMs(time: TrainingAnalysisHistoryCursor["readTime"]) { return time.seconds * 1000 + Math.floor(time.nanoseconds / 1e6); }
const validTime = (time: unknown): time is TrainingAnalysisHistoryCursor["readTime"] => exact(time, ["seconds", "nanoseconds"]) && count((time as TrainingAnalysisHistoryCursor["readTime"]).seconds) && count((time as TrainingAnalysisHistoryCursor["readTime"]).nanoseconds) && (time as TrainingAnalysisHistoryCursor["readTime"]).nanoseconds < 1e9 && (time as TrainingAnalysisHistoryCursor["readTime"]).nanoseconds % 1000 === 0 && count((time as TrainingAnalysisHistoryCursor["readTime"]).seconds * 1000);
export function historyYearRange(year: number, asOf: number) { return { fromInclusive: Date.UTC(year, 0, 1) - 32400000, toExclusive: Math.min(asOf, Date.UTC(year + 1, 0, 1) - 32400000) }; }
function validCursor(cursor: unknown, year: number, now: number): cursor is TrainingAnalysisHistoryCursor {
  if (!exact(cursor, ["readTime", "toExclusive", "after", "requestBinding"])) return false;
  const c = cursor as TrainingAnalysisHistoryCursor;
  if (!validTime(c.readTime) || !count(c.toExclusive) || !exact(c.after, ["startTime", "activityId"]) || !finite(c.after.startTime) || !id(c.after.activityId) || typeof c.requestBinding !== "string" || !/^[a-f0-9]{64}$/.test(c.requestBinding)) return false;
  const asOf = historyReadTimeMs(c.readTime), range = historyYearRange(year, asOf);
  return asOf <= now && now - asOf < HISTORY_TTL_MS && c.toExclusive === range.toExclusive && c.after.startTime >= range.fromInclusive && c.after.startTime < range.toExclusive;
}
export function validTrainingAnalysisHistoryRequest(request: TrainingAnalysisHistoryRequest, now = Date.now()) {
  return record(request) && Object.keys(request).every(key => ["mode", "discipline", "calendarBasis", "year", "cursor", "includeExpandedRunDistances"].includes(key)) && (request.includeExpandedRunDistances === undefined || request.includeExpandedRunDistances === true) && request.mode === "history_page" && request.discipline === "run" && request.calendarBasis === "Asia/Seoul" && Number.isInteger(request.year) && request.year >= 1972 && request.year <= new Date(now + 32400000).getUTCFullYear() && (request.cursor === undefined || validCursor(request.cursor, request.year, now));
}
export function historyPositionAfter(a: { startTime: number; activityId: string }, b: { startTime: number; activityId: string }) { return a.startTime > b.startTime || a.startTime === b.startTime && compareDocumentIds(a.activityId, b.activityId) > 0; }
/** 오래되거나 잘못된 응답 및 끊긴 스냅샷 연결은 집계에 섞지 않는다. */
export function validateTrainingAnalysisHistoryResponse(value: unknown, request: TrainingAnalysisHistoryRequest, now = Date.now()): TrainingAnalysisHistoryResponse {
  const invalid = (): never => { throw new Error("invalid_training_analysis_history_response"); };
  if (request.cursor && validTime(request.cursor.readTime) && now >= historyReadTimeMs(request.cursor.readTime) + HISTORY_TTL_MS) throw new Error("history_snapshot_expired");
  if (!validTrainingAnalysisHistoryRequest(request, now) || !exact(value, ["version", "mode", "discipline", "calendarBasis", "year", "scope", "queryScope", "range", "readTime", "expiresAt", "page", "activities"])) invalid();
  const r = value as TrainingAnalysisHistoryResponse;
  if (r.version !== 1 || r.mode !== "history_page" || r.discipline !== "run" || r.calendarBasis !== "Asia/Seoul" || r.year !== request.year || r.scope !== "page" || r.queryScope !== "owner_activities_with_valid_start_time" || !validTime(r.readTime) || !exact(r.range, ["fromInclusive", "toExclusive"]) || !count(r.expiresAt)) invalid();
  const asOf = historyReadTimeMs(r.readTime), expected = historyYearRange(request.year, asOf);
  if (now - asOf >= HISTORY_TTL_MS) throw new Error("history_snapshot_expired");
  if (asOf > now || r.range.fromInclusive !== expected.fromInclusive || r.range.toExclusive !== expected.toExclusive || r.expiresAt !== asOf + HISTORY_TTL_MS) invalid();
  if (request.cursor && (r.readTime.seconds !== request.cursor.readTime.seconds || r.readTime.nanoseconds !== request.cursor.readTime.nanoseconds || r.range.toExclusive !== request.cursor.toExclusive)) invalid();
  const p = r.page;
  if (!exact(p, ["limit", "scannedActivityCount", "candidateActivityCount", "skippedActivityCount", "exhausted", "nextCursor"]) || p.limit !== 50 || ![p.scannedActivityCount, p.candidateActivityCount, p.skippedActivityCount].every(count) || p.scannedActivityCount > 50 || p.candidateActivityCount + p.skippedActivityCount !== p.scannedActivityCount || typeof p.exhausted !== "boolean" || !Array.isArray(r.activities) || r.activities.length !== p.candidateActivityCount || request.cursor && p.scannedActivityCount === 0 || (p.exhausted ? p.nextCursor !== null : p.scannedActivityCount !== 50 || !validCursor(p.nextCursor, r.year, now))) invalid();
  if (p.nextCursor && (p.nextCursor.readTime.seconds !== r.readTime.seconds || p.nextCursor.readTime.nanoseconds !== r.readTime.nanoseconds || p.nextCursor.toExclusive !== r.range.toExclusive || request.cursor && p.nextCursor.requestBinding !== request.cursor.requestBinding || request.cursor && !historyPositionAfter(p.nextCursor.after, request.cursor.after))) invalid();
  const seen = new Set<string>();
  let previous = request.cursor?.after;
  for (const row of r.activities) {
    if (!exact(row, ["activityId", "startTime", "activityRevision", "metricsRevision", "representativeInput", "analysis", "distanceRecords", "paceCurve", ...(row.expandedDistanceRecords !== undefined ? ["expandedDistanceRecords"] : [])]) || !id(row.activityId) || seen.has(row.activityId) || !count(row.startTime) || row.startTime < r.range.fromInclusive || row.startTime >= r.range.toExclusive || !text(row.activityRevision) || row.metricsRevision !== null && !text(row.metricsRevision) || previous && !historyPositionAfter(row, previous)) invalid();
    seen.add(row.activityId); previous = row;
    const input = row.representativeInput, a = row.analysis, d = row.distanceRecords, c = row.paceCurve;
    if (row.expandedDistanceRecords !== undefined && (request.includeExpandedRunDistances !== true || !validExpandedDistanceRecords(row.expandedDistanceRecords, a?.state === "ready"))) invalid();
    if (!exact(input, ["source", "type", "discipline", "localSessionId", "stravaActivityId", "stravaTwinActivityId", "endTime", "movingSec", "hasLoad"]) || input.discipline !== "run" || !text(input.type) || getDiscipline(input.type) !== "run" || input.source !== null && !text(input.source) || input.localSessionId !== null && !text(input.localSessionId) || [input.stravaActivityId, input.stravaTwinActivityId].some(n => n !== null && (!count(n) || n <= 0)) || input.endTime !== null && (!finite(input.endTime) || input.endTime <= row.startTime) || input.movingSec !== null && !finite(input.movingSec) || typeof input.hasLoad !== "boolean") invalid();
    if (!exact(a, ["state", "calculatorVersion", "inputCoverage"]) || !["ready", "missing", "pending", "stale", "outdated", "partial", "invalid"].includes(a.state) || a.calculatorVersion !== null && !count(a.calculatorVersion) || ![null, "complete", "partial_terminal", "pending"].includes(a.inputCoverage) || a.state === "ready" && (a.inputCoverage !== "complete" || a.calculatorVersion === null || a.calculatorVersion < HISTORY_MIN_CALCULATOR_VERSION || row.metricsRevision === null) || a.state === "missing" && (row.metricsRevision !== null || a.calculatorVersion !== null || a.inputCoverage !== null)) invalid();
    if (!exact(d, ["state", "reason", "points"]) || !Array.isArray(d.points) || d.points.length > 5 || !["observed", "no_observed_efforts", "unavailable"].includes(d.state) || new Set(d.points.map(point => point?.distance)).size !== d.points.length || d.points.some(point => !exact(point, ["distance", "elapsedSec"]) || !RUN_DISTANCES.includes(point.distance) || !positive(point.elapsedSec)) || (d.state === "observed" ? a.state !== "ready" || d.points.length === 0 || d.reason !== null : d.points.length !== 0 || d.reason !== (d.state === "unavailable" ? a.state === "ready" ? "missing_or_invalid_field" : "metrics_unavailable" : null)) || a.state !== "ready" && d.state !== "unavailable") invalid();
    if (!exact(c, ["state", "reason", "value"]) || !["observed", "no_observed_efforts", "unavailable"].includes(c.state) || (c.state === "observed" ? a.state !== "ready" || c.reason !== null || c.value === null : c.value !== null || c.reason !== (c.state === "unavailable" ? a.state === "ready" ? "missing_or_invalid_field" : "metrics_unavailable" : null)) || a.state !== "ready" && c.state !== "unavailable") invalid();
    if (c.value) {
      const curve = c.value, durations = curve.sourceBasis === "speed_curve_kmh_converted" ? [30, 60, 300, 600, 1200, 1800, 3600] : [30, 60, 180, 300, 600, 1200, 1800, 3600, 7200];
      if (!exact(curve, ["sourceBasis", "unit", "points"]) || !["run_metrics_pace_curve", "speed_curve_kmh_converted"].includes(curve.sourceBasis) || curve.unit !== "sec_per_km" || !Array.isArray(curve.points) || !curve.points.length || curve.points.length > durations.length || new Set(curve.points.map(point => point?.durationSeconds)).size !== curve.points.length || curve.points.some(point => !exact(point, ["durationSeconds", "paceSecPerKm", "speedKph"]) || !durations.includes(point.durationSeconds) || !positive(point.paceSecPerKm) || (curve.sourceBasis === "run_metrics_pace_curve" ? point.speedKph !== null : !positive(point.speedKph) || point.speedKph < 5 || Math.abs(3600 / point.speedKph - point.paceSecPerKm) > 1e-6))) invalid();
    }
  }
  if (p.nextCursor && previous && (historyPositionAfter(previous, p.nextCursor.after) || p.candidateActivityCount === p.scannedActivityCount && (previous.startTime !== p.nextCursor.after.startTime || previous.activityId !== p.nextCursor.after.activityId))) invalid();
  return r;
}
export async function loadTrainingAnalysisHistory(services: FirebaseServices, uid: string, request: TrainingAnalysisHistoryRequest) {
  if (!trainingAnalysisPeriodsAvailable("run")) throw new Error("api_unavailable");
  const matches = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("stage/callable-context-mismatch");
  if (!validTrainingAnalysisHistoryRequest(request)) throw new Error("invalid_training_analysis_history_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const result = await httpsCallable<TrainingAnalysisHistoryRequest, unknown>(services.functions, "getTrainingAnalysisPeriods")(request);
  if (!matches()) throw new Error("account_changed");
  return validateTrainingAnalysisHistoryResponse(result.data, request);
}
