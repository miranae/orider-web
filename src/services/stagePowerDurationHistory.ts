import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import type { StagePowerHistoryCandidate, StagePowerHistoryComputedCandidate, StagePowerHistoryComputeRequest, StagePowerHistoryComputeResponse, StagePowerHistoryPageRequest, StagePowerHistoryPageResponse, StagePowerHistorySelection, StagePowerHistorySession } from "@shared/types/stage-power-duration-history";
import { stageActivityPowerAvailable } from "./stageActivityPowerDuration";
import { compareExactPowerEnergy, exactPowerWeightRatio, roundedExactPowerAverage } from "../features/activity/detail/stagePowerHistoryExact";
const MAX = 604800, LIMIT = 5000;
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const revision = (v: unknown): v is string => typeof v === "string" && /^\d+:\d+$/u.test(v) && v.length <= 100;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const exact = (v: unknown, fields: string[], optional: string[] = []) => !!v && typeof v === "object" && !Array.isArray(v) && fields.every(k => Object.prototype.hasOwnProperty.call(v, k)) && Object.keys(v).every(k => fields.includes(k) || optional.includes(k) && (v as Record<string, unknown>)[k] !== undefined);
const invalid = (): never => { throw new Error("invalid_stage_power_history_response"); };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function compareCursorIds(a: string, b: string) {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i]! - right[i]!;
  return left.length - right.length;
}
export function validStagePowerHistorySelection(v: StagePowerHistorySelection, now = Date.now()) {
  return v?.unit === "W" && Number.isSafeInteger(v.durationSeconds) && v.durationSeconds >= 1 && v.durationSeconds <= MAX
    && Array.isArray(v.periods) && v.periods.length >= 1 && v.periods.length <= 2 && count(v.periodIndex) && v.periodIndex < v.periods.length
    && v.periods.every(p => exact(p, ["fromInclusive", "toExclusive"]) && count(p.fromInclusive) && count(p.toExclusive) && p.fromInclusive < p.toExclusive && p.toExclusive <= now)
    && (v.includeWeightNormalized === undefined || typeof v.includeWeightNormalized === "boolean");
}
function validSession(v: StagePowerHistorySession) {
  return exact(v, ["readTime", "expiresAt", "requestBinding"]) && exact(v.readTime, ["seconds", "nanoseconds"]) && count(v.readTime.seconds)
    && count(v.readTime.nanoseconds) && v.readTime.nanoseconds < 1e9 && v.readTime.nanoseconds % 1000 === 0 && Number.isSafeInteger(v.readTime.seconds * 1000)
    && finite(v.expiresAt) && v.expiresAt === v.readTime.seconds * 1000 + v.readTime.nanoseconds / 1e6 + 1800000 && digest(v.requestBinding);
}
const candidateKeys = ["activityId", "startTime", "activityIncarnation", "activityRevision", "baseMetricsRevision", "sourcePowerOrigin", "analysisState", "snapshotState", "snapshotRevision", "candidateBinding", "physicalIdentity"];
function validCandidate(v: StagePowerHistoryCandidate, selection: StagePowerHistorySelection) {
  const range = selection.periods[selection.periodIndex]!;
  return exact(v, candidateKeys) && id(v.activityId) && count(v.startTime) && v.startTime >= range.fromInclusive && v.startTime < range.toExclusive
    && revision(v.activityIncarnation) && revision(v.activityRevision) && (v.baseMetricsRevision === null || revision(v.baseMetricsRevision))
    && [null, "measured", "stored_native_watts_unverified"].includes(v.sourcePowerOrigin)
    && ["ready", "missing", "pending", "stale", "outdated", "invalid", "unsupported"].includes(v.analysisState)
    && ["missing", "present_unverified", "invalid_header"].includes(v.snapshotState)
    && (v.snapshotState === "present_unverified" ? digest(v.snapshotRevision) : v.snapshotRevision === null) && digest(v.candidateBinding)
    && exact(v.physicalIdentity, ["source", "localSessionId", "stravaActivityId", "stravaTwinActivityId"])
    && [v.physicalIdentity.source, v.physicalIdentity.localSessionId].every(x => x === null || typeof x === "string" && x.length >= 1 && x.length <= 160)
    && [v.physicalIdentity.stravaActivityId, v.physicalIdentity.stravaTwinActivityId].every(x => x === null || count(x) && x > 0)
    && (v.analysisState !== "ready" || v.sourcePowerOrigin !== null && v.baseMetricsRevision !== null);
}
export function stagePowerHistoryCandidateReady(v: StagePowerHistoryCandidate) { return v.analysisState === "ready" && v.sourcePowerOrigin !== null && v.baseMetricsRevision !== null && v.snapshotState !== "invalid_header"; }
function base(value: StagePowerHistoryPageResponse | StagePowerHistoryComputeResponse, request: StagePowerHistoryPageRequest | StagePowerHistoryComputeRequest) {
  if (!value || value.version !== 1 || value.mode !== request.mode || value.unit !== "W" || value.durationSeconds !== request.durationSeconds
    || !equal(value.periods, request.periods) || value.periodIndex !== request.periodIndex || value.includeWeightNormalized !== request.includeWeightNormalized
    || !validSession(value.session) || request.session && !equal(value.session, request.session)
    || value.collectionCompleteness !== "unknown" || value.originalClockVerified !== false) invalid();
}
export function validateStagePowerHistoryPage(value: StagePowerHistoryPageResponse, request: StagePowerHistoryPageRequest) {
  base(value, request);
  if (!exact(value, ["version", "mode", "scope", "queryScope", "unit", "durationSeconds", "periods", "periodIndex", "session", "page", "activities", "collectionCompleteness", "originalClockVerified", "costs"], ["includeWeightNormalized"])
    || value.scope !== "observed_manual_history_page" || value.queryScope !== "owner_activities_with_valid_start_time"
    || !exact(value.page, ["limit", "scannedActivityCount", "candidateActivityCount", "skippedActivityCount", "exhausted", "enumerationState", "nextCursor"])
    || value.page.limit !== 20 || ![value.page.scannedActivityCount, value.page.candidateActivityCount, value.page.skippedActivityCount].every(count)
    || value.page.scannedActivityCount > 20 || value.page.scannedActivityCount !== value.page.candidateActivityCount + value.page.skippedActivityCount
    || value.page.enumerationState !== (value.page.exhausted ? "exhausted" : "partial") || typeof value.page.exhausted !== "boolean"
    || !Array.isArray(value.activities) || value.activities.length !== value.page.candidateActivityCount || new Set(value.activities.map(v => v.activityId)).size !== value.activities.length
    || value.activities.some(v => !validCandidate(v, request)) || !exact(value.costs, ["documents", "metadata", "snapshotBodies", "queries", "rawPayloads", "writes"])
    || !count(value.costs.documents) || value.costs.documents > 160 || value.costs.metadata !== 0 || value.costs.snapshotBodies !== 0 || value.costs.queries !== 1 || value.costs.rawPayloads !== 0 || value.costs.writes !== 0) invalid();
  if (value.page.exhausted) { if (value.page.nextCursor !== null) invalid(); }
  else {
    const cursor = value.page.nextCursor, range = request.periods[request.periodIndex]!;
    if (!exact(cursor, ["after"]) || !exact(cursor!.after, ["startTime", "activityId"]) || !finite(cursor!.after.startTime)
      || cursor!.after.startTime < range.fromInclusive || cursor!.after.startTime >= Math.min(range.toExclusive, value.session.readTime.seconds * 1000 + value.session.readTime.nanoseconds / 1e6) || typeof cursor!.after.activityId !== "string"
      || !cursor!.after.activityId || new TextEncoder().encode(cursor!.after.activityId).length > 1500 || cursor!.after.activityId.includes("/")
      || [".", ".."].includes(cursor!.after.activityId) || /^__[\s\S]*__$/u.test(cursor!.after.activityId)) invalid();
    if (request.cursor && (cursor!.after.startTime < request.cursor.after.startTime || cursor!.after.startTime === request.cursor.after.startTime && compareCursorIds(cursor!.after.activityId, request.cursor.after.activityId) <= 0)) invalid();
  }
  return value;
}
function validComputed(row: StagePowerHistoryComputedCandidate, request: StagePowerHistoryComputeRequest) {
  const requested = request.candidates.find(v => v.activityId === row.activityId);
  const keys = [...candidateKeys, "state", "reason", "result", "comparison", "sourceDigest", "timingBasis", "sensorBucketOriginVerified", "originalClockVerified", "quality", "collectionCompleteness"];
  if (!exact(row, keys, request.includeWeightNormalized ? ["weightNormalized"] : []) || !requested || candidateKeys.some(key => !equal(row[key as keyof StagePowerHistoryCandidate], requested[key as keyof StagePowerHistoryCandidate]))
    || row.timingBasis !== "stored_native_one_second_slot_policy" || row.sensorBucketOriginVerified !== false || row.originalClockVerified !== false || row.quality !== "unknown" || row.collectionCompleteness !== "unknown") invalid();
  if (row.state === "unavailable") {
    if (!["snapshot_missing", "no_continuous_window"].includes(row.reason ?? "") || row.comparison !== null
      || row.reason === "snapshot_missing" && (row.result !== null || row.sourceDigest !== null)
      || row.reason === "no_continuous_window" && (!row.result || row.result.state !== "unavailable" || !digest(row.sourceDigest))) invalid();
  } else if (row.state !== "available" || row.reason !== null || !row.result || row.result.state !== "available" || !digest(row.sourceDigest) || !row.comparison) invalid();
  if (row.result) {
    const r = row.result, hasOrigin = Object.prototype.hasOwnProperty.call(r, "powerSource");
    if (!exact(r, ["version", "scope", "timingBasis", "sensorBucketOriginVerified", "originalClockVerified", "quality", "collectionCompleteness", "unit", "state", "reason", "requestedDurationSeconds", "maxAveragePowerW", "windowStartElapsedSec", "windowEndElapsedSec", "observedSeconds", "longestContinuousSeconds"], hasOrigin ? ["powerSource"] : [])
      || (row.sourcePowerOrigin === "measured" ? hasOrigin : r.powerSource !== "stored_native_watts_unverified")
      || r.version !== 1 || r.unit !== "W" || r.scope !== "whole_activity_observed_intervals" || r.timingBasis !== row.timingBasis || r.sensorBucketOriginVerified !== false || r.originalClockVerified !== false
      || r.quality !== "unknown" || r.collectionCompleteness !== "unknown" || r.requestedDurationSeconds !== request.durationSeconds
      || !finite(r.observedSeconds) || r.observedSeconds > MAX || !finite(r.longestContinuousSeconds) || r.longestContinuousSeconds > r.observedSeconds) invalid();
    if (r.state === "available") {
      const recover = (n: number) => { const ms = Math.round(n * 1000); return finite(n) && n <= MAX && Number.isSafeInteger(ms) && n === ms / 1000 ? ms : null; };
      const start = recover(r.windowStartElapsedSec), end = recover(r.windowEndElapsedSec);
      if (r.reason !== null || r.longestContinuousSeconds < request.durationSeconds || !finite(r.maxAveragePowerW) || r.maxAveragePowerW > Number.MAX_SAFE_INTEGER || start === null || end === null || end - start !== request.durationSeconds * 1000
        || !exact(row.comparison, ["sourcePowerOrigin", "energyWattMilliseconds", "durationMilliseconds"]) || row.comparison!.sourcePowerOrigin !== row.sourcePowerOrigin || row.comparison!.durationMilliseconds !== request.durationSeconds * 1000) invalid();
      compareExactPowerEnergy(row.comparison!.energyWattMilliseconds, row.comparison!.durationMilliseconds, "0", 1000);
      if (r.maxAveragePowerW !== roundedExactPowerAverage(row.comparison!.energyWattMilliseconds, row.comparison!.durationMilliseconds)) invalid();
    } else if (r.state !== "unavailable" || r.reason !== "duration_exceeds_continuous_input" || !finite(r.longestContinuousSeconds) || r.longestContinuousSeconds >= request.durationSeconds || r.maxAveragePowerW !== null || r.windowStartElapsedSec !== null || r.windowEndElapsedSec !== null) invalid();
  }
  if (request.includeWeightNormalized) {
    const w = row.weightNormalized;
    if (!exact(w, ["unit", "basis", "state", "weightKg", "weightRevision", "computedAt", "maxAveragePowerWPerKg", "comparison"]) || w!.unit !== "W/kg" || w!.basis !== "calculation_profile_snapshot"
      || w!.weightRevision !== row.baseMetricsRevision || w!.computedAt !== null && (!count(w!.computedAt) || !Number.isFinite(new Date(w!.computedAt).getTime())) || !["available", "missing", "invalid", "incompatible"].includes(w!.state)) invalid();
    if (w!.state !== "available") { if (w!.weightKg !== null || w!.maxAveragePowerWPerKg !== null || w!.comparison !== null) invalid(); }
    else {
      if (!finite(w!.weightKg) || w!.weightKg! < 25 || w!.weightKg! > 250) invalid();
      if (row.state === "available") {
        if (!finite(w!.maxAveragePowerWPerKg) || w!.maxAveragePowerWPerKg !== row.result!.maxAveragePowerW! / w!.weightKg! || !exact(w!.comparison, ["numerator", "denominator"])
          || !equal(w!.comparison, exactPowerWeightRatio(row.comparison!.energyWattMilliseconds, row.comparison!.durationMilliseconds, w!.weightKg!))) invalid();
      } else if (w!.maxAveragePowerWPerKg !== null || w!.comparison !== null) invalid();
    }
  }
}
export function validateStagePowerHistoryCompute(value: StagePowerHistoryComputeResponse, request: StagePowerHistoryComputeRequest) {
  base(value, request);
  if (!exact(value, ["version", "mode", "scope", "unit", "durationSeconds", "periods", "periodIndex", "session", "candidates", "analysisCoverage", "costs", "enumerationState", "collectionCompleteness", "originalClockVerified"], ["includeWeightNormalized"])
    || value.scope !== "observed_explicit_history_candidates" || value.enumerationState !== "not_certified" || !Array.isArray(value.candidates) || value.candidates.length !== request.candidates.length
    || value.candidates.length < 1 || value.candidates.length > 2 || new Set(value.candidates.map(v => v.activityId)).size !== value.candidates.length) invalid();
  value.candidates.forEach(v => validComputed(v, request));
  const coverage = value.analysisCoverage;
  const verifyCounts = (v: Pick<typeof coverage, "inspectedActivityCount" | "computedActivityCount" | "missingSnapshotCount" | "noContinuousWindowCount">, rows: StagePowerHistoryComputedCandidate[]) => {
    if (![v.inspectedActivityCount, v.computedActivityCount, v.missingSnapshotCount, v.noContinuousWindowCount].every(count) || v.inspectedActivityCount !== rows.length
      || v.computedActivityCount !== rows.filter(r => r.state === "available").length || v.missingSnapshotCount !== rows.filter(r => r.reason === "snapshot_missing").length
      || v.noContinuousWindowCount !== rows.filter(r => r.reason === "no_continuous_window").length) invalid();
  };
  if (!exact(coverage, ["origins", "inspectedActivityCount", "computedActivityCount", "missingSnapshotCount", "noContinuousWindowCount"]) || !Array.isArray(coverage.origins) || coverage.origins.length !== 2) invalid();
  verifyCounts(coverage, value.candidates);
  for (const [i, origin] of (["measured", "stored_native_watts_unverified"] as const).entries()) {
    const c = coverage.origins[i]!, rows = value.candidates.filter(v => v.sourcePowerOrigin === origin);
    if (!exact(c, ["sourcePowerOrigin", "inspectedActivityCount", "computedActivityCount", "missingSnapshotCount", "noContinuousWindowCount"], request.includeWeightNormalized ? ["weightCounts"] : []) || c.sourcePowerOrigin !== origin) invalid();
    verifyCounts(c, rows);
    if (request.includeWeightNormalized) {
      const weights = c.weightCounts;
      if (!exact(weights, ["includedActivityCount", "missingWeightActivityCount", "invalidWeightActivityCount", "incompatibleWeightActivityCount"])) invalid();
      for (const [key, state] of [["includedActivityCount", "available"], ["missingWeightActivityCount", "missing"], ["invalidWeightActivityCount", "invalid"], ["incompatibleWeightActivityCount", "incompatible"]] as const) if (weights![key] !== rows.filter(r => r.weightNormalized?.state === state).length) invalid();
    }
  }
  if (!exact(value.costs, ["documents", "metadata", "snapshotBodies", "queries", "rawPayloads", "writes"]) || !count(value.costs.documents) || value.costs.documents > 128 || !count(value.costs.metadata) || value.costs.metadata > 4 || !count(value.costs.snapshotBodies) || value.costs.snapshotBodies > 2 || value.costs.queries !== 0 || value.costs.rawPayloads !== 0 || value.costs.writes !== 0) invalid();
  return value;
}
async function callable(services: FirebaseServices, uid: string, request: StagePowerHistoryPageRequest | StagePowerHistoryComputeRequest) {
  const matches = () => !!uid && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw Error("account_changed");
  if (!stageActivityPowerAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw Error("api_unavailable");
  if (!validStagePowerHistorySelection(request)) throw Error("invalid_history_request");
  if (request.mode === "stage_power_duration_history_compute") {
    if (!exact(request, ["mode", "unit", "durationSeconds", "periods", "periodIndex", "session", "candidates"], ["includeWeightNormalized"])
      || !validSession(request.session) || !Array.isArray(request.candidates) || request.candidates.length < 1 || request.candidates.length > 2
      || request.candidates.some(v => !validCandidate(v, request) || !stagePowerHistoryCandidateReady(v)) || new Set(request.candidates.map(v => v.activityId)).size !== request.candidates.length) throw Error("invalid_history_request");
  } else if (request.mode !== "stage_power_duration_history_page" || !exact(request, ["mode", "unit", "durationSeconds", "periods", "periodIndex"], ["includeWeightNormalized", "session", "cursor"])
    || request.session !== undefined && !validSession(request.session) || request.cursor !== undefined && (!request.session || !exact(request.cursor, ["after"]) || !exact(request.cursor.after, ["startTime", "activityId"]))) throw Error("invalid_history_request");
  await services.ensureAppCheckReady(); if (!matches()) throw Error("account_changed");
  const result = await httpsCallable(services.functions, "getPowerCurvePeriods")(request); if (!matches()) throw Error("account_changed");
  return result.data;
}
export async function loadStagePowerHistoryPage(services: FirebaseServices, uid: string, request: StagePowerHistoryPageRequest) { return validateStagePowerHistoryPage(await callable(services, uid, request) as StagePowerHistoryPageResponse, request); }
export async function computeStagePowerHistory(services: FirebaseServices, uid: string, request: StagePowerHistoryComputeRequest) { return validateStagePowerHistoryCompute(await callable(services, uid, request) as StagePowerHistoryComputeResponse, request); }
export const STAGE_POWER_HISTORY_MEMORY_LIMIT = LIMIT;
