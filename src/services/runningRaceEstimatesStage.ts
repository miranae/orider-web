import { httpsCallable } from "firebase/functions";
import type { StageRaceEstimateRequest, StageRaceEstimateResponse, StageRaceEstimateSnapshot } from "@shared/types/running-race-estimates-stage";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";
const targets = ["5k", "10k", "half", "marathon"] as const;
const distances = { "5k": 5000, "10k": 10000, half: 21097.5, marathon: 42195 };
const reasons = ["invalid_input", "too_many_sources", "no_qualified_source", "missing_typical_mileage", "unsupported_mileage_basis", "invalid_typical_mileage", "outside_model_domain", "non_finite_result"];
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const validDate = (value: unknown): value is number => positive(value) && value <= 8_640_000_000_000_000 && Number.isFinite(new Date(value).getTime());
const revision = (value: unknown) => typeof value === "string" && /^\d+:\d+$/u.test(value);
const id = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: object, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
export function runningRaceEstimatesAvailable() {
  const config = getRuntimeConfig();
  return config.appEnvironment === "stage" && config.firebaseFunctionsBase === "https://asia-northeast3-orider-dev.cloudfunctions.net";
}
export function validRunningRaceRequest(value: unknown): value is StageRaceEstimateRequest {
  if (!object(value)) return false;
  if (value.mode === "history_page") return keys(value, ["mode", "windowMonths", "cursor"]) && typeof value.windowMonths === "number" && [1, 3, 6].includes(value.windowMonths)
    && (value.cursor === undefined || typeof value.cursor === "string" && value.cursor.length <= 512);
  if ((value.mode !== "preview" && value.mode !== "save_snapshot") || !keys(value, ["mode", "activities", "manualRaces", "typicalMileage", ...(value.mode === "save_snapshot" ? ["idempotencyKey"] : [])])
    || !Array.isArray(value.activities) || value.activities.length > 4 || !Array.isArray(value.manualRaces) || value.manualRaces.length > 4) return false;
  if (value.mode === "save_snapshot" && (typeof value.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,100}$/u.test(value.idempotencyKey))) return false;
  if (!value.activities.every(row => object(row) && keys(row, ["activityId", "target", "maximalEffortAttested", "expectedActivityIncarnation", "expectedMetricsRevision", "expectedPreferenceRevision"])
    && id(row.activityId) && typeof row.target === "string" && (targets as readonly string[]).includes(row.target) && row.maximalEffortAttested === true && revision(row.expectedActivityIncarnation) && revision(row.expectedMetricsRevision)
    && typeof row.expectedPreferenceRevision === "number" && Number.isSafeInteger(row.expectedPreferenceRevision) && row.expectedPreferenceRevision >= 0)) return false;
  if (!value.manualRaces.every(row => object(row) && keys(row, ["id", "target", "elapsedSeconds", "occurredAt", "maximalEffortAttested"])
    && id(row.id) && typeof row.target === "string" && (targets as readonly string[]).includes(row.target) && positive(row.elapsedSeconds) && validDate(row.occurredAt) && row.maximalEffortAttested === true)) return false;
  if (new Set(value.activities.map(row => `${row.activityId}:${row.target}`)).size !== value.activities.length || new Set(value.manualRaces.map(row => row.id)).size !== value.manualRaces.length) return false;
  const mileage = value.typicalMileage;
  return mileage === undefined || object(mileage) && keys(mileage, ["value", "unit", "attestedTypicalTraining"]) && positive(mileage.value)
    && typeof mileage.unit === "string" && ["miles_per_week", "km_per_week"].includes(mileage.unit) && mileage.attestedTypicalTraining === true;
}
function validSnapshot(snapshot: StageRaceEstimateSnapshot, saved: boolean): boolean {
  if (!snapshot || snapshot.version !== 1 || snapshot.scope !== "stage_only_race_estimate" || !validDate(snapshot.asOf)
    || (saved ? typeof snapshot.snapshotId !== "string" || !/^[a-f0-9]{64}$/u.test(snapshot.snapshotId) : snapshot.snapshotId !== null)
    || snapshot.domainPolicy !== "adjusted_training_bounds_applied_to_raw_inputs_not_raw_endpoint_validation"
    || !validRunningRaceRequest({ mode: "preview", ...snapshot.inputs }) || !Array.isArray(snapshot.estimates) || snapshot.estimates.length !== 4
    || !snapshot.estimates.every(row => object(row) && targets.includes(row.target)) || new Set(snapshot.estimates.map(row => row.target)).size !== 4
    || !Array.isArray(snapshot.sourceWitnesses) || snapshot.sourceWitnesses.length !== snapshot.inputs.activities.length) return false;
  const seen = new Set<string>();
  for (const witness of snapshot.sourceWitnesses) {
    if (!object(witness)) return false;
    const input = snapshot.inputs.activities.find(row => row.activityId === witness.activityId && row.target === witness.target);
    const key = `${witness.activityId}:${witness.target}`;
    if (!input || seen.has(key) || witness.activityIncarnation !== input.expectedActivityIncarnation || witness.metricsRevision !== input.expectedMetricsRevision
      || witness.preferenceRevision !== input.expectedPreferenceRevision || !revision(witness.activityRevision)
      || !(revision(witness.preferenceDocumentRevision) || witness.preferenceDocumentRevision === "missing" && witness.preferenceRevision === 0)
      || witness.originalSensorClock !== "not_independently_verified"
      || (witness.qualification === "producer_elapsed_axis_v2" ? witness.reason !== null : witness.qualification !== "unavailable" || !["legacy_or_incomplete", "excluded"].includes(witness.reason ?? ""))) return false;
    seen.add(key);
  }
  const mileage = snapshot.typicalMileage, statement = snapshot.inputs.typicalMileage;
  if (statement === undefined ? mileage !== null : !mileage || mileage.value !== statement.value || mileage.unit !== statement.unit
    || mileage.basis !== "self_reported_typical_pre_marathon_training" || mileage.statedAt !== snapshot.asOf) return false;
  return snapshot.estimates.every(row => {
    if (row.distanceMeters !== distances[row.target] || row.asOf !== snapshot.asOf || row.accuracy !== "not_validated_for_orider" || row.policyVersion !== "qualified_race_equivalent_v1"
      || !Array.isArray(row.assumptions) || !row.assumptions.every(item => typeof item === "string")
      || row.typicalMileageMilesPerWeek !== null && !positive(row.typicalMileageMilesPerWeek)) return false;
    const source = row.source;
    if (source !== null) {
      if (!object(source) || !positive(source.elapsedSeconds) || !positive(source.distanceMeters) || !validDate(source.occurredAt)
        || source.occurredAt > snapshot.asOf || source.occurredAt < snapshot.asOf - 24 * 7 * 86_400_000 || source.maximalEffortAttested !== true
        || source.distanceQualified !== true || source.supported !== true || source.excluded !== false || source.deleted !== false) return false;
      if (source.provenance === "user_supplied_race") {
        const input = snapshot.inputs.manualRaces.find(input => source.sourceId === `manual:${input.id}`);
        if (!input || source.timeBasis !== "user_supplied_race_time" || source.clockVerified !== false || source.distanceMeters !== distances[input.target]
          || source.elapsedSeconds !== input.elapsedSeconds || source.occurredAt !== input.occurredAt || source.metricsRevision !== undefined || source.incarnation !== undefined || source.preferencesRevision !== undefined) return false;
      } else if (source.provenance === "trusted_server_elapsed") {
        const input = snapshot.inputs.activities.find(input => source.sourceId === `activity:${input.activityId}:${input.target}`);
        const witness = input && snapshot.sourceWitnesses.find(row => row.activityId === input.activityId && row.target === input.target);
        if (!input || !witness || witness.qualification !== "producer_elapsed_axis_v2" || source.timeBasis !== "elapsed_including_stops" || source.clockVerified !== true
          || source.distanceMeters !== distances[input.target] || source.metricsRevision !== witness.metricsRevision || source.incarnation !== witness.activityIncarnation || source.preferencesRevision !== String(witness.preferenceRevision)) return false;
      } else return false;
    }
    if (row.status === "unavailable") return row.elapsedSeconds === null && row.method === null && reasons.includes(row.reason ?? "");
    if (!source || !positive(row.elapsedSeconds) || row.reason !== null) return false;
    if (row.status === "historical_reference") return row.method === "same_distance_reference_v1" && row.distanceMeters === source.distanceMeters && row.elapsedSeconds === source.elapsedSeconds;
    return row.status === "estimate" && row.distanceMeters !== source.distanceMeters
      && row.method === (row.target === "marathon" ? "vickers_one_race_raw_mileage_v1" : "riegel_race_equivalent_1_07_v1");
  });
}
function normalizedInputs(inputs: StageRaceEstimateSnapshot["inputs"]) {
  return JSON.stringify({ activities: inputs.activities.map(row => ({ activityId: row.activityId, target: row.target, maximalEffortAttested: row.maximalEffortAttested,
    expectedActivityIncarnation: row.expectedActivityIncarnation, expectedMetricsRevision: row.expectedMetricsRevision, expectedPreferenceRevision: row.expectedPreferenceRevision })),
    manualRaces: inputs.manualRaces.map(row => ({ id: row.id, target: row.target, elapsedSeconds: row.elapsedSeconds, occurredAt: row.occurredAt, maximalEffortAttested: row.maximalEffortAttested })),
    ...(inputs.typicalMileage === undefined ? {} : { typicalMileage: { value: inputs.typicalMileage.value, unit: inputs.typicalMileage.unit, attestedTypicalTraining: inputs.typicalMileage.attestedTypicalTraining } }) });
}
export function validateRunningRaceResponse(response: StageRaceEstimateResponse, request: StageRaceEstimateRequest) {
  if (!response || response.mode !== request.mode) throw new Error("invalid_race_estimate_response");
  if (response.mode === "history_page" && request.mode === "history_page") {
    if (response.windowMonths !== request.windowMonths || response.windowDays !== request.windowMonths * 30 || response.scope !== "latest_64_actual_snapshots_within_180_days"
      || typeof response.registryRevision !== "string" || !Array.isArray(response.snapshots) || response.snapshots.length > 12
      || !response.snapshots.every(item => ["unchanged", "changed_or_unavailable"].includes(item.sourceValidity) && validSnapshot(item.snapshot, true))
      || response.nextCursor !== null && (typeof response.nextCursor !== "string" || response.nextCursor.length > 512) || typeof response.capped !== "boolean") throw new Error("invalid_race_estimate_response");
  } else if (response.mode !== "history_page") {
    if (!validSnapshot(response.snapshot, response.mode === "save_snapshot") || request.mode === "history_page" || normalizedInputs(response.snapshot.inputs) !== normalizedInputs(request) || response.mode === "save_snapshot" && !["stored_source_checked", "stored_source_unverified", "idempotent_historical_replay"].includes(response.outcome)) throw new Error("invalid_race_estimate_response");
  }
  return response;
}
export async function loadRunningRaceEstimates(services: FirebaseServices, ownerUid: string, request: StageRaceEstimateRequest) {
  const matches = () => services.auth.currentUser?.uid === ownerUid && !services.auth.currentUser.isAnonymous;
  if (!matches()) throw new Error("account_changed");
  if (!runningRaceEstimatesAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("api_unavailable");
  if (!validRunningRaceRequest(request)) throw new Error("invalid_race_estimate_request");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const result = await httpsCallable<StageRaceEstimateRequest, StageRaceEstimateResponse>(services.functions, "getStageRunRaceEstimates")(request);
  if (!matches()) throw new Error("account_changed");
  return validateRunningRaceResponse(result.data, request);
}
