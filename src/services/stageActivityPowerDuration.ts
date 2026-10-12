import { httpsCallable } from "firebase/functions";
import type { StageActivityPowerDurationRequest, StageActivityPowerDurationResponse, StageActivityPowerSourceMetadataRequest, StageActivityPowerSourceMetadataResponse } from "@shared/types/stage-activity-power-snapshot";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig } from "./runtimeConfig";
const MAX_SECONDS = 604_800;
const MAX_MILLISECONDS = MAX_SECONDS * 1000;
const ACTIVITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const ENDPOINT = "https://asia-northeast3-orider-dev.cloudfunctions.net";
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const revision = (value: unknown): value is string => typeof value === "string" && /^\d+:\d+$/u.test(value) && value.length <= 100;
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const timestamp = (value: unknown): value is number => integer(value) && value > 0 && Number.isFinite(new Date(value).getTime());
const keys = (value: unknown, expected: string[]): boolean => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const invalid = (): never => { throw new Error("invalid_stage_power_response"); };
export function stageActivityPowerAvailable() {
  const config = getRuntimeConfig();
  return config.appEnvironment === "stage" && config.firebaseFunctionsBase === ENDPOINT;
}
function validSource(source: StageActivityPowerSourceMetadataResponse["source"]): boolean {
  return !!source && keys(source, ["activityStartEpochMs", "activityIncarnation", "baseMetricsRevision", "snapshotRevision", "sourceDigest", "qualification", "manifestObjectIncarnationVerified", "timingBasis", "originalClockVerified", "sensorBucketOriginVerified", "quality", "collectionCompleteness"])
    && timestamp(source.activityStartEpochMs) && revision(source.activityIncarnation) && revision(source.baseMetricsRevision)
    && digest(source.snapshotRevision) && digest(source.sourceDigest)
    && ["native_manifest_and_gcs_token_pinned", "legacy_manifest_revision_and_gcs_token_pinned"].includes(source.qualification)
    && source.manifestObjectIncarnationVerified === (source.qualification === "native_manifest_and_gcs_token_pinned")
    && source.timingBasis === "stored_native_one_second_slot_policy" && source.originalClockVerified === false
    && source.sensorBucketOriginVerified === false && source.quality === "unknown" && source.collectionCompleteness === "unknown";
}
export function validateStagePowerMetadata(value: StageActivityPowerSourceMetadataResponse, activityId: string, startTime: number) {
  if (!ACTIVITY_ID.test(activityId) || !keys(value, ["version", "mode", "activityId", "state", "reason", "activityStartEpochMs", "activityIncarnation", "baseMetricsRevision", "snapshotRevision", "observedMilliseconds", "longestContinuousMilliseconds", "minIntegerDurationSeconds", "maxIntegerDurationSeconds", "source"])
    || value.version !== 1 || value.mode !== "stage_activity_source_metadata" || value.activityId !== activityId
    || !timestamp(value.activityStartEpochMs) || value.activityStartEpochMs !== startTime || !revision(value.activityIncarnation)
    || !revision(value.baseMetricsRevision) || value.minIntegerDurationSeconds !== 1) invalid();
  if (value.state === "unavailable") {
    if (value.reason !== "snapshot_missing" || value.snapshotRevision !== null || value.source !== null
      || value.observedMilliseconds !== null || value.longestContinuousMilliseconds !== null || value.maxIntegerDurationSeconds !== null) invalid();
  } else if (value.state !== "available" || value.reason !== null || !validSource(value.source) || !digest(value.snapshotRevision)
    || !integer(value.observedMilliseconds) || value.observedMilliseconds > MAX_MILLISECONDS || !integer(value.longestContinuousMilliseconds) || value.longestContinuousMilliseconds > value.observedMilliseconds
    || !integer(value.maxIntegerDurationSeconds) || value.maxIntegerDurationSeconds > MAX_SECONDS || value.maxIntegerDurationSeconds !== Math.floor(value.longestContinuousMilliseconds / 1000)
    || value.source!.activityStartEpochMs !== startTime || value.source!.activityIncarnation !== value.activityIncarnation
    || value.source!.baseMetricsRevision !== value.baseMetricsRevision || value.source!.snapshotRevision !== value.snapshotRevision) invalid();
  return value;
}
export function stagePowerDurationRequest(metadata: StageActivityPowerSourceMetadataResponse, durationSeconds: number): StageActivityPowerDurationRequest {
  validateStagePowerMetadata(metadata, metadata.activityId, metadata.activityStartEpochMs);
  if (metadata.state !== "available" || !integer(durationSeconds) || durationSeconds < 1 || durationSeconds > (metadata.maxIntegerDurationSeconds ?? 0)) throw new Error("invalid_stage_power_duration");
  return { mode: "stage_activity_duration", activityId: metadata.activityId, durationSeconds,
    expectedActivityIncarnation: metadata.activityIncarnation, expectedBaseMetricsRevision: metadata.baseMetricsRevision, expectedSnapshotRevision: metadata.snapshotRevision };
}
export function validateStagePowerDuration(value: StageActivityPowerDurationResponse, request: StageActivityPowerDurationRequest, metadata: StageActivityPowerSourceMetadataResponse) {
  validateStagePowerMetadata(metadata, metadata.activityId, metadata.activityStartEpochMs);
  if (request.expectedActivityIncarnation !== metadata.activityIncarnation || request.expectedBaseMetricsRevision !== metadata.baseMetricsRevision
    || request.expectedSnapshotRevision !== metadata.snapshotRevision || request.activityId !== metadata.activityId
    || !integer(request.durationSeconds) || request.durationSeconds < 1 || request.durationSeconds > (metadata.maxIntegerDurationSeconds ?? 0)
    || !keys(value, ["version", "mode", "activityId", "state", "reason", "requestedDurationSeconds", "result", "source"])
    || value.version !== 1 || value.mode !== request.mode || value.activityId !== request.activityId || value.requestedDurationSeconds !== request.durationSeconds) invalid();
  if (value.result === null) {
    if (value.state !== "unavailable" || value.reason !== "snapshot_missing" || value.source !== null) invalid();
    return value;
  }
  const result = value.result;
  if (!validSource(value.source) || !metadata.source || !Object.keys(metadata.source).every(key => value.source![key as keyof NonNullable<typeof value.source>] === metadata.source![key as keyof NonNullable<typeof metadata.source>])
    || !keys(result, ["version", "scope", "timingBasis", "sensorBucketOriginVerified", "originalClockVerified", "quality", "collectionCompleteness", "unit", "state", "reason", "requestedDurationSeconds", "maxAveragePowerW", "windowStartElapsedSec", "windowEndElapsedSec", "observedSeconds", "longestContinuousSeconds"])
    || result.version !== 1 || result.scope !== "whole_activity_observed_intervals" || result.timingBasis !== "stored_native_one_second_slot_policy"
    || result.sensorBucketOriginVerified !== false || result.originalClockVerified !== false || result.quality !== "unknown" || result.collectionCompleteness !== "unknown"
    || result.unit !== "W" || result.requestedDurationSeconds !== request.durationSeconds || result.state !== value.state || result.reason !== value.reason
    || !finite(result.observedSeconds) || result.observedSeconds !== metadata.observedMilliseconds! / 1000
    || !finite(result.longestContinuousSeconds) || result.longestContinuousSeconds !== metadata.longestContinuousMilliseconds! / 1000) invalid();
  if (result.state === "available") {
    if (result.reason !== null || !finite(result.maxAveragePowerW) || result.maxAveragePowerW > Number.MAX_SAFE_INTEGER || !finite(result.windowStartElapsedSec) || !finite(result.windowEndElapsedSec)
      || result.windowStartElapsedSec > MAX_SECONDS || result.windowEndElapsedSec > MAX_SECONDS
      || result.windowEndElapsedSec <= result.windowStartElapsedSec
      || Math.abs(result.windowEndElapsedSec - result.windowStartElapsedSec - request.durationSeconds) > Number.EPSILON * Math.max(1, result.windowStartElapsedSec, result.windowEndElapsedSec) * 4) invalid();
  } else if (result.state !== "unavailable" || !["invalid_duration", "invalid_input", "unsupported_power", "pending_input", "duration_exceeds_continuous_input"].includes(result.reason ?? "")
    || result.maxAveragePowerW !== null || result.windowStartElapsedSec !== null || result.windowEndElapsedSec !== null) invalid();
  return value;
}
async function call(services: FirebaseServices, uid: string, request: StageActivityPowerSourceMetadataRequest | StageActivityPowerDurationRequest) {
  const matches = () => services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  if (!uid || !matches()) throw new Error("account_changed");
  if (!stageActivityPowerAvailable() || services.functions.app !== services.auth.app || services.functions.customDomain !== ENDPOINT) throw new Error("api_unavailable");
  if (!ACTIVITY_ID.test(request.activityId)) throw new Error("invalid_activity_id");
  await services.ensureAppCheckReady();
  if (!matches()) throw new Error("account_changed");
  const result = await httpsCallable(services.functions, "getPowerCurvePeriods")(request);
  if (!matches()) throw new Error("account_changed");
  return result.data;
}
export async function loadStagePowerMetadata(services: FirebaseServices, uid: string, activityId: string, startTime: number) {
  return validateStagePowerMetadata(await call(services, uid, { mode: "stage_activity_source_metadata", activityId }) as StageActivityPowerSourceMetadataResponse, activityId, startTime);
}
export async function loadStagePowerDuration(services: FirebaseServices, uid: string, metadata: StageActivityPowerSourceMetadataResponse, durationSeconds: number) {
  const request = stagePowerDurationRequest(metadata, durationSeconds);
  return validateStagePowerDuration(await call(services, uid, request) as StageActivityPowerDurationResponse, request, metadata);
}
