import { BIKE_DISTANCE_TARGETS, BIKE_DISTANCE_M } from "@shared/activity-bike-distance-evidence";
import { periodFixture } from "../services/trainingAnalysisPeriods.fixture";
/** 합성 기간 응답. 기존 기간/존을 그대로 사용하고 새 저장 관측 채널만 더한다. */
export function cyclingDistancePeriodFixture() {
  const response = periodFixture(), period = response.periods[0]!;
  period.cyclingDistanceObservations = { version: 1, targetsVersion: 1, provenanceVersion: 2, sourceBasis: "stored_distance_parts", originalClockVerified: false, timingBasis: "stored_explicit_activity_elapsed", scope: "observed_representatives", quality: "unknown", coverage: "unknown", distances: BIKE_DISTANCE_TARGETS.map(distance => ({
    distance, distanceM: BIKE_DISTANCE_M[distance], candidateActivityCount: 1, supportedActivityCount: 1, observedEffortActivityCount: distance === "10km" ? 1 : 0, noObservedEffortActivityCount: distance === "10km" ? 0 : 1, unsupportedActivityCount: 0, unavailableActivityCount: 0, truncated: false,
    bestTimeSeconds: distance === "10km" ? 1000 : null, medianTimeSeconds: distance === "10km" ? 1000 : null,
    sources: distance === "10km" ? [{ sourceActivityId: "a", startTime: 2000, metricsRevision: "1700000000:0", contributingActivityCount: 1, elapsedSec: 1000, provenance: { provenanceVersion: 2, sourceBasis: "stored_distance_parts", timingBasis: "stored_explicit_activity_elapsed", originalClockVerified: false, declaredActivitySource: "orider", status: "stored_explicit" } }] : [],
  })) };
  return response;
}
