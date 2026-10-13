import { httpsCallable } from "firebase/functions";
import { onIdTokenChanged } from "firebase/auth";
import { BIKE_DISTANCE_TARGETS, type BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { CyclingSnapshotReadResponse as Read, CyclingSnapshotMutationRequest as Request, CyclingSnapshotMutationResponse as Response, CyclingSnapshotBinding } from "@shared/types/stage-cycling-snapshot-effort-preferences";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { stageCyclingPreferenceAvailable, validCyclingPreferenceId } from "./stageCyclingDistanceEffortPreference";
const exact = (v: unknown, keys: string[]) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...keys].sort().join(",");
const digest = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const stamp = (v: unknown) => typeof v === "string" && /^(0|[1-9]\d{0,11}):(0|[1-9]\d{0,8})$/u.test(v) && Number(v.split(":")[1]) < 1e9;
const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER;
const positive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
const invalid = (): never => { throw new Error("invalid_cycling_snapshot_response"); };
function binding(v: CyclingSnapshotBinding) {
  return exact(v, ["exists", "createTime", "updateTime", "contentHash", "derivedRevision"]) && digest(v.contentHash) && (v.exists === true ? stamp(v.createTime) && stamp(v.updateTime) && digest(v.derivedRevision) : v.exists === false && v.createTime === "missing" && v.updateTime === "missing" && v.derivedRevision === null);
}
function sameBinding(a: CyclingSnapshotBinding, b: CyclingSnapshotBinding) { return ["exists", "createTime", "updateTime", "contentHash", "derivedRevision"].every(k => a[k as keyof CyclingSnapshotBinding] === b[k as keyof CyclingSnapshotBinding]); }
export function validateCyclingSnapshotRead(v: Read, activityId: string) {
  if (!validCyclingPreferenceId(activityId) || !exact(v, ["version", "scope", "sourceBasis", "activityId", "activityIncarnation", "sourceRevision", "preferenceRevision", "excludedTargets", "canonicalMetricObservationState", "snapshotState", "snapshotBinding", "provenance", "globalRecords", "aggregateEffect", "readTimes", "efforts"])
    || v.version !== 1 || v.scope !== "explicit_selected_stage_snapshot" || v.sourceBasis !== "stage_snapshot_v1" || v.activityId !== activityId || !stamp(v.activityIncarnation) || !digest(v.sourceRevision) || !count(v.preferenceRevision)
    || !["observed", "no_observed_efforts", "legacy_unsupported", "unavailable"].includes(v.canonicalMetricObservationState) || !["missing", "current", "no_observed_efforts"].includes(v.snapshotState)
    || !binding(v.snapshotBinding) || v.snapshotBinding.exists !== (v.snapshotState !== "missing") || v.globalRecords !== "unchanged" || v.aggregateEffect !== "not_applied"
    || !Array.isArray(v.excludedTargets) || v.excludedTargets.length > 13 || Array.from({ length: v.excludedTargets.length }, (_, i) => i).some(i => !Object.prototype.hasOwnProperty.call(v.excludedTargets, i) || !BIKE_DISTANCE_TARGETS.includes(v.excludedTargets[i]!))
    || new Set(v.excludedTargets).size !== v.excludedTargets.length || v.excludedTargets.join(",") !== BIKE_DISTANCE_TARGETS.filter(t => v.excludedTargets.includes(t)).join(",") || !exact(v.readTimes, ["source", "stage"])) invalid();
  for (const time of [v.readTimes.source, v.readTimes.stage]) if (!exact(time, ["seconds", "nanoseconds"]) || !count(time.seconds) || !count(time.nanoseconds) || time.nanoseconds >= 1e9) invalid();
  if ((v.provenance !== null) !== v.snapshotBinding.exists) invalid();
  if (v.provenance) {
    const p = v.provenance, keys = ["basis", "originalClockVerified", "quality", "coverage", "targetsVersion", "declaredActivitySource", ...(Object.prototype.hasOwnProperty.call(p, "timeBasis") ? ["timeBasis"] : []), ...(Object.prototype.hasOwnProperty.call(p, "qualification") ? ["qualification", "manifestObjectIncarnationVerified"] : [])];
    if (!exact(p, keys) || p.basis !== "stage_derived_from_stored_elapsed_axis" || p.originalClockVerified !== false || p.quality !== "unknown" || p.coverage !== "unknown" || p.targetsVersion !== 1 || p.declaredActivitySource !== "orider"
      || Object.prototype.hasOwnProperty.call(p, "timeBasis") && p.timeBasis !== "stored_activity_wall_clock_window" || Object.prototype.hasOwnProperty.call(p, "qualification") && (p.qualification !== "legacy_manifest_revision_and_gcs_token_pinned" || p.manifestObjectIncarnationVerified !== false)) invalid();
  }
  if (!Array.isArray(v.efforts) || v.efforts.length !== 13) invalid();
  for (const [i, row] of v.efforts.entries()) {
    if (!exact(row, ["target", "originalElapsedSeconds", "exactElapsedSeconds", "effectiveElapsedSeconds", "excluded", "excludeBinding", "restoreBinding"]) || row.target !== BIKE_DISTANCE_TARGETS[i] || row.excluded !== v.excludedTargets.includes(row.target)
      || (row.originalElapsedSeconds === null ? row.exactElapsedSeconds !== null : !positive(row.originalElapsedSeconds) || !Number.isSafeInteger(row.originalElapsedSeconds) || !positive(row.exactElapsedSeconds) || Math.round(row.exactElapsedSeconds!) !== row.originalElapsedSeconds)
      || row.effectiveElapsedSeconds !== (row.excluded ? null : row.originalElapsedSeconds) || row.originalElapsedSeconds !== null && v.snapshotState !== "current") invalid();
    const b = row.excluded ? row.restoreBinding : row.excludeBinding;
    if (row.excluded ? row.excludeBinding !== null || !b : row.restoreBinding !== null || (row.originalElapsedSeconds !== null ? !b : b !== null)) invalid();
    if (b && (!exact(b, ["version", "sourceBasis", "activityId", "target", "excluded", "expectedPreferenceRevision", "expectedActivityIncarnation", "expectedSourceRevision", "expectedSnapshotBinding", "expectedSourceAuthorityRevision"])
      || b.version !== 1 || b.sourceBasis !== "stage_snapshot_v1" || b.activityId !== activityId || b.target !== row.target || b.excluded !== !row.excluded || b.expectedPreferenceRevision !== v.preferenceRevision || b.expectedActivityIncarnation !== v.activityIncarnation || b.expectedSourceRevision !== v.sourceRevision
      || !binding(b.expectedSnapshotBinding) || !sameBinding(b.expectedSnapshotBinding, v.snapshotBinding) || (b.excluded ? !digest(b.expectedSourceAuthorityRevision) : b.expectedSourceAuthorityRevision !== null))) invalid();
  }
  if (v.efforts.some(row => row.originalElapsedSeconds !== null) !== (v.snapshotState === "current")) invalid();
  return v;
}
export function cyclingSnapshotWriteRequest(read: Read, target: BikeDistanceKey, idempotencyKey: string): Request {
  validateCyclingSnapshotRead(read, read.activityId);
  const row = read.efforts.find(v => v.target === target), b = row?.excluded ? row.restoreBinding : row?.excludeBinding;
  if (!b || !/^[A-Za-z0-9_-]{16,100}$/u.test(idempotencyKey)) return invalid();
  return { ...b, idempotencyKey };
}
export function validateCyclingSnapshotWrite(v: Response, request: Request) {
  if (!exact(v, ["version", "scope", "outcome", "activityId", "activityIncarnation", "preferenceRevision", "target", "excluded", "globalRecords", "aggregateEffect"]) || v.version !== 1 || v.scope !== "explicit_selected_stage_snapshot" || v.outcome !== "stored_pending_analysis_refresh" || v.activityId !== request.activityId || v.activityIncarnation !== request.expectedActivityIncarnation || v.preferenceRevision !== request.expectedPreferenceRevision + 1 || v.target !== request.target || v.excluded !== request.excluded || v.globalRecords !== "unchanged" || v.aggregateEffect !== "not_applied") invalid();
  return v;
}
async function call(services: FirebaseServices, uid: string, name: string, request: object) {
  const original = services.auth.currentUser;
  let changed = false, observed = false;
  const matches = () => !changed && original === services.auth.currentUser && original?.uid === uid && !original.isAnonymous;
  if (!uid || !matches()) throw new Error("account_changed");
  if (!stageCyclingPreferenceAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("api_unavailable");
  const unsubscribe = onIdTokenChanged(services.auth, user => { if (observed || user !== original) changed = true; observed = true; });
  try {
    await services.ensureAppCheckReady(); if (!matches()) throw new Error("account_changed");
    const result = await httpsCallable(services.functions, name)(request);
    if (!matches()) throw new Error("account_changed");
    return result.data;
  } finally { unsubscribe(); }
}
export async function loadCyclingSnapshotPreference(services: FirebaseServices, uid: string, activityId: string) {
  if (!validCyclingPreferenceId(activityId)) invalid();
  return validateCyclingSnapshotRead(await call(services, uid, "getStageCyclingSnapshotEffortPreference", { version: 1, activityId, sourceBasis: "stage_snapshot_v1" }) as Read, activityId);
}
export async function saveCyclingSnapshotPreference(services: FirebaseServices, uid: string, read: Read, target: BikeDistanceKey, key: string) {
  const request = cyclingSnapshotWriteRequest(read, target, key);
  return validateCyclingSnapshotWrite(await call(services, uid, "setStageCyclingSnapshotEffortPreference", request) as Response, request);
}
