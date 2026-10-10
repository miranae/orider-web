import { deriveHrZoneBoundaries } from "@shared/training/hrZoneTable";
import type { TrainingAnalysisPeriodsRequest, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
export const request: TrainingAnalysisPeriodsRequest = { discipline: "bike", periods: [{ fromInclusive: 1000, toExclusive: 10000 }] };
export function periodFixture(): TrainingAnalysisPeriodsResponse {
  const total = { observedValue: 100, totalValue: 100, knownActivityCount: 1, missingActivityCount: 0, summaryFallbackCount: 0, sourceBasis: "canonical_metrics" as const, sourceActivityIds: ["a"] };
  const channel = { candidateActivityCount: 1, eligibleActivityCount: 1, missingSensorActivityCount: 0, contextUnknownActivityCount: 0, observedSeconds: 40 };
  return { version: 1, discipline: "bike", asOf: 10000, inputDigest: "a".repeat(64), periods: [{ ...request.periods[0]!, status: "complete",
    coverage: { scannedActivityCount: 1, candidateActivityCount: 1, representativeActivityCount: 1, deduplicatedActivityCount: 0, includedActivityCount: 1, pendingActivityCount: 0, missingActivityCount: 0, incompleteActivityCount: 0, skippedActivityCount: 0, candidateCountKnown: true, truncated: false, scanLimit: 200, deduplicationBasis: "explicit_identity_within_period" },
    activities: [{ activityId: "a", startTime: 2000, distanceM: 100, movingTimeSec: 100, elevationGainM: 100, sourceBasis: { distanceM: "canonical_metrics", movingTimeSec: "canonical_metrics", elevationGainM: "canonical_metrics" } }],
    totals: { distanceM: structuredClone(total), movingTimeSec: structuredClone(total), elevationGainM: structuredClone(total) },
    zones: { heartRate: { ...channel, groups: [{ boundaries: deriveHrZoneBoundaries({ lthr: 170, maxHr: 190, sport: "bike" })!, seconds: [20, 20, 0, 0, 0], observedSeconds: 40, activityIds: ["a"] }] },
      power: { ...channel, reason: "recorded_ftp", groups: [{ ftp: 200, powerSource: "measured", seconds: [20, 20, 0, 0, 0, 0, 0], observedSeconds: 40, activityIds: ["a"] }] },
      pace: { status: "unavailable", reason: "canonical_pace_zones_unavailable" } } }] };
}
