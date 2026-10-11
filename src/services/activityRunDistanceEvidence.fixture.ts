import type { ActivityRunDistanceEvidenceResponse } from "@shared/activity-run-distance-evidence";
export const manualDistanceEpoch = Date.parse("2026-10-01T00:00:00+09:00");
export function manualDistanceFixture(): ActivityRunDistanceEvidenceResponse {
  const exact = 2.5 * 400 / 520;
  return { mode: "run_distance_evidence", activityId: "ride", distanceInputRevision: "a".repeat(64), state: "available", reason: null, sourceLayer: "raw_parts", evidence: { activityId: "ride", distanceInputRevision: "a".repeat(64), sourceLayer: "raw_parts", sourceSchemaVersion: "native-distance-v1", sourceTimingBasis: "original_activity_elapsed", originEpochMs: manualDistanceEpoch, durationSec: 40, coverage: "unknown", quality: "unknown", scope: "single_observed_activity", targetsVersion: 2, inputPointCount: 2, observedStartOffsetSec: 30, observedEndOffsetSec: 32.5, facts: [{ distance: "400m", distanceM: 400, elapsedSec: 2, exactElapsedSec: exact, startIndex: 0, endBeforeIndex: 0, endIndex: 1, endFraction: 400 / 520, startTimeSec: 30, endTimeSec: 30 + exact, startOffsetSec: 30, endOffsetSec: 30 + exact }] } };
}
