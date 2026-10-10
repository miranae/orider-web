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

export function runningPeriodFixture(): TrainingAnalysisPeriodsResponse {
  const result = periodFixture();
  result.discipline = "run";
  result.asOf = Date.parse("2026-10-03T15:00:00Z");
  const current = result.periods[0]!;
  current.fromInclusive = Date.parse("2026-10-01T15:00:00Z"); current.toExclusive = Date.parse("2026-10-02T15:00:00Z");
  current.activities[0]!.startTime = current.fromInclusive + 3600000;
  current.zones.heartRate.groups[0]!.boundaries = deriveHrZoneBoundaries({ lthr: 170, sport: "run" })!;
  current.zones.power = { candidateActivityCount: 0, eligibleActivityCount: 0, missingSensorActivityCount: 0, contextUnknownActivityCount: 0, observedSeconds: 0, groups: [], reason: "not_applicable" };
  const coverage = { candidateActivityCount: 1, eligibleActivityCount: 1, missingActivityCount: 0, noObservedEffortActivityCount: 0, truncated: false };
  const source = { sourceActivityId: "a", startTime: current.activities[0]!.startTime, metricsRevision: "100:1", contributingActivityCount: 1 };
  current.running = { bestDistances: { status: "complete", timingBasis: "elapsed_including_stops", coverage: { ...coverage }, points: [{ ...source, distance: "5km", distanceM: 5000, elapsedSec: 1200 }] },
    paceCurves: [{ status: "complete", sourceBasis: "run_metrics_pace_curve", timingBasis: "elapsed", unit: "sec_per_km", coverage: { ...coverage },
      points: [180, 300, 7200].map(durationSeconds => ({ ...source, durationSeconds, paceSecPerKm: durationSeconds === 300 ? 240 : 260, speedKph: null })) }] };
  const previous = structuredClone(current);
  previous.fromInclusive -= 86400000; previous.toExclusive -= 86400000;
  previous.activities[0]!.activityId = "b"; previous.activities[0]!.startTime -= 86400000;
  Object.values(previous.totals).forEach(total => { total.sourceActivityIds = ["b"]; });
  previous.zones.heartRate.groups[0]!.activityIds = ["b"];
  previous.running!.bestDistances.points.forEach(point => { point.sourceActivityId = "b"; point.startTime -= 86400000; point.elapsedSec += 60; });
  previous.running!.paceCurves.forEach(curve => curve.points.forEach(point => { point.sourceActivityId = "b"; point.startTime -= 86400000; point.paceSecPerKm += 10; }));
  result.periods.push(previous);
  return result;
}
