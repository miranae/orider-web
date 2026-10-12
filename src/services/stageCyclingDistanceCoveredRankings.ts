import { httpsCallable } from "firebase/functions";
import { onIdTokenChanged } from "firebase/auth";
import { BIKE_DISTANCE_M, BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import { STAGE_CYCLING_COVERED_ACTIVITY_ID_MAX_CHARS, STAGE_CYCLING_COVERED_RESPONSE_MAX_BYTES } from "@shared/types/stage-cycling-distance-covered-rankings";
import type { CyclingCoveredEffort, CyclingCoveredRank, StageCyclingDistanceCoveredRankingsRequest as Request, StageCyclingDistanceCoveredRankingsResponse as Response } from "@shared/types/stage-cycling-distance-covered-rankings";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { stageCyclingPreferenceAvailable } from "./stageCyclingDistanceEffortPreference";
import { getDiscipline } from "../utils/disciplineFilter";
const exact = (v: unknown, keys: string[]) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...keys].sort().join(",");
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const date = (v: unknown): v is number => count(v) && Number.isFinite(new Date(v).getTime());
const text = (v: unknown, max = 160): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const id = (v: unknown): v is string => text(v, STAGE_CYCLING_COVERED_ACTIVITY_ID_MAX_CHARS) && !v.includes("/") && v !== "." && v !== ".." && [...v].every(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127);
const nullableText = (v: unknown) => v === null || text(v);
const invalid = (): never => { throw new Error("invalid_cycling_covered_rankings_response"); };
const dense = (v: unknown, length: number) => Array.isArray(v) && v.length === length && Array.from({ length }, (_, i) => Object.prototype.hasOwnProperty.call(v, i)).every(Boolean);
export function validCyclingCoveredRequest(v: Request, now = Date.now()) {
  if (!v || typeof v !== "object" || !exact(v, ["version", "mode", "calendarBasis", "range", "profile", ...(Object.prototype.hasOwnProperty.call(v, "anchorActivityId") ? ["anchorActivityId"] : [])]) || v.version !== 1 || v.mode !== "stage_cycling_distance_covered_rankings_v1" || v.calendarBasis !== "Asia/Seoul" || ![10, 20].includes(v.profile)
    || Object.prototype.hasOwnProperty.call(v, "anchorActivityId") && (typeof v.anchorActivityId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(v.anchorActivityId))) return false;
  const r = v.range;
  return r?.rangeBasis === "calendar_year" ? exact(r, ["rangeBasis", "year"]) && Number.isInteger(r.year) && r.year >= 1972 && r.year <= new Date(now + 32400000).getUTCFullYear()
    : r?.rangeBasis === "explicit_range" && exact(r, ["rangeBasis", "fromInclusive", "toExclusive"]) && date(r.fromInclusive) && date(r.toExclusive) && r.fromInclusive < r.toExclusive && r.toExclusive <= now;
}
const effortKeys = ["target", "originalElapsedSec", "effectiveElapsedSec", "basis", "excluded", "canonicalActivityId", "effortSourceActivityId", "conflict", "originalClockVerified", "quality", "coverage"];
function effort(e: CyclingCoveredEffort, rank = false) {
  return exact(e, [...effortKeys, ...(rank ? ["activityId", "startTime"] : [])]) && BIKE_DISTANCE_TARGETS.includes(e.target) && typeof e.excluded === "boolean" && typeof e.conflict === "boolean" && id(e.canonicalActivityId)
    && (e.effortSourceActivityId === null || id(e.effortSourceActivityId)) && e.originalClockVerified === false && e.quality === "unknown" && e.coverage === "unknown"
    && ["canonical_metrics", "stage_distance_snapshot", "unavailable"].includes(e.basis)
    && (e.originalElapsedSec === null ? e.effectiveElapsedSec === null && e.basis === "unavailable" && e.effortSourceActivityId === null : finite(e.originalElapsedSec) && e.originalElapsedSec > 0 && e.basis !== "unavailable" && e.effortSourceActivityId !== null && e.effectiveElapsedSec === (e.excluded ? null : e.originalElapsedSec));
}
const compare = (a: CyclingCoveredRank, b: CyclingCoveredRank) => a.effectiveElapsedSec - b.effectiveElapsedSec || b.startTime - a.startTime || a.activityId.localeCompare(b.activityId);
/** 범위·전체 행·13개 목표를 함께 검증하며 일부 행만 남기지 않는다. */
export function validateCyclingCoveredResponse(value: unknown, request: Request, now = Date.now()): Response {
  if (!validCyclingCoveredRequest(request, now) || !exact(value, ["version", "mode", "requestScope", "cohort", "readTimes", "rows", "targets", "coverage", "io"])) invalid();
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { return invalid(); }
  if (new TextEncoder().encode(encoded).byteLength > STAGE_CYCLING_COVERED_RESPONSE_MAX_BYTES) invalid();
  const r = value as Response, s = r.requestScope, c = r.cohort;
  if (r.version !== 1 || r.mode !== request.mode || !exact(s, ["calendarBasis", "range", "rangeBasis", "year", "profile", "anchor", "selectionOrder"]) || s.calendarBasis !== "Asia/Seoul" || s.profile !== request.profile || s.rangeBasis !== request.range.rangeBasis || s.year !== (request.range.rangeBasis === "calendar_year" ? request.range.year : null)
    || s.selectionOrder !== "start_time_asc_with_optional_anchor" || !exact(s.range, ["fromInclusive", "toExclusive"]) || !date(s.range.fromInclusive) || !date(s.range.toExclusive) || s.range.fromInclusive >= s.range.toExclusive || s.range.toExclusive > now
    || !exact(s.anchor, ["activityId", "outcome"]) || s.anchor.activityId !== (request.anchorActivityId ?? null) || !["not_requested", "in_prefix", "included", "outside_range", "unavailable"].includes(s.anchor.outcome) || (s.anchor.outcome === "not_requested") !== (request.anchorActivityId === undefined)) invalid();
  const bounds = request.range.rangeBasis === "calendar_year" ? { fromInclusive: Date.UTC(request.range.year, 0, 1) - 32400000, toExclusive: Date.UTC(request.range.year + 1, 0, 1) - 32400000 } : request.range;
  if (s.range.fromInclusive !== bounds.fromInclusive || (request.range.rangeBasis === "explicit_range" ? s.range.toExclusive !== bounds.toExclusive : s.range.toExclusive > bounds.toExclusive || bounds.toExclusive <= now && s.range.toExclusive !== bounds.toExclusive)) invalid();
  if (!exact(c, ["hash", "loadedActivityCount", "scannedActivityCount", "queryExhausted", "profileLimitReached", "rankingScope", "overlayApplied"]) || typeof c.hash !== "string" || !/^[a-f0-9]{64}$/u.test(c.hash) || !count(c.loadedActivityCount) || c.loadedActivityCount > request.profile || !count(c.scannedActivityCount) || c.scannedActivityCount > request.profile || typeof c.queryExhausted !== "boolean" || typeof c.profileLimitReached !== "boolean" || c.profileLimitReached !== (c.scannedActivityCount === request.profile) || c.rankingScope !== "covered_activities" || c.overlayApplied !== true || !dense(r.rows, c.loadedActivityCount) || !dense(r.targets, 13)) invalid();
  if (!exact(r.readTimes, ["sourceInitial", "sourceFinal", "stageInitial", "stageFinal"])) invalid();
  for (const stamp of Object.values(r.readTimes)) if (!exact(stamp, ["seconds", "nanoseconds"]) || !count(stamp.seconds) || !count(stamp.nanoseconds) || stamp.nanoseconds >= 1e9 || !date(stamp.seconds * 1000 + Math.floor(stamp.nanoseconds / 1e6)) || stamp.seconds * 1000 + stamp.nanoseconds / 1e6 > now) invalid();
  for (const [a, b] of [[r.readTimes.sourceInitial, r.readTimes.sourceFinal], [r.readTimes.stageInitial, r.readTimes.stageFinal], [r.readTimes.stageFinal, r.readTimes.sourceFinal]]) if (a!.seconds > b!.seconds || a!.seconds === b!.seconds && a!.nanoseconds > b!.nanoseconds) invalid();
  const rows = new Map(r.rows.map(row => [row.activityId, row]));
  if (rows.size !== r.rows.length) invalid();
  for (const row of r.rows) {
    if (!exact(row, ["activityId", "startTime", "type", "source", "representativeInput", "activityTotals", "canonicalState", "snapshotState", "duplicateUncertain", "efforts"]) || !id(row.activityId) || !date(row.startTime) || row.startTime < s.range.fromInclusive || row.startTime >= s.range.toExclusive || !text(row.type, 32) || row.type !== row.type.trim() || getDiscipline(row.type) !== "bike" || !nullableText(row.source) || typeof row.duplicateUncertain !== "boolean" || !["observed", "no_observed_efforts", "legacy_unsupported", "unavailable"].includes(row.canonicalState) || !["supported", "missing", "not_applicable"].includes(row.snapshotState) || !dense(row.efforts, 13)) invalid();
    const p = row.representativeInput, t = row.activityTotals;
    if (!exact(p, ["source", "type", "discipline", "localSessionId", "stravaActivityId", "stravaTwinActivityId", "endTime", "movingSec", "hasLoad"]) || p.source !== row.source || p.type !== row.type || p.discipline !== "bike" || !nullableText(p.localSessionId) || typeof p.hasLoad !== "boolean" || [p.stravaActivityId, p.stravaTwinActivityId].some(v => v !== null && (!count(v) || v === 0)) || p.endTime !== null && (!date(p.endTime) || p.endTime <= row.startTime) || p.movingSec !== null && !finite(p.movingSec)) invalid();
    if (!exact(t, ["scope", "distanceM", "elevationGainM", "sourceBasis", "distanceSource", "sourceLayer", "elevationQuality", "gpsEligibility"]) || t.scope !== "observed_activity_totals" || t.gpsEligibility !== "unknown" || !exact(t.sourceBasis, ["distanceM", "elevationGainM"]) || ![null, "recorded_summary", "stream_counter"].includes(t.distanceSource) || ![null, "raw_parts", "inline_streams"].includes(t.sourceLayer) || !["reliable", "suspect", "unknown"].includes(t.elevationQuality)) invalid();
    for (const k of ["distanceM", "elevationGainM"] as const) if (!(["canonical_metrics", "activity_summary", "unavailable"].includes(t.sourceBasis[k])) || (t[k] === null ? t.sourceBasis[k] !== "unavailable" : !finite(t[k]) || t.sourceBasis[k] === "unavailable")) invalid();
    for (const [i, e] of row.efforts.entries()) if (!effort(e) || e.target !== BIKE_DISTANCE_TARGETS[i] || !rows.has(e.canonicalActivityId) || e.effortSourceActivityId !== null && !rows.has(e.effortSourceActivityId)) invalid();
  }
  for (const row of r.rows) for (const e of row.efforts) {
    const representative = rows.get(e.canonicalActivityId)!.efforts.find(v => v.target === e.target)!;
    const source = e.effortSourceActivityId === null ? representative : rows.get(e.effortSourceActivityId)!.efforts.find(v => v.target === e.target)!;
    if ([representative, source].some(v => effortKeys.some(k => v[k as keyof CyclingCoveredEffort] !== e[k as keyof CyclingCoveredEffort]))) invalid();
  }
  if (["included", "in_prefix"].includes(s.anchor.outcome) && !rows.has(s.anchor.activityId!) || ["outside_range", "unavailable"].includes(s.anchor.outcome) && rows.has(s.anchor.activityId!)) invalid();
  for (const [i, target] of r.targets.entries()) {
    if (!exact(target, ["target", "distanceM", "top10", "winner", "nextBest"]) || target.target !== BIKE_DISTANCE_TARGETS[i] || target.distanceM !== BIKE_DISTANCE_M[target.target] || !Array.isArray(target.top10) || target.top10.length > 10 || !dense(target.top10, target.top10.length)) invalid();
    const expected = new Map<string, CyclingCoveredRank>();
    for (const row of r.rows) { const e = row.efforts[i]!; if (e.effectiveElapsedSec !== null) { const source = rows.get(e.effortSourceActivityId!)!; const rank = { ...e, activityId: e.canonicalActivityId, startTime: source.startTime, effectiveElapsedSec: e.effectiveElapsedSec }; const prior = expected.get(e.canonicalActivityId); if (prior && effortKeys.some(k => prior[k as keyof CyclingCoveredEffort] !== e[k as keyof CyclingCoveredEffort])) invalid(); expected.set(e.canonicalActivityId, rank); } }
    const sorted = [...expected.values()].sort(compare).slice(0, 10);
    const same = (a: CyclingCoveredRank | null, b: CyclingCoveredRank | null) => a === null || b === null ? a === b : effort(a, true) && [...effortKeys, "activityId", "startTime"].every(k => a[k as keyof CyclingCoveredRank] === b[k as keyof CyclingCoveredRank]);
    if (target.top10.length !== sorted.length || target.top10.some((rank, index) => !same(rank, sorted[index]!)) || !same(target.winner, sorted[0] ?? null) || !same(target.nextBest, sorted[1] ?? null)) invalid();
  }
  const v = r.coverage;
  if (!exact(v, ["canonicalSupported", "snapshotSupported", "missing", "legacyUnsupported", "noObserved", "excludedByTarget", "duplicateUncertain", "skipped"]) || !exact(v.excludedByTarget, [...BIKE_DISTANCE_TARGETS])) invalid();
  const counts = { canonicalSupported: r.rows.filter(row => ["observed", "no_observed_efforts"].includes(row.canonicalState)).length, snapshotSupported: r.rows.filter(row => row.snapshotState === "supported").length, missing: r.rows.filter(row => row.canonicalState === "unavailable" && row.snapshotState === "missing").length, legacyUnsupported: r.rows.filter(row => row.canonicalState === "legacy_unsupported" && row.snapshotState !== "supported").length, noObserved: r.rows.filter(row => row.canonicalState === "no_observed_efforts" || row.snapshotState === "supported" && row.efforts.every(e => e.originalElapsedSec === null)).length, duplicateUncertain: r.rows.filter(row => row.duplicateUncertain).length };
  if (!count(v.skipped) || v.skipped > c.scannedActivityCount || Object.entries(counts).some(([key, n]) => v[key as keyof typeof counts] !== n)) invalid();
  for (const target of BIKE_DISTANCE_TARGETS) if (v.excludedByTarget[target] !== new Set(r.rows.flatMap(row => row.efforts.filter(e => e.target === target && e.excluded).map(e => e.canonicalActivityId))).size) invalid();
  const io = r.io;
  if (!exact(io, ["sourceDocs", "stageDocs", "metadata", "payloads", "writes", "limits", "logicalDocMaximum"]) || !exact(io.limits, ["docs", "metadata", "payloads", "writes"]) || ![io.sourceDocs, io.stageDocs, io.metadata].every(count) || io.payloads !== 0 || io.writes !== 0 || io.limits.payloads !== 0 || io.limits.writes !== 0 || io.limits.docs !== (request.profile === 10 ? 200 : 370) || io.limits.metadata !== (request.profile === 10 ? 20 : 40) || io.logicalDocMaximum !== (request.profile === 10 ? 188 : 358) || io.sourceDocs + io.stageDocs > io.limits.docs || io.metadata > io.limits.metadata) invalid();
  return r;
}
export async function loadCyclingCoveredRankings(services: FirebaseServices, request: Request, signal?: AbortSignal) {
  const original = services.auth.currentUser;
  let changed = false, observed = false;
  const matches = () => !signal?.aborted && !changed && original === services.auth.currentUser && !!original && !original.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (!stageCyclingPreferenceAvailable() || services.auth.app.options.projectId !== "miranae-orider-g1" || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("api_unavailable");
  if (!validCyclingCoveredRequest(request)) throw new Error("invalid_cycling_covered_rankings_request");
  const unsubscribe = onIdTokenChanged(services.auth, user => { if (observed || user !== original) changed = true; observed = true; });
  try {
    await services.ensureAppCheckReady(); if (!matches()) throw new Error("account_changed");
    const response = await httpsCallable<Request, unknown>(services.functions, "getTrainingAnalysisPeriods")(request);
    if (!matches()) throw new Error("account_changed");
    return validateCyclingCoveredResponse(response.data, request);
  } finally { unsubscribe(); }
}

/** 선택 저장 성공만 전달하며 재조회는 사용자가 실행한다. */
export const cyclingCoveredPreferenceChanges = new EventTarget();
export function invalidateCyclingCoveredPreferences(uid: string) { cyclingCoveredPreferenceChanges.dispatchEvent(new CustomEvent("changed", { detail: uid })); }
