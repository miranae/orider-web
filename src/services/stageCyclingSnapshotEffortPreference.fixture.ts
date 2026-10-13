import { BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import type { CyclingSnapshotReadResponse as Read } from "@shared/types/stage-cycling-snapshot-effort-preferences";
export function snapshotFixture(): Read {
  const snapshotBinding = { exists: true, createTime: "1:0", updateTime: "2:0", contentHash: "a".repeat(64), derivedRevision: "b".repeat(64) };
  const base = { version: 1 as const, sourceBasis: "stage_snapshot_v1" as const, activityId: "fixture_bike_a", expectedPreferenceRevision: 0, expectedActivityIncarnation: "1:0", expectedSourceRevision: "c".repeat(64), expectedSnapshotBinding: snapshotBinding };
  return { version: 1, scope: "explicit_selected_stage_snapshot", sourceBasis: "stage_snapshot_v1", activityId: base.activityId, activityIncarnation: "1:0", sourceRevision: base.expectedSourceRevision, preferenceRevision: 0, excludedTargets: [], canonicalMetricObservationState: "legacy_unsupported", snapshotState: "current", snapshotBinding,
    provenance: { basis: "stage_derived_from_stored_elapsed_axis", originalClockVerified: false, quality: "unknown", coverage: "unknown", targetsVersion: 1, declaredActivitySource: "orider" }, globalRecords: "unchanged", aggregateEffect: "not_applied", readTimes: { source: { seconds: 3, nanoseconds: 0 }, stage: { seconds: 3, nanoseconds: 0 } },
    efforts: BIKE_DISTANCE_TARGETS.map(target => ({ target, originalElapsedSeconds: target === "10km" ? 1500 : null, exactElapsedSeconds: target === "10km" ? 1500.25 : null, effectiveElapsedSeconds: target === "10km" ? 1500 : null, excluded: false, excludeBinding: target === "10km" ? { ...base, target, excluded: true, expectedSourceAuthorityRevision: "d".repeat(64) } : null, restoreBinding: null })) };
}
