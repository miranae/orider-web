import type { StageNativePowerV2Snapshot, StageNativePowerV2Source, StageNativePowerV2ExactWitness } from "./stage-native-power-v2";
export interface NativePowerV2AuthAccount { creationTime: string; disabled: false; tokensValidAfterTime: string }
export interface NativePowerV2Publication {
  publicationVersion: 1; snapshot: StageNativePowerV2Snapshot; authCreatedAtMs: string;
  selectedPolicyReceiptDigest: string; preparationArtifactHash: string; publicationRevision: string;
}
export interface NativePowerV2StageDocument {
  path: string; exists: boolean; createTime: string | null; updateTime: string | null; readTime: string; data: unknown;
}
export interface NativePowerV2StageWitness {
  path: string; exists: boolean; createTime: string | null; updateTime: string | null; contentHash: string;
}
export interface NativePowerV2PreparedArtifact {
  version: 1; publication: NativePowerV2Publication; baseline: NativePowerV2StageWitness;
  previewReadTime: string; account: NativePowerV2AuthAccount;
  transport: { generation: string; crc32c: string; encodedBytes: number; sha256: string; transportVerified: true };
}
export interface NativePowerV2Session {
  version: 1; purpose: "stage_native_power_v2_private_session"; uid: string; activityId: string;
  account: NativePowerV2AuthAccount; source: StageNativePowerV2Source;
  snapshotRevision: string; publicationRevision: string; selectedPolicyReceiptDigest: string;
  calculatorArtifactHash: string; preparationArtifactHash: string; readerArtifactHash: string;
  durationSeconds: number | null; periodBinding: string | null; readTime: string; issuedAtMs: number; expiresAtMs: number;
}
export type NativePowerV2ReaderRequest =
  | { mode: "stage_native_power_v2_metadata"; activityId: string; durationSeconds: number | null; periodBinding: string | null }
  | { mode: "stage_native_power_v2_duration"; activityId: string; durationSeconds: number; periodBinding: string | null; session: string };
export interface NativePowerV2ReaderResponse {
  version: 2; mode: NativePowerV2ReaderRequest["mode"]; activityId: string;
  scope: "whole_activity_observed_intervals"; collectionCompleteness: "unknown";
  timingBasis: "stored_native_timestamp_one_second_slots"; comparisonChannel: "native_stored_bucket_unverified";
  state: "available" | "no_continuous_window" | "snapshot_missing" | "input_policy_limit";
  session: string | null; witness: StageNativePowerV2ExactWitness | null;
  bounds: { observedMs: number; longestContinuousMs: number } | null;
  costs: { documents: number; metadata: number; auth: number; snapshotBodies: number; raw: 0; writes: 0 };
}
