/** 후보 계약만 정의한다. endpoint/프로덕션 입력 상한이 아니다. */
export interface StageNativePowerV2CandidatePolicy {
  purpose: "offline_candidate_qualification";
  version: "native_power_v2_candidate_12k" | "native_power_v2_candidate_15k" | "native_power_v2_candidate_20k";
  maxIntervals: 12000 | 15000 | 20000;
}
export interface StageNativePowerV2Document {
  path: string; exists: boolean; createTime: string | null; updateTime: string | null; readTime: string;
  data: Record<string, unknown> | null;
}
export interface StageNativePowerV2DocumentWitness {
  path: string; exists: boolean; createTime: string | null; updateTime: string | null; contentHash: string;
}
export interface StageNativePowerV2Source {
  userId: string; activityId: string; activityIncarnation: string; activityRevision: string; baseMetricsRevision: string;
  manifestIncarnation: string; manifestRevision: string; ingestIncarnation: string | null;
  qualification: "native_manifest_and_gcs_token_pinned" | "legacy_manifest_revision_and_gcs_token_pinned";
  originEpochMs: number; activityEndEpochMs: number;
  powerSource: "measured" | "stored_native_watts_unverified";
  sourceContextDigest: string; documents: StageNativePowerV2DocumentWitness[];
  generation: string; crc32c: string; gcsIncarnationToken: string;
  rawSampleCount: number; rawEncodedBytes: number; rawDecodedBytes: number | null;
  rawEncoding: "identity" | "gzip"; rawEncodedDigest: string | null; rawDecodedDigest: string | null;
}
export interface StageNativePowerV2Snapshot {
  schemaVersion: 2; codecVersion: 1; calculatorPolicyVersion: "native_power_integer_ms_v2";
  candidatePolicyVersion: StageNativePowerV2CandidatePolicy["version"];
  userId: string; activityId: string; snapshotRevision: string; calculatorArtifactHash: string;
  basis: "stage_derived_stored_native_one_second_slots"; originalClockVerified: false; sensorBucketOriginVerified: false;
  quality: "unknown"; collectionCompleteness: "unknown"; unit: "W"; virtualPower: false;
  state: "final"; inputPending: false; timeUnit: "integer_milliseconds";
  activityElapsedMs: number; intervalCount: number; observedMs: number; longestContinuousMs: number;
  payload: { encoding: "gzip_base64_columns_v1"; base64: string; encodedBytes: number; decodedBytes: number;
    compressedSha256: string; decodedSha256: string };
  source: StageNativePowerV2Source;
}
export interface StageNativePowerV2ExactWitness {
  version: 2; calculatorPolicyVersion: "native_power_integer_ms_v2"; snapshotRevision: string;
  powerSource: StageNativePowerV2Source["powerSource"]; durationMs: number;
  windowStartElapsedMs: number; windowEndElapsedMs: number;
  energyNumerator: string; energyDenominator: string; maxAveragePowerW: number;
  originalClockVerified: false; sensorBucketOriginVerified: false;
}
