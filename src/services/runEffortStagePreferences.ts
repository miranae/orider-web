import { httpsCallable } from "firebase/functions";
import { RUN_DISTANCE_TARGETS_V2 } from "@shared/types/personal-records";
import type { RunEffortStageMutationRequest, RunEffortStageMutationResponse, RunEffortStageOverlay, RunEffortTimeCorrection, RunEffortTimeSourceAuthority, StageTimeAdjustedRunEffortPeriod, StageTimeAdjustedRunEffort } from "@shared/types/run-effort-stage-preferences";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";

const revision = (value: unknown): value is string => typeof value === "string" && /^\d+:\d+$/u.test(value);
const activityId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const exactKeys = (value: object, keys: string[]) => Object.keys(value).sort().join(",") === keys.sort().join(",");
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
export function validReportedRunTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 604800 && value === Math.round(value * 1000) / 1000;
}
/** 시간 입력은 시:분:초 또는 분:초이며 선택적으로 소수 세 자리까지 허용한다. */
export function parseReportedRunTime(text: string): number | null {
  const match = /^(?:(\d{1,3}):)?([0-5]?\d):([0-5]\d)(?:\.(\d{1,3}))?$/u.exec(text.trim());
  if (!match) return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4] ?? "0"}`);
  return validReportedRunTime(seconds) ? seconds : null;
}
export function formatReportedRunTime(seconds: number): string {
  const ms = Math.round(seconds * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), sec = Math.floor(ms % 60000 / 1000), fraction = ms % 1000;
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(sec).padStart(2, "0")}${fraction ? `.${String(fraction).padStart(3, "0").replace(/0+$/u, "")}` : ""}`;
}
export function validRunEffortStageMutation(request: RunEffortStageMutationRequest) {
  if (!request || !activityId(request.activityId) || !RUN_DISTANCE_TARGETS_V2.includes(request.target)
    || !integer(request.expectedPreferenceRevision) || request.expectedPreferenceRevision >= Number.MAX_SAFE_INTEGER
    || !revision(request.expectedMetricsRevision) || !revision(request.expectedActivityIncarnation)
    || typeof request.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,100}$/u.test(request.idempotencyKey)) return false;
  const common = ["activityId", "target", "expectedPreferenceRevision", "expectedMetricsRevision", "expectedActivityIncarnation", "idempotencyKey"];
  if (!("action" in request)) return typeof request.excluded === "boolean"
    && (request.expectedDerivedRevision === undefined || digest(request.expectedDerivedRevision))
    && exactKeys(request, [...common, "excluded", ...(Object.prototype.hasOwnProperty.call(request, "expectedDerivedRevision") ? ["expectedDerivedRevision"] : [])]);
  if (request.action === "clear_time") return exactKeys(request, [...common, "action"]);
  return request.action === "set_time" && validReportedRunTime(request.reportedElapsedSeconds) && digest(request.expectedSourceAuthorityRevision)
    && (request.expectedDerivedRevision === undefined || digest(request.expectedDerivedRevision))
    && (request.reportedKind === undefined || request.reportedKind === "chip_time" || request.reportedKind === "timing_correction")
    && exactKeys(request, [...common, "action", "reportedElapsedSeconds", "expectedSourceAuthorityRevision", ...(Object.prototype.hasOwnProperty.call(request, "expectedDerivedRevision") ? ["expectedDerivedRevision"] : []), ...(Object.prototype.hasOwnProperty.call(request, "reportedKind") ? ["reportedKind"] : [])]);
}
export function validRunTimeSourceAuthority(value: unknown): value is RunEffortTimeSourceAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as RunEffortTimeSourceAuthority, derived = a.basis === "stage_distance_snapshot";
  return exactKeys(a, ["version", "basis", "timingBasis", "activityId", "activityIncarnation", "activityRevision", "metricsRevision", "target", "originalElapsedSeconds", ...(derived ? ["derivedRevision"] : [])])
    && a.version === 1 && activityId(a.activityId) && revision(a.activityIncarnation) && revision(a.activityRevision) && revision(a.metricsRevision)
    && RUN_DISTANCE_TARGETS_V2.includes(a.target) && typeof a.originalElapsedSeconds === "number" && Number.isFinite(a.originalElapsedSeconds) && a.originalElapsedSeconds > 0
    && (derived ? ["stage_derived_from_stored_elapsed_axis", "stored_activity_wall_clock_window"].includes(a.timingBasis) && digest(a.derivedRevision)
      : a.basis === "canonical_producer_elapsed_axis_v2" && a.timingBasis === "elapsed_including_stops" && Number.isSafeInteger(a.originalElapsedSeconds));
}
export function validRunTimeCorrection(value: unknown): value is RunEffortTimeCorrection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as RunEffortTimeCorrection;
  return exactKeys(c, ["reportedElapsedSeconds", "reportedAtEpochMs", "provenance", "sourceAuthorityRevision", "sourceAuthority", ...(Object.prototype.hasOwnProperty.call(c, "reportedKind") ? ["reportedKind"] : [])])
    && validReportedRunTime(c.reportedElapsedSeconds) && c.provenance === "owner_reported" && integer(c.reportedAtEpochMs) && c.reportedAtEpochMs > 0
    && Number.isFinite(new Date(c.reportedAtEpochMs).getTime()) && digest(c.sourceAuthorityRevision) && validRunTimeSourceAuthority(c.sourceAuthority)
    && (!Object.prototype.hasOwnProperty.call(c, "reportedKind") || c.reportedKind === "chip_time" || c.reportedKind === "timing_correction");
}
async function authorityDigest(a: RunEffortTimeSourceAuthority) {
  const bytes = new TextEncoder().encode(JSON.stringify([a.version, a.basis, a.timingBasis, a.activityId, a.activityIncarnation, a.activityRevision,
    a.metricsRevision, a.target, a.originalElapsedSeconds, a.derivedRevision ?? null]));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
}
export async function verifyRunTimeCorrectionDigest(correction: RunEffortTimeCorrection) {
  if (!validRunTimeCorrection(correction) || await authorityDigest(correction.sourceAuthority) !== correction.sourceAuthorityRevision) throw new Error("invalid_run_effort_time_source_digest");
}
export async function verifyRunTimeResponseDigests(response: TrainingAnalysisPeriodsResponse) {
  for (const period of response.periods) {
    for (const effort of period.stageTimeAdjustedEfforts?.efforts ?? []) {
      if (await authorityDigest(effort.sourceAuthority) !== effort.sourceAuthorityRevision) throw new Error("invalid_run_effort_time_source_digest");
      if (effort.timeCorrection) await verifyRunTimeCorrectionDigest(effort.timeCorrection);
    }
    for (const orphan of period.stageTimeAdjustedEfforts?.orphanedCorrections ?? []) await verifyRunTimeCorrectionDigest(orphan.timeCorrection);
  }
}

