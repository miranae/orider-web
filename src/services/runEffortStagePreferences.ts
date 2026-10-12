import { httpsCallable } from "firebase/functions";
import { RUN_DISTANCE_TARGETS_V2 } from "@shared/types/personal-records";
import type { RunEffortStageMutationRequest, RunEffortStageMutationResponse, RunEffortStageOverlay } from "@shared/types/run-effort-stage-preferences";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";

const revision = (value: unknown): value is string => typeof value === "string" && /^\d+:\d+$/u.test(value);
const activityId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export function validRunEffortStageMutation(request: RunEffortStageMutationRequest) {
  return !!request && activityId(request.activityId) && RUN_DISTANCE_TARGETS_V2.includes(request.target) && typeof request.excluded === "boolean"
    && integer(request.expectedPreferenceRevision) && request.expectedPreferenceRevision < Number.MAX_SAFE_INTEGER && revision(request.expectedMetricsRevision) && revision(request.expectedActivityIncarnation)
    && typeof request.idempotencyKey === "string" && /^[A-Za-z0-9_-]{16,100}$/u.test(request.idempotencyKey)
    && (request.expectedDerivedRevision === undefined || typeof request.expectedDerivedRevision === "string" && /^[a-f0-9]{64}$/u.test(request.expectedDerivedRevision))
    && Object.keys(request).filter(key => key !== "expectedDerivedRevision").sort().join(",") === ["activityId", "target", "excluded", "expectedPreferenceRevision", "expectedMetricsRevision", "expectedActivityIncarnation", "idempotencyKey"].sort().join(",");
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
  if (!response || response.version !== 1 || response.scope !== "stage_readtime_overlay" || response.outcome !== "stored_pending_analysis_refresh"
    || response.activityId !== request.activityId || response.activityIncarnation !== request.expectedActivityIncarnation
    || response.target !== request.target || response.excluded !== request.excluded || !integer(response.preferenceRevision)
    || response.preferenceRevision !== request.expectedPreferenceRevision + 1) throw new Error("invalid_run_effort_stage_mutation_response");
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
  return validateRunEffortStageMutationResponse(result.data, request);
}
