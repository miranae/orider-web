import type { BikeDistanceKey } from "../activity-bike-distance-evidence";
export interface CyclingSnapshotBinding { exists: boolean; createTime: string; updateTime: string; contentHash: string; derivedRevision: string | null }
export interface CyclingSnapshotReadRequest { version: 1; activityId: string; sourceBasis: "stage_snapshot_v1" }
export interface CyclingSnapshotMutationBinding extends CyclingSnapshotReadRequest {
  target: BikeDistanceKey; excluded: boolean; expectedPreferenceRevision: number;
  expectedActivityIncarnation: string; expectedSourceRevision: string;
  expectedSnapshotBinding: CyclingSnapshotBinding;
  expectedSourceAuthorityRevision: string | null;
}
export interface CyclingSnapshotMutationRequest extends CyclingSnapshotMutationBinding { idempotencyKey: string }
export interface CyclingSnapshotMutationResponse {
  version: 1; scope: "explicit_selected_stage_snapshot"; outcome: "stored_pending_analysis_refresh";
  activityId: string; activityIncarnation: string; preferenceRevision: number; target: BikeDistanceKey; excluded: boolean;
  globalRecords: "unchanged"; aggregateEffect: "not_applied";
}
export interface CyclingSnapshotReadResponse {
  version: 1; scope: "explicit_selected_stage_snapshot"; sourceBasis: "stage_snapshot_v1"; activityId: string;
  activityIncarnation: string; sourceRevision: string; preferenceRevision: number; excludedTargets: BikeDistanceKey[];
  canonicalMetricObservationState: "observed" | "no_observed_efforts" | "legacy_unsupported" | "unavailable";
  snapshotState: "missing" | "current" | "no_observed_efforts";
  snapshotBinding: CyclingSnapshotBinding;
  provenance: { basis: "stage_derived_from_stored_elapsed_axis"; originalClockVerified: false; quality: "unknown"; coverage: "unknown"; targetsVersion: 1; declaredActivitySource: "orider"; timeBasis?: "stored_activity_wall_clock_window"; qualification?: "legacy_manifest_revision_and_gcs_token_pinned"; manifestObjectIncarnationVerified?: false } | null;
  globalRecords: "unchanged"; aggregateEffect: "not_applied";
  readTimes: { source: { seconds: number; nanoseconds: number }; stage: { seconds: number; nanoseconds: number } };
  efforts: Array<{ target: BikeDistanceKey; originalElapsedSeconds: number | null; exactElapsedSeconds: number | null; effectiveElapsedSeconds: number | null; excluded: boolean; excludeBinding: CyclingSnapshotMutationBinding | null; restoreBinding: CyclingSnapshotMutationBinding | null }>;
}