export function validRunEffortStageOverlay(value: unknown, expectedCandidateCount: number): value is RunEffortStageOverlay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const overlay = value as RunEffortStageOverlay;
  if (overlay.version !== 1 || overlay.scope !== "stage_readtime_overlay" || overlay.selectionBasis !== "observed_period_representatives"
    || overlay.aliasPolicy !== "selected_activity_incarnation_only" || overlay.globalRecords !== "unchanged"
    || overlay.checkedActivityCount !== expectedCandidateCount || !integer(overlay.checkedActivityCount) || overlay.checkedActivityCount > 200
    || !Array.isArray(overlay.preferenceBindings) || overlay.preferenceBindings.length !== expectedCandidateCount) return false;
  const seen = new Set<string>();
  for (const binding of overlay.preferenceBindings) {
    if (!binding || !activityId(binding.activityId) || seen.has(binding.activityId) || !revision(binding.activityIncarnation)
      || !integer(binding.preferenceRevision) || binding.metricsRevision !== null && !revision(binding.metricsRevision)
      || binding.derivedRevision !== undefined && (typeof binding.derivedRevision !== "string" || !/^[a-f0-9]{64}$/u.test(binding.derivedRevision))
      || typeof binding.mutationReady !== "boolean" || binding.mutationReady && binding.metricsRevision === null
      || !Array.isArray(binding.excludedTargets) || binding.excludedTargets.length > RUN_DISTANCE_TARGETS_V2.length
      || new Set(binding.excludedTargets).size !== binding.excludedTargets.length || !binding.excludedTargets.every(target => RUN_DISTANCE_TARGETS_V2.includes(target))) return false;
    seen.add(binding.activityId);
  }
  return true;
}
/** 이 서버 응답의 범위와 각 소스 binding이 있어야 선택 UI를 연다. 로컬 flag는 쓰기 권한이 아니다. */
export function runEffortStageOverlaySupported(response: TrainingAnalysisPeriodsResponse) {
  return response.discipline === "run" && response.periods.length > 0 && response.periods.every(period => period.running?.expandedDistanceAnalysis !== undefined && validRunEffortStageOverlay(period.running?.stageEffortOverlay, period.coverage.candidateActivityCount));
}
/** 서버가 검증한 선택 활동의 분리 채널만 허용한다. 과거 수정으로 현재 관측을 만들지 않는다. */
export function validStageTimeAdjustedEfforts(value: unknown, period: TrainingAnalysisPeriodsResponse["periods"][number], request: import("@shared/types/training-analysis-periods").TrainingAnalysisPeriodsRequest): value is StageTimeAdjustedRunEffortPeriod {
  if (!request.includeStageRunTimeCorrections || !request.stageRunTimeCorrectionActivityIds || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const channel = value as StageTimeAdjustedRunEffortPeriod, selectedId = request.stageRunTimeCorrectionActivityIds[0];
  if (!exactKeys(channel, ["version", "scope", "sourceMode", "sourceAvailability", "selected", "efforts", "orphanedCorrections", "globalRecords"])
    || channel.version !== 1 || channel.scope !== "explicit_selected_activity" || channel.globalRecords !== "unchanged"
    || channel.sourceMode !== (request.stageRunDistanceSnapshotActivityIds ? "explicit_stage_snapshot" : "canonical_observed")
    || !["observed", "no_observed_targets", "unavailable"].includes(channel.sourceAvailability)
    || !Array.isArray(channel.efforts) || !Array.isArray(channel.orphanedCorrections) || channel.efforts.length + channel.orphanedCorrections.length > 14) return false;
  const binding = period.running?.stageEffortOverlay?.preferenceBindings.find(row => row.activityId === selectedId);
  if (channel.selected === null) return !binding && !channel.efforts.length && !channel.orphanedCorrections.length && channel.sourceAvailability === "unavailable";
  const selected = channel.selected;
  if (!binding || !selected || !exactKeys(selected, ["activityId", "startTime", "activityIncarnation", "metricsRevision", "preferenceRevision", "clearReady"])
    || selected.activityId !== selectedId || selected.activityIncarnation !== binding.activityIncarnation || selected.metricsRevision !== binding.metricsRevision
    || selected.preferenceRevision !== binding.preferenceRevision || selected.clearReady !== binding.mutationReady
    || !integer(selected.startTime) || !Number.isFinite(new Date(selected.startTime).getTime()) || selected.startTime < period.fromInclusive || selected.startTime >= period.toExclusive
    || selected.clearReady && selected.metricsRevision === null || !selected.clearReady && channel.efforts.length > 0) return false;
  const activity = period.activities.find(row => row.activityId === selectedId);
  if (activity && activity.startTime !== selected.startTime) return false;
  const seen = new Set<string>();
  const sameSource = (a: RunEffortTimeSourceAuthority) => a.activityId === selectedId && a.activityIncarnation === selected.activityIncarnation;
  for (const effort of channel.efforts) {
    if (!effort || !exactKeys(effort, ["version", "scope", "sourceAuthority", "sourceAuthorityRevision", "originalElapsedSeconds", "excluded", "effectiveElapsedSeconds", "correctionStatus", "timeCorrection", "originalClockVerified", "globalRecords", ...(Object.prototype.hasOwnProperty.call(effort, "originalAnchor") ? ["originalAnchor"] : [])])
      || effort.version !== 1 || effort.scope !== "stage_user_reported_time" || effort.originalClockVerified !== false || effort.globalRecords !== "unchanged"
      || !validRunTimeSourceAuthority(effort.sourceAuthority) || !sameSource(effort.sourceAuthority) || seen.has(effort.sourceAuthority.target)
      || !digest(effort.sourceAuthorityRevision) || effort.sourceAuthority.metricsRevision !== selected.metricsRevision
      || effort.originalElapsedSeconds !== effort.sourceAuthority.originalElapsedSeconds || typeof effort.excluded !== "boolean"
      || effort.excluded !== binding.excludedTargets.includes(effort.sourceAuthority.target)
      || !["none", "applied", "source_changed"].includes(effort.correctionStatus)) return false;
    const derived = channel.sourceMode === "explicit_stage_snapshot";
    if (derived ? effort.sourceAuthority.basis !== "stage_distance_snapshot" || effort.sourceAuthority.derivedRevision !== binding.derivedRevision
      || !validRunTimeAnchor(effort.originalAnchor, effort.originalElapsedSeconds) : effort.sourceAuthority.basis !== "canonical_producer_elapsed_axis_v2" || Object.prototype.hasOwnProperty.call(effort, "originalAnchor")) return false;
    if (derived) {
      const source = period.stageDerivedRunDistances?.sources.find(row => row.activityId === selectedId && row.derivedRevision === effort.sourceAuthority.derivedRevision);
      const anchor = source?.records[effort.sourceAuthority.target];
      if (!source || !anchor || Object.keys(anchor).some(key => anchor[key as keyof typeof anchor] !== effort.originalAnchor?.[key as keyof typeof anchor])
        || effort.sourceAuthority.timingBasis !== (source.timeBasis ?? "stage_derived_from_stored_elapsed_axis")) return false;
    }
    const correction = effort.timeCorrection;
    if (correction !== null && (!validRunTimeCorrection(correction) || !sameSource(correction.sourceAuthority) || correction.sourceAuthority.target !== effort.sourceAuthority.target)) return false;
    const expectedStatus = correction ? correction.sourceAuthorityRevision === effort.sourceAuthorityRevision ? "applied" : "source_changed" : "none";
    if (effort.correctionStatus !== expectedStatus || effort.effectiveElapsedSeconds !== (effort.excluded || expectedStatus === "source_changed" ? null : correction?.reportedElapsedSeconds ?? effort.originalElapsedSeconds)) return false;
    seen.add(effort.sourceAuthority.target);
  }
  for (const orphan of channel.orphanedCorrections) {
    if (!orphan || !exactKeys(orphan, ["target", "status", "timeCorrection", "effectiveElapsedSeconds", "clearBinding"])
      || !RUN_DISTANCE_TARGETS_V2.includes(orphan.target) || seen.has(orphan.target) || orphan.status !== "source_missing" || orphan.effectiveElapsedSeconds !== null
      || !validRunTimeCorrection(orphan.timeCorrection) || !sameSource(orphan.timeCorrection.sourceAuthority) || orphan.timeCorrection.sourceAuthority.target !== orphan.target) return false;
    const clear = orphan.clearBinding;
    if (selected.clearReady ? !clear || !exactKeys(clear, ["activityId", "target", "expectedPreferenceRevision", "expectedMetricsRevision", "expectedActivityIncarnation"])
      || clear.activityId !== selectedId || clear.target !== orphan.target || clear.expectedPreferenceRevision !== selected.preferenceRevision
      || clear.expectedMetricsRevision !== selected.metricsRevision || clear.expectedActivityIncarnation !== selected.activityIncarnation : clear !== null) return false;
    seen.add(orphan.target);
  }
  return (channel.sourceAvailability === "observed") === (channel.efforts.length > 0);
}
function validRunTimeAnchor(value: StageTimeAdjustedRunEffort["originalAnchor"], original: number) {
  return !!value && exactKeys(value, ["elapsedSec", "exactElapsedSec", "startIndex", "endBeforeIndex", "endIndex", "endFraction", "startTimeSec", "endTimeSec"])
    && integer(value.elapsedSec) && value.elapsedSec > 0 && value.elapsedSec === Math.round(original) && value.exactElapsedSec === original
    && integer(value.startIndex) && integer(value.endBeforeIndex) && integer(value.endIndex) && value.endIndex > value.startIndex && value.endBeforeIndex === value.endIndex - 1
    && typeof value.endFraction === "number" && Number.isFinite(value.endFraction) && value.endFraction >= 0 && value.endFraction <= 1
    && Number.isFinite(value.startTimeSec) && value.startTimeSec >= 0 && Number.isFinite(value.endTimeSec) && value.endTimeSec > value.startTimeSec
    && Math.abs(value.endTimeSec - value.startTimeSec - original) <= 1e-8;
}
export interface RunEffortStageFailure {
  kind: "source_unverified" | "source_changed" | "rejected" | "unknown";
  storedOutcome: "stored_pending_analysis_refresh" | null;
}
export function runEffortStageFailure(error: unknown): RunEffortStageFailure {
  const value = error && typeof error === "object" ? error as { code?: unknown; details?: unknown } : {};
  const details = value.details && typeof value.details === "object" ? value.details as { reason?: unknown; storedOutcome?: unknown } : {};
  const storedOutcome = details.storedOutcome === "stored_pending_analysis_refresh" ? details.storedOutcome : null;
  if (storedOutcome && details.reason === "source_unverified_after_stage_write") return { kind: "source_unverified", storedOutcome };
  if (storedOutcome && details.reason === "source_changed_after_stage_write") return { kind: "source_changed", storedOutcome };
  return { kind: typeof value.code === "string" && ["invalid-argument", "permission-denied", "unauthenticated", "not-found", "already-exists", "failed-precondition"].some(code => value.code === code || value.code === `functions/${code}`) ? "rejected" : "unknown", storedOutcome };
}
export function validateRunEffortStageMutationResponse(response: RunEffortStageMutationResponse, request: RunEffortStageMutationRequest) {
  const invalid = () => { throw new Error("invalid_run_effort_stage_mutation_response"); };
  const timeAction = "action" in request;
  if (!response || response.version !== 1 || response.scope !== "stage_readtime_overlay" || response.outcome !== "stored_pending_analysis_refresh"
    || response.activityId !== request.activityId || response.activityIncarnation !== request.expectedActivityIncarnation
    || response.target !== request.target || !integer(response.preferenceRevision) || response.preferenceRevision !== request.expectedPreferenceRevision + 1) invalid();
  if (!timeAction) {
    if (!("excluded" in response) || response.excluded !== request.excluded) invalid();
    return response;
  }
  if (!("action" in response) || response.action !== request.action || !exactKeys(response, ["version", "scope", "outcome", "activityId", "activityIncarnation", "preferenceRevision", "target", "action", "timeCorrection"])) invalid();
  if ("action" in response) {
    if (request.action === "clear_time") { if (response.timeCorrection !== null) invalid(); }
    else {
      const c = response.timeCorrection;
      if (!validRunTimeCorrection(c) || c.reportedElapsedSeconds !== request.reportedElapsedSeconds || c.reportedKind !== request.reportedKind
        || c.sourceAuthorityRevision !== request.expectedSourceAuthorityRevision || c.sourceAuthority.activityId !== request.activityId
        || c.sourceAuthority.activityIncarnation !== request.expectedActivityIncarnation || c.sourceAuthority.metricsRevision !== request.expectedMetricsRevision
        || c.sourceAuthority.target !== request.target || c.sourceAuthority.derivedRevision !== request.expectedDerivedRevision) invalid();
    }
  }
  return response;
}
export async function setRunEffortStagePreference(services: FirebaseServices, ownerUid: string, request: RunEffortStageMutationRequest) {
  const matches = () => !!ownerUid && services.auth.currentUser?.uid === ownerUid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  const config = getRuntimeConfig();
  if (config.appEnvironment !== "stage" || config.firebaseFunctionsBase !== "https://asia-northeast3-orider-dev.cloudfunctions.net" || services.functions.app !== services.auth.app
    || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("api_unavailable");
  if (!validRunEffortStageMutation(request)) throw new Error("invalid_run_effort_stage_mutation_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const result = await httpsCallable<RunEffortStageMutationRequest, RunEffortStageMutationResponse>(services.functions, "setStageRunEffortPreference")(request);
  if (!matches()) throw new Error("account_changed");
  const response = validateRunEffortStageMutationResponse(result.data, request);
  if ("action" in response && response.timeCorrection) await verifyRunTimeCorrectionDigest(response.timeCorrection);
  if (!matches()) throw new Error("account_changed");
  return response;
}
