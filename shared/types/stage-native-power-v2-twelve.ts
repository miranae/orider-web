import type { StageNativePowerV2ExactWitness } from "./stage-native-power-v2";

export const NATIVE_POWER_V2_TWELVE_SECONDS = [15,30,60,120,180,300,600,900,1200,1800,2700,3600] as const;
export interface NativePowerTwelvePeriod { id: string; fromInclusiveMs: number; toExclusiveMs: number }
export interface NativePowerTwelveCandidate {
  activityId: string; activityRevision: string; baseMetricsRevision: string;
  originEpochMs: number; sourceBinding: string;
}
export type NativePowerTwelveRequest =
  | { version: 1; mode: "stage_native_power_v2_twelve_inspect"; activityId: string }
  | { version: 1; mode: "stage_native_power_v2_twelve_personal_periods"; periods: NativePowerTwelvePeriod[];
      selectedSources: Array<Pick<NativePowerTwelveCandidate,"activityId"|"activityRevision"|"baseMetricsRevision"|"sourceBinding">> };
export interface NativePowerTwelveCosts {
  reserved: { documents: number; metadata: number; auth: number; snapshotBodies: number };
  delivered: { documents: number; metadata: number; auth: number; snapshotBodies: number };
  snapshotDecodeCalls: number; wireFullPublicationDocuments: number;
  encodedResponseBytes: number; queries: 0; raw: 0; writes: 0;
}
export type NativePowerTwelveWeight =
  | { state: "available"; weightKg: number; computedAtMs: number|null }
  | { state: "missing"|"invalid"|"incompatible"; weightKg: null; computedAtMs: number|null };
export interface NativePowerTwelveSlot {
  durationSeconds: typeof NATIVE_POWER_V2_TWELVE_SECONDS[number];
  state: "available"|"no_continuous_window"|"snapshot_missing"|"not_requested";
  witness: StageNativePowerV2ExactWitness|null;
  wattsPerKg: number|null;
  weightRatio: { numerator: string; denominator: string }|null;
}
export interface NativePowerTwelveSource {
  candidate: NativePowerTwelveCandidate;
  powerSource: "measured"|"stored_native_watts_unverified";
  physicalGroupBinding: string; unresolvedKnownTwin: boolean;
  state: "available"|"snapshot_missing";
  snapshotRevision: string|null; publicationRevision: string|null;
  bounds: { observedMs: number; longestContinuousMs: number }|null;
  weight: NativePowerTwelveWeight; slots: NativePowerTwelveSlot[];
}
export interface NativePowerTwelveWinner { activityId: string; snapshotRevision: string; slot: NativePowerTwelveSlot }
export interface NativePowerTwelvePeriodResult {
  period: NativePowerTwelvePeriod;
  counts: { selected: number; checked: number; available: number; snapshotMissing: number; unresolvedPhysicalGroups: number };
  rows: Array<{ durationSeconds: typeof NATIVE_POWER_V2_TWELVE_SECONDS[number];
    measured: { watts: NativePowerTwelveWinner|null; wattsPerKg: NativePowerTwelveWinner|null };
    storedNativeUnverified: { watts: NativePowerTwelveWinner|null; wattsPerKg: NativePowerTwelveWinner|null };
    counts: { available: number; shortWindow: number; snapshotMissing: number; weightUnavailable: number } }>;
}
export interface NativePowerTwelveResponse {
  version: 1; mode: NativePowerTwelveRequest["mode"];
  scope: "selected_and_checked_native_activities";
  timingBasis: "stored_native_timestamp_one_second_slots";
  comparisonChannel: "native_stored_bucket_unverified";
  originalClockVerified: false; sensorBucketOriginVerified: false; collectionCompleteness: "unknown";
  consumerRuntimeHash: string; sources: NativePowerTwelveSource[]; periods: NativePowerTwelvePeriodResult[];
  costs: NativePowerTwelveCosts;
}
