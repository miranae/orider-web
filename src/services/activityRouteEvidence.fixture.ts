import type { ActivityRouteEvidence, ActivityRouteEvidenceResponse } from "@shared/activity-route-comparison";
export function routeFixture(activityId = "first", reverse = false): ActivityRouteEvidence {
  return { activityId, routeInputRevision: "a".repeat(64), routeFingerprint: "b".repeat(64), sourceLayer: "raw_parts", sourceSchemaVersion: "native-v1", accuracy: "unknown", timingBasis: "elapsed", timeOrigin: "relative_to_first_gps_observation", originEpochMs: 1700000000000, coverage: "unknown", points: Array.from({ length: 101 }, (_, index) => ({ lat: 37, lon: 127 + (reverse ? 100 - index : index) * 0.0001, elapsedSec: index })) };
}
export function routeResponse(activityId = "first"): ActivityRouteEvidenceResponse {
  return { mode: "route_evidence", activityId, routeInputRevision: "a".repeat(64), state: "available", reason: null, sourceLayer: "raw_parts", route: routeFixture(activityId) };
}
