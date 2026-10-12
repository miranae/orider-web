import { httpsCallable } from "firebase/functions";
import { onIdTokenChanged } from "firebase/auth";
import { BIKE_DISTANCE_M, BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import { CYCLING_HISTORY_OVERLAY_RESPONSE_MAX_BYTES } from "@shared/types/stage-cycling-distance-history-overlay";
import type { StageCyclingDistanceHistoryOverlayRequest as Request, StageCyclingDistanceHistoryOverlayResponse as Response } from "@shared/types/stage-cycling-distance-history-overlay";
import type { CyclingCoveredStamp } from "@shared/types/stage-cycling-distance-covered-rankings";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { stageCyclingPreferenceAvailable } from "./stageCyclingDistanceEffortPreference";
import { validateCyclingCoveredResponse } from "./stageCyclingDistanceCoveredRankings";
const exact = (v: unknown, keys: string[]) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...keys].sort().join(",");
const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const before = (a: CyclingCoveredStamp, b: CyclingCoveredStamp) => a.seconds < b.seconds || a.seconds === b.seconds && a.nanoseconds < b.nanoseconds;
const stamp = (v: CyclingCoveredStamp, now: number) => exact(v, ["seconds", "nanoseconds"]) && count(v.seconds) && count(v.nanoseconds) && v.nanoseconds < 1e9 && v.nanoseconds % 1000 === 0 && v.seconds * 1000 + v.nanoseconds / 1e6 <= now;
/** 서버 read-time과 브라우저 시계 사이의 고정 허용치. 요청 범위·만료/TTL에는 적용하지 않는다. */
export const CYCLING_HISTORY_OVERLAY_SERVER_READ_LEAD_MS = 1000;
const serverStamp = (v: CyclingCoveredStamp, now: number) => stamp(v, now + CYCLING_HISTORY_OVERLAY_SERVER_READ_LEAD_MS);
const revision = (v: unknown) => typeof v === "string" && /^(0|[1-9]\d{0,11}):(0|[1-9]\d{0,8})$/u.test(v) && Number(v.split(":")[1]) < 1e9;
export const CYCLING_HISTORY_OVERLAY_REASON_CODES = ["request_scope", "response_shape", "response_size", "session_binding", "read_times", "read_times_shape", "read_times_quantum", "read_times_future", "read_times_source_binding", "read_times_stage_binding", "read_times_order", "evidence_shape", "activity_binding", "preference_shape", "original_efforts", "original_row_schema", "budget", "history_identity", "auth_epoch", "preference_changed", "expired", "server_input_changed", "transport"] as const;
export type CyclingHistoryOverlayReason = typeof CYCLING_HISTORY_OVERLAY_REASON_CODES[number];
export interface CyclingHistoryOverlayTiming { readTimes: Response["readTimes"]; clientObservedAtMillis: number; maxAheadMillis: number }
export function safeCyclingHistoryOverlayTiming(value: unknown): value is CyclingHistoryOverlayTiming {
  if (!exact(value, ["readTimes", "clientObservedAtMillis", "maxAheadMillis"])) return false;
  const t = value as CyclingHistoryOverlayTiming;
  if (!count(t.clientObservedAtMillis) || !Number.isFinite(new Date(t.clientObservedAtMillis).getTime()) || !count(t.maxAheadMillis)
    || !exact(t.readTimes, ["sourceInitial", "sourceFinal", "stageInitial", "stageFinal"])) return false;
  const stamps = Object.values(t.readTimes);
  if (!stamps.every(s => exact(s, ["seconds", "nanoseconds"]) && count(s.seconds) && count(s.nanoseconds) && s.nanoseconds < 1e9 && Number.isFinite(new Date(s.seconds * 1000 + s.nanoseconds / 1e6).getTime()))) return false;
  return t.maxAheadMillis === Math.max(0, Math.ceil(Math.max(...stamps.map(s => s.seconds * 1000 + s.nanoseconds / 1e6)) - t.clientObservedAtMillis));
}
function invalid(reason: CyclingHistoryOverlayReason = "response_shape", timing?: CyclingHistoryOverlayTiming): never {
  throw Object.assign(new Error("invalid_cycling_history_overlay_response"), { overlayReason: reason, ...(timing && safeCyclingHistoryOverlayTiming(timing) ? { overlayTiming: timing } : {}) });
}
/** 서버와 같은 정렬 JSON. digest는 상관관계이며 인증 수단이 아니다. */
export async function cyclingOverlayDigest(value: unknown): Promise<string> {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, item]) => [k, canonical(item)])) : v;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical(value))));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
}
export async function validateCyclingHistoryOverlayResponse(value: unknown, request: Request, uid: string, now = Date.now()): Promise<Response> {
  if (!validCyclingHistoryOverlayRequest(request, now)) invalid("request_scope");
  if (!exact(value, ["version", "mode", "history", "session", "pageBinding", "subsetBinding", "batchBinding", "evidence", "readTimes", "scope", "io"])) invalid();
  let encoded: string; try { encoded = JSON.stringify(value); } catch { return invalid(); }
  if (new TextEncoder().encode(encoded).byteLength > CYCLING_HISTORY_OVERLAY_RESPONSE_MAX_BYTES) invalid("response_size");
  const r = value as Response, s = r.session, h = r.history;
  if (r.version !== 1 || r.mode !== request.mode || r.scope !== "loaded_and_checked_dual_snapshot_activities"
    || !exact(h, ["calendarBasis", "rangeBasis", "year", "range", "sourceReadTime", "includeActivityTotals"]) || !exact(h.range, ["fromInclusive", "toExclusive"])
    || await cyclingOverlayDigest(h) !== await cyclingOverlayDigest(request.history) || r.pageBinding !== request.pageBinding || !digest(r.pageBinding)
    || !exact(s, ["scope", "ownerBinding", "requestBinding", "sourceProject", "stageProject", "targetsVersion", "provenanceVersion", "policyVersion", "calculatorArtifactHash", "observedCalculatorArtifactHash", "sourceReadTime", "stageReadTime", "expiresAt"])
    || s.scope !== "cycling_history_stage_overlay_v1" || s.sourceProject !== "miranae-orider-g1" || s.stageProject !== "orider-dev" || s.targetsVersion !== 1 || s.provenanceVersion !== 2 || s.policyVersion !== 1
    || ![s.ownerBinding, s.requestBinding, s.calculatorArtifactHash, s.observedCalculatorArtifactHash].every(digest)
    || !stamp(s.sourceReadTime, now) || !serverStamp(s.stageReadTime, now) || now - (s.stageReadTime.seconds * 1000 + s.stageReadTime.nanoseconds / 1e6) >= 1800_000 || await cyclingOverlayDigest(s.sourceReadTime) !== await cyclingOverlayDigest(h.sourceReadTime)
    || s.expiresAt !== s.sourceReadTime.seconds * 1000 + s.sourceReadTime.nanoseconds / 1e6 + 1800_000 || now >= s.expiresAt
    || s.ownerBinding !== await cyclingOverlayDigest([uid, s.scope]) || s.requestBinding !== await cyclingOverlayDigest([uid, h, s.calculatorArtifactHash, s.observedCalculatorArtifactHash, s.stageReadTime, s.scope])
    || request.session && await cyclingOverlayDigest(request.session) !== await cyclingOverlayDigest(s)
    || r.subsetBinding !== await cyclingOverlayDigest(request.activities) || r.batchBinding !== await cyclingOverlayDigest([s, r.pageBinding, r.subsetBinding])) invalid("session_binding");
  if (!exact(r.readTimes, ["sourceInitial", "sourceFinal", "stageInitial", "stageFinal"]) || !Object.values(r.readTimes).every(t => exact(t, ["seconds", "nanoseconds"]) && count(t.seconds) && count(t.nanoseconds) && t.nanoseconds < 1e9)) invalid("read_times_shape");
  const timing: CyclingHistoryOverlayTiming = { readTimes: Object.fromEntries(Object.entries(r.readTimes).map(([key, t]) => [key, { seconds: t.seconds, nanoseconds: t.nanoseconds }])) as Response["readTimes"], clientObservedAtMillis: now,
    maxAheadMillis: Math.max(0, Math.ceil(Math.max(...Object.values(r.readTimes).map(t => t.seconds * 1000 + t.nanoseconds / 1e6)) - now)) };
  if (Object.values(r.readTimes).some(t => t.nanoseconds % 1000 !== 0)) invalid("read_times_quantum", timing);
  if (Object.values(r.readTimes).some(t => t.seconds * 1000 + t.nanoseconds / 1e6 > now + CYCLING_HISTORY_OVERLAY_SERVER_READ_LEAD_MS)) invalid("read_times_future", timing);
  if (await cyclingOverlayDigest(r.readTimes.sourceInitial) !== await cyclingOverlayDigest(s.sourceReadTime)) invalid("read_times_source_binding", timing);
  if (await cyclingOverlayDigest(r.readTimes.stageInitial) !== await cyclingOverlayDigest(s.stageReadTime)) invalid("read_times_stage_binding", timing);
  if (before(r.readTimes.stageFinal, s.stageReadTime) || [s.sourceReadTime, s.stageReadTime, r.readTimes.stageFinal].some(t => before(r.readTimes.sourceFinal, t))) invalid("read_times_order", timing);
  if (!Array.isArray(r.evidence) || r.evidence.length !== request.activities.length || r.evidence.length < 1 || r.evidence.length > 20) invalid("evidence_shape");
  for (const [index, e] of r.evidence.entries()) {
    const a = request.activities[index]!;
    if (!exact(e, ["row", "activityRevision", "metricsRevision", "incarnationBinding", "snapshotBinding", "canonicalPreferenceBinding", "snapshotPreferenceBinding", "canonicalExcluded", "snapshotExcluded"])
      || e.row?.activityId !== a.activityId || e.activityRevision !== a.activityRevision || e.metricsRevision !== a.metricsRevision || !revision(e.activityRevision) || e.metricsRevision !== null && !revision(e.metricsRevision)
      || ![e.incarnationBinding, e.snapshotBinding, e.canonicalPreferenceBinding, e.snapshotPreferenceBinding].every(digest)) invalid("activity_binding");
    for (const exclusions of [e.canonicalExcluded, e.snapshotExcluded]) if (!Array.isArray(exclusions) || exclusions.length > 13 || new Set(exclusions).size !== exclusions.length || exclusions.some(t => !BIKE_DISTANCE_TARGETS.includes(t))) invalid("preference_shape");
    // 기존 닫힌 행 스키마 검증기를 단일 원본에 적용한다. 페이지별 대표 투영은 하지 않는다.
    const row = e.row;
    if (!Array.isArray(row.efforts) || row.efforts.some(effort => !effort || effort.excluded || effort.canonicalActivityId !== row.activityId || effort.effortSourceActivityId !== (effort.originalElapsedSec === null ? null : row.activityId))) invalid("original_efforts");
    const targets = BIKE_DISTANCE_TARGETS.map((target, i) => { const effort = row.efforts[i]!; const rank = effort?.effectiveElapsedSec == null ? null : { ...effort, activityId: row.activityId, startTime: row.startTime, effectiveElapsedSec: effort.effectiveElapsedSec }; return { target, distanceM: BIKE_DISTANCE_M[target], top10: rank ? [rank] : [], winner: rank, nextBest: null }; });
    try { validateCyclingCoveredResponse({ version: 1, mode: "stage_cycling_distance_covered_rankings_v1", requestScope: { calendarBasis: "Asia/Seoul", range: h.range, rangeBasis: "explicit_range", year: null, profile: 20, anchor: { activityId: null, outcome: "not_requested" }, selectionOrder: "start_time_asc_with_optional_anchor" }, cohort: { hash: s.requestBinding, loadedActivityCount: 1, scannedActivityCount: 1, queryExhausted: false, profileLimitReached: false, rankingScope: "covered_activities", overlayApplied: true }, readTimes: r.readTimes, rows: [row], targets,
      coverage: { canonicalSupported: ["observed", "no_observed_efforts"].includes(row.canonicalState) ? 1 : 0, snapshotSupported: row.snapshotState === "supported" ? 1 : 0, missing: row.canonicalState === "unavailable" && row.snapshotState === "missing" ? 1 : 0, legacyUnsupported: row.canonicalState === "legacy_unsupported" && row.snapshotState !== "supported" ? 1 : 0, noObserved: row.canonicalState === "no_observed_efforts" || row.snapshotState === "supported" && row.efforts.every(e => e.originalElapsedSec === null) ? 1 : 0, duplicateUncertain: row.duplicateUncertain ? 1 : 0, skipped: 0, excludedByTarget: Object.fromEntries(BIKE_DISTANCE_TARGETS.map(t => [t, 0])) }, io: { sourceDocs: 0, stageDocs: 0, metadata: 0, payloads: 0, writes: 0, logicalDocMaximum: 358, limits: { docs: 370, metadata: 40, payloads: 0, writes: 0 } } }, { version: 1, mode: "stage_cycling_distance_covered_rankings_v1", calendarBasis: "Asia/Seoul", range: { rangeBasis: "explicit_range", ...h.range }, profile: 20 }, now + CYCLING_HISTORY_OVERLAY_SERVER_READ_LEAD_MS); } catch { invalid("original_row_schema"); }
  }
  const io = r.io;
  if (!exact(io, ["sourceDocs", "stageDocs", "metadata", "payloads", "writes", "logicalDocMaximum", "limits"]) || !exact(io.limits, ["docs", "metadata", "payloads", "writes"])
    || ![io.sourceDocs, io.stageDocs, io.metadata].every(count) || io.sourceDocs + io.stageDocs > 16 * r.evidence.length + 12 || io.metadata > 2 * r.evidence.length
    || io.logicalDocMaximum !== 16 * r.evidence.length + 12 || io.payloads !== 0 || io.writes !== 0 || io.limits.docs !== 370 || io.limits.metadata !== 40 || io.limits.payloads !== 0 || io.limits.writes !== 0) invalid("budget");
  return r;
}
export function validCyclingHistoryOverlayRequest(request: Request, now = Date.now()) {
  if (!exact(request, ["version", "mode", "history", "pageBinding", "activities", ...(request?.session ? ["session"] : [])]) || request.version !== 1 || request.mode !== "stage_cycling_distance_history_overlay_v1" || !digest(request.pageBinding)) return false;
  const h = request.history;
  if (!exact(h, ["calendarBasis", "rangeBasis", "year", "range", "sourceReadTime", "includeActivityTotals"]) || h.calendarBasis !== "Asia/Seoul" || typeof h.includeActivityTotals !== "boolean" || !stamp(h.sourceReadTime, now)
    || now - (h.sourceReadTime.seconds * 1000 + h.sourceReadTime.nanoseconds / 1e6) >= 1800_000 || !exact(h.range, ["fromInclusive", "toExclusive"]) || !count(h.range.fromInclusive) || !count(h.range.toExclusive) || h.range.fromInclusive >= h.range.toExclusive || h.range.toExclusive > Math.floor(h.sourceReadTime.seconds * 1000 + h.sourceReadTime.nanoseconds / 1e6)) return false;
  if (h.rangeBasis === "calendar_year") { if (!Number.isInteger(h.year) || h.year! < 1972 || h.year! > new Date(now + 32400000).getUTCFullYear() || h.range.fromInclusive !== Date.UTC(h.year!, 0, 1) - 32400000 || h.range.toExclusive !== Math.min(Date.UTC(h.year! + 1, 0, 1) - 32400000, Math.floor(h.sourceReadTime.seconds * 1000 + h.sourceReadTime.nanoseconds / 1e6))) return false; }
  else if (h.rangeBasis !== "explicit_range" || h.year !== null) return false;
  if (!Array.isArray(request.activities) || request.activities.length < 1 || request.activities.length > 20 || new Set(request.activities.map(a => a.activityId)).size !== request.activities.length) return false;
  if (request.session) {
    const s = request.session;
    if (!exact(s, ["scope", "ownerBinding", "requestBinding", "sourceProject", "stageProject", "targetsVersion", "provenanceVersion", "policyVersion", "calculatorArtifactHash", "observedCalculatorArtifactHash", "sourceReadTime", "stageReadTime", "expiresAt"]) || s.scope !== "cycling_history_stage_overlay_v1" || s.sourceProject !== "miranae-orider-g1" || s.stageProject !== "orider-dev" || s.targetsVersion !== 1 || s.provenanceVersion !== 2 || s.policyVersion !== 1 || ![s.ownerBinding, s.requestBinding, s.calculatorArtifactHash, s.observedCalculatorArtifactHash].every(digest) || !stamp(s.sourceReadTime, now) || !serverStamp(s.stageReadTime, now) || s.sourceReadTime.seconds !== h.sourceReadTime.seconds || s.sourceReadTime.nanoseconds !== h.sourceReadTime.nanoseconds || s.expiresAt !== s.sourceReadTime.seconds * 1000 + s.sourceReadTime.nanoseconds / 1e6 + 1800_000 || now >= s.expiresAt) return false;
  }
  return request.activities.every(a => exact(a, ["activityId", "activityRevision", "metricsRevision"]) && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(a.activityId) && revision(a.activityRevision) && (a.metricsRevision === null || revision(a.metricsRevision)));
}
export async function loadCyclingHistoryOverlay(services: FirebaseServices, request: Request, signal: AbortSignal): Promise<Response> {
  if (!validCyclingHistoryOverlayRequest(request)) throw new Error("invalid_cycling_history_overlay_request");
  const original = services.auth.currentUser; let changed = false, observed = false;
  const active = () => !signal.aborted && !changed && !!original && !original.isAnonymous && original === services.auth.currentUser;
  if (!active()) throw new Error("account_changed");
  if (!stageCyclingPreferenceAvailable() || services.auth.app.options.projectId !== "miranae-orider-g1" || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("api_unavailable");
  const unsubscribe = onIdTokenChanged(services.auth, next => { if (observed || next !== original) changed = true; observed = true; });
  try { await services.ensureAppCheckReady(); if (!active()) throw new Error("account_changed"); const response = await httpsCallable<Request, unknown>(services.functions, "getTrainingAnalysisPeriods")(request); if (!active()) throw new Error("account_changed"); let decoded: Response; try { decoded = await validateCyclingHistoryOverlayResponse(response.data, request, original!.uid); } catch (error) { if (error instanceof Error && CYCLING_HISTORY_OVERLAY_REASON_CODES.includes((error as Error & { overlayReason?: CyclingHistoryOverlayReason }).overlayReason!)) throw error; return invalid(); } if (!active()) throw new Error("account_changed"); return decoded; }
  finally { unsubscribe(); }
}
