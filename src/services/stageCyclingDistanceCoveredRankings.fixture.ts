import { BIKE_DISTANCE_M, BIKE_DISTANCE_TARGETS } from "@shared/activity-bike-distance-evidence";
import type { BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { CyclingCoveredRow, StageCyclingDistanceCoveredRankingsRequest as Request, StageCyclingDistanceCoveredRankingsResponse as Response } from "@shared/types/stage-cycling-distance-covered-rankings";
export const coveredRequest: Request = { version: 1, mode: "stage_cycling_distance_covered_rankings_v1", calendarBasis: "Asia/Seoul", profile: 10, range: { rangeBasis: "explicit_range", fromInclusive: 1000, toExclusive: 100000 }, anchorActivityId: "native" };
export function coveredFixture(excluded?: BikeDistanceKey, profile: 10 | 20 = 10): Response {
  const make = (activityId: string, twin = false): CyclingCoveredRow => {
    const first = activityId !== "other", source = twin ? "strava" : "orider", startTime = first ? 2000 : 4000;
    return { activityId, startTime, type: "Ride", source,
      representativeInput: { source, type: "Ride", discipline: "bike", localSessionId: first ? "session" : null, stravaActivityId: twin ? 12 : null, stravaTwinActivityId: activityId === "native" ? 12 : null, endTime: null, movingSec: null, hasLoad: false },
      activityTotals: { scope: "observed_activity_totals", distanceM: null, elevationGainM: null, sourceBasis: { distanceM: "unavailable", elevationGainM: "unavailable" }, distanceSource: null, sourceLayer: null, elevationQuality: "unknown", gpsEligibility: "unknown" },
      canonicalState: first ? "unavailable" : "observed", snapshotState: twin ? "not_applicable" : first ? "supported" : "missing", duplicateUncertain: false,
      efforts: BIKE_DISTANCE_TARGETS.map(target => ({ target, originalElapsedSec: first ? 100 : 200, effectiveElapsedSec: first && target === excluded ? null : first ? 100 : 200, excluded: first && target === excluded,
        basis: first ? "stage_distance_snapshot" : "canonical_metrics", canonicalActivityId: first ? "native" : "other", effortSourceActivityId: first ? "native" : "other", conflict: false, originalClockVerified: false, quality: "unknown", coverage: "unknown" })) };
  };
  const rows = [make("native"), make("strava_12", true), make("other")];
  const targets = BIKE_DISTANCE_TARGETS.map((target, index) => {
    const top10 = [rows[0]!, rows[2]!].flatMap(row => { const e = row.efforts[index]!; return e.effectiveElapsedSec === null ? [] : [{ ...e, activityId: row.activityId, startTime: row.startTime, effectiveElapsedSec: e.effectiveElapsedSec }]; });
    return { target, distanceM: BIKE_DISTANCE_M[target], top10, winner: top10[0] ?? null, nextBest: top10[1] ?? null };
  });
  return { version: 1, mode: coveredRequest.mode, requestScope: { calendarBasis: "Asia/Seoul", range: { fromInclusive: 1000, toExclusive: 100000 }, rangeBasis: "explicit_range", year: null, profile, anchor: { activityId: "native", outcome: "in_prefix" }, selectionOrder: "start_time_asc_with_optional_anchor" },
    cohort: { hash: "a".repeat(64), loadedActivityCount: 3, scannedActivityCount: 3, queryExhausted: true, profileLimitReached: false, rankingScope: "covered_activities", overlayApplied: true }, readTimes: { sourceInitial: { seconds: 101, nanoseconds: 0 }, sourceFinal: { seconds: 102, nanoseconds: 0 }, stageInitial: { seconds: 101, nanoseconds: 0 }, stageFinal: { seconds: 102, nanoseconds: 0 } }, rows, targets,
    coverage: { canonicalSupported: 1, snapshotSupported: 1, missing: 0, legacyUnsupported: 0, noObserved: 0, excludedByTarget: Object.fromEntries(BIKE_DISTANCE_TARGETS.map(target => [target, target === excluded ? 1 : 0])) as Record<BikeDistanceKey, number>, duplicateUncertain: 0, skipped: 0 },
    io: { sourceDocs: 30, stageDocs: 18, metadata: 2, payloads: 0, writes: 0, limits: { docs: profile === 10 ? 200 : 370, metadata: profile === 10 ? 20 : 40, payloads: 0, writes: 0 }, logicalDocMaximum: profile === 10 ? 188 : 358 } };
}
