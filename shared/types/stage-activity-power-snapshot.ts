import type { StageStoredNativePowerIntervals, StagePowerDurationKernelResult } from "./stage-activity-power-duration";

export interface StageActivityPowerDurationRequest {
  mode: "stage_activity_duration";
  activityId: string;
  durationSeconds: number;
  expectedActivityIncarnation: string;
  expectedBaseMetricsRevision: string;
  expectedSnapshotRevision: string | null;
}
export interface StageActivityPowerSource {
  activityIncarnation: string; activityRevision: string; baseMetricsRevision: string;
  manifestIncarnation: string; manifestRevision: string;
  ingestIncarnation: string | null;
  gcsIncarnationToken: string;
  qualification: "native_manifest_and_gcs_token_pinned" | "legacy_manifest_revision_and_gcs_token_pinned";
  manifestObjectIncarnationVerified: boolean;
  generation: string; crc32c: string; encodedBytes: number; decodedBytes: number; decodedDigest: string;
  sourceContextDigest: string; calculatorArtifactHash: string;
}
/** 분석용 파생 슬롯이다. 센서 버킷 producer 계보나 물리 시계를 인증하지 않는다. */
export interface StageActivityPowerSnapshot {
  version: 1; userId: string; activityId: string; snapshotRevision: string;
  basis: "stage_derived_stored_native_one_second_slots";
  originalClockVerified: false; sensorBucketOriginVerified: false;
  quality: "unknown"; collectionCompleteness: "unknown";
  originEpochMs: number; activityEndEpochMs: number;
  intervals: StageStoredNativePowerIntervals;
  source: StageActivityPowerSource;
}
export type StageActivityPowerDurationResponse =
  | { version: 1; mode: "stage_activity_duration"; activityId: string; state: "unavailable";
      reason: "snapshot_missing"; requestedDurationSeconds: number; result: null; source: null }
  | { version: 1; mode: "stage_activity_duration"; activityId: string;
      state: StagePowerDurationKernelResult["state"]; reason: StagePowerDurationKernelResult["reason"];
      requestedDurationSeconds: number; result: StagePowerDurationKernelResult;
      source: { activityStartEpochMs: number; activityIncarnation: string; baseMetricsRevision: string;
        snapshotRevision: string; sourceDigest: string;
        qualification: StageActivityPowerSource["qualification"]; manifestObjectIncarnationVerified: boolean;
        timingBasis: "stored_native_one_second_slot_policy"; originalClockVerified: false;
        sensorBucketOriginVerified: false; quality: "unknown"; collectionCompleteness: "unknown" } };

export interface StageActivityPowerSourceMetadataRequest {
  mode: "stage_activity_source_metadata";
  activityId: string;
}
export interface StageActivityPowerSourceMetadataResponse {
  version: 1; mode: "stage_activity_source_metadata"; activityId: string;
  state: "available" | "unavailable"; reason: "snapshot_missing" | null;
  activityStartEpochMs: number; activityIncarnation: string; baseMetricsRevision: string;
  snapshotRevision: string | null;
  observedMilliseconds: number | null; longestContinuousMilliseconds: number | null;
  minIntegerDurationSeconds: 1; maxIntegerDurationSeconds: number | null;
  source: Extract<StageActivityPowerDurationResponse, { result: StagePowerDurationKernelResult }>["source"] | null;
}
