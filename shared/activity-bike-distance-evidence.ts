import type { DeclaredCyclingActivitySource } from "./types/cycling-distance-observations";
/** 고정 SI 거리. 80km와 50miles는 서로 다른 관측 구간이다. */
export const BIKE_DISTANCE_TARGETS = ["5miles", "10km", "10miles", "20km", "30km", "40km", "50km", "80km", "50miles", "90km", "100km", "100miles", "180km"] as const;
export type BikeDistanceKey = typeof BIKE_DISTANCE_TARGETS[number];
export const BIKE_DISTANCE_M: Readonly<Record<BikeDistanceKey, number>> = {
  "5miles": 8046.72, "10km": 10000, "10miles": 16093.44, "20km": 20000, "30km": 30000,
  "40km": 40000, "50km": 50000, "80km": 80000, "50miles": 80467.2, "90km": 90000,
  "100km": 100000, "100miles": 160934.4, "180km": 180000,
};

/** 저장 PR·전체 계정 순위가 아닌, 명시적으로 읽은 단일 활동의 저장 관측 근거다. */
export interface ActivityBikeDistanceEvidence {
  activityId: string;
  distanceInputRevision: string;
  sourceLayer: "raw_parts" | "api_streams";
  sourceSchemaVersion: string;
  provenanceVersion: 2;
  sourceBasis: "stored_distance_parts" | "provider_distance_stream";
  sourceTimingBasis: "stored_explicit_activity_elapsed" | "provider_explicit_activity_elapsed";
  originalClockVerified: false;
  declaredActivitySource: DeclaredCyclingActivitySource | null;
  originEpochMs: number;
  durationSec: number;
  coverage: "unknown";
  quality: "unknown";
  scope: "single_observed_activity";
  targetsVersion: 1;
  inputPointCount: number;
  observedStartOffsetSec: number;
  observedEndOffsetSec: number;
  facts: ObservedBikeDistanceFact[];
}
export interface ObservedBikeDistanceFact {
  distance: BikeDistanceKey;
  distanceM: number;
  elapsedSec: number;
  exactElapsedSec: number;
  startIndex: number;
  endBeforeIndex: number;
  endIndex: number;
  endFraction: number;
  startTimeSec: number;
  endTimeSec: number;
  startOffsetSec: number;
  endOffsetSec: number;
}
export type ActivityBikeDistanceEvidenceResponse = {
  mode: "bike_distance_evidence";
  activityId: string;
  distanceInputRevision: string | null;
} & ({
  state: "available";
  reason: null;
  sourceLayer: "raw_parts" | "api_streams";
  evidence: ActivityBikeDistanceEvidence;
} | {
  state: "pending" | "changed_input" | "unavailable";
  reason: "missing_distance" | "unknown_axis" | "invalid_input" | "input_limit" | "incomplete_input" | "changed_input";
  sourceLayer: "raw_parts" | "api_streams" | null;
  evidence: null;
});
