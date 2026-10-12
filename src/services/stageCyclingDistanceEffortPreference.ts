import { httpsCallable } from "firebase/functions";
import { BIKE_DISTANCE_TARGETS, type BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { StageCyclingDistanceEffortPreferenceReadResponse as ReadResponse } from "@shared/types/stage-cycling-distance-effort-preference-reader";
import type { StageCyclingDistanceEffortPreferenceRequest as WriteRequest, StageCyclingDistanceEffortPreferenceResponse as WriteResponse } from "@shared/types/stage-cycling-distance-effort-preferences";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { stageActivityPowerAvailable } from "./stageActivityPowerDuration";
export const stageCyclingPreferenceAvailable = stageActivityPowerAvailable;
export const validCyclingPreferenceId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(id);
const exact = (v: unknown, names: string[]) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...names].sort().join(",");
const revision = (v: unknown) => typeof v === "string" && /^(0|[1-9]\d{0,11}):(0|[1-9]\d{0,8})$/u.test(v) && Number(v.split(":")[1]) < 1e9;
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER;
const elapsed = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const invalid = (): never => { throw new Error("invalid_cycling_preference_response"); };
export function validateCyclingPreferenceRead(v: ReadResponse, activityId: string) {
  if (!validCyclingPreferenceId(activityId) || !exact(v, ["version", "scope", "activityId", "activityIncarnation", "activityRevision", "metricsRevision", "preferenceRevision", "excludedTargets", "observationState", "provenance", "originalClockVerified", "quality", "coverage", "globalRecords", "aggregateEffect", "readTimes", "efforts"])
    || v.version !== 1 || v.scope !== "explicit_selected_activity" || v.activityId !== activityId || !revision(v.activityIncarnation) || !revision(v.activityRevision) || !revision(v.metricsRevision) || !count(v.preferenceRevision)
    || !["observed", "no_observed_efforts", "legacy_unsupported", "unavailable"].includes(v.observationState) || v.originalClockVerified !== false || v.quality !== "unknown" || v.coverage !== "unknown" || v.globalRecords !== "unchanged" || v.aggregateEffect !== "not_applied"
    || !Array.isArray(v.excludedTargets) || v.excludedTargets.length > BIKE_DISTANCE_TARGETS.length
    || Array.from({ length: v.excludedTargets.length }, (_, i) => i).some(i => !Object.prototype.hasOwnProperty.call(v.excludedTargets, i) || typeof v.excludedTargets[i] !== "string" || !BIKE_DISTANCE_TARGETS.includes(v.excludedTargets[i]!))
    || new Set(v.excludedTargets).size !== v.excludedTargets.length || v.excludedTargets.join(",") !== BIKE_DISTANCE_TARGETS.filter(t => v.excludedTargets.includes(t)).join(",") || !exact(v.readTimes, ["source", "preference"])) invalid();
  for (const time of [v.readTimes.source, v.readTimes.preference]) if (!exact(time, ["seconds", "nanoseconds"]) || !Number.isSafeInteger(time.seconds) || !Number.isInteger(time.nanoseconds) || time.nanoseconds < 0 || time.nanoseconds >= 1e9) invalid();
  if (v.provenance !== null && (!exact(v.provenance, ["provenanceVersion", "sourceBasis", "timingBasis", "originalClockVerified", "declaredActivitySource", "status"]) || v.provenance.provenanceVersion !== 2 || v.provenance.sourceBasis !== "stored_distance_parts" || v.provenance.timingBasis !== "stored_explicit_activity_elapsed" || v.provenance.originalClockVerified !== false || !["stored_explicit", "legacy_normalized"].includes(v.provenance.status) || ![null, "orider", "strava", "apple_health", "health_connect"].includes(v.provenance.declaredActivitySource))) invalid();
  if ((v.provenance !== null) !== ["observed", "no_observed_efforts"].includes(v.observationState)) invalid();
  if (!Array.isArray(v.efforts) || v.efforts.length !== BIKE_DISTANCE_TARGETS.length) invalid();
  for (const [i, row] of v.efforts.entries()) {
    if (!exact(row, ["target", "originalElapsedSeconds", "excluded", "effectiveElapsedSeconds", "sourceStatus", "excludeBinding", "restoreBinding"]) || row.target !== BIKE_DISTANCE_TARGETS[i] || row.excluded !== v.excludedTargets.includes(row.target)
      || !["observed", "source_missing", "source_unavailable"].includes(row.sourceStatus) || (row.sourceStatus === "observed" ? !elapsed(row.originalElapsedSeconds) || v.observationState !== "observed" : row.originalElapsedSeconds !== null)
      || (row.sourceStatus === "source_unavailable") !== (v.observationState === "unavailable")
      || row.effectiveElapsedSeconds !== (row.excluded ? null : row.originalElapsedSeconds)) invalid();
    const binding = row.excluded ? row.restoreBinding : row.excludeBinding;
    if (row.excluded ? row.excludeBinding !== null || !binding : row.restoreBinding !== null || (row.sourceStatus === "observed" ? !binding : binding !== null)) invalid();
    if (binding && (!exact(binding, ["activityId", "target", "expectedPreferenceRevision", "expectedActivityIncarnation", "expectedActivityRevision", "expectedMetricsRevision", "excluded", "expectedSourceAuthorityRevision"])
      || binding.activityId !== activityId || binding.target !== row.target || binding.expectedPreferenceRevision !== v.preferenceRevision || binding.expectedActivityIncarnation !== v.activityIncarnation || binding.expectedActivityRevision !== v.activityRevision || binding.expectedMetricsRevision !== v.metricsRevision || binding.excluded !== !row.excluded
      || (binding.excluded ? typeof binding.expectedSourceAuthorityRevision !== "string" || !/^[a-f0-9]{64}$/u.test(binding.expectedSourceAuthorityRevision) : binding.expectedSourceAuthorityRevision !== null))) invalid();
  }
  if (v.efforts.some(row => row.sourceStatus === "observed") !== (v.observationState === "observed")) invalid();
  return v;
}
export function cyclingPreferenceWriteRequest(read: ReadResponse, target: BikeDistanceKey, idempotencyKey: string): WriteRequest {
  validateCyclingPreferenceRead(read, read.activityId);
  const row = read.efforts.find(v => v.target === target), binding = row?.excluded ? row.restoreBinding : row?.excludeBinding;
  if (!binding) return invalid();
  if (!/^[A-Za-z0-9_-]{16,100}$/u.test(idempotencyKey)) return invalid();
  return { ...binding, idempotencyKey };
}
export function validateCyclingPreferenceWrite(v: WriteResponse, request: WriteRequest) {
  if (!exact(v, ["version", "scope", "outcome", "activityId", "activityIncarnation", "preferenceRevision", "target", "excluded", "globalRecords"]) || v.version !== 1 || v.scope !== "stage_cycling_distance_readtime_overlay" || v.outcome !== "stored_pending_analysis_refresh" || v.activityId !== request.activityId || v.activityIncarnation !== request.expectedActivityIncarnation || v.preferenceRevision !== request.expectedPreferenceRevision + 1 || v.target !== request.target || v.excluded !== request.excluded || v.globalRecords !== "unchanged") invalid();
  return v;
}
async function call(services: FirebaseServices, uid: string, name: string, request: object) {
  const matches = () => services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!uid || !matches()) throw new Error("account_changed");
  if (!stageCyclingPreferenceAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("api_unavailable");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const result = await httpsCallable(services.functions, name)(request);
  if (!matches()) throw new Error("account_changed");
  return result.data;
}
export async function loadCyclingPreference(services: FirebaseServices, uid: string, activityId: string) {
  if (!validCyclingPreferenceId(activityId)) invalid();
  return validateCyclingPreferenceRead(await call(services, uid, "getStageCyclingDistanceEffortPreference", { version: 1, activityId }) as ReadResponse, activityId);
}
export async function saveCyclingPreference(services: FirebaseServices, uid: string, read: ReadResponse, target: BikeDistanceKey, idempotencyKey: string) {
  const request = cyclingPreferenceWriteRequest(read, target, idempotencyKey);
  return validateCyclingPreferenceWrite(await call(services, uid, "setStageCyclingDistanceEffortPreference", request) as WriteResponse, request);
}
