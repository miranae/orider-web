import type { ExpandedRunDistanceKey } from "./types/personal-records";

/** 저장 PR·전체 계정 순위가 아닌, 명시적으로 읽은 단일 활동의 원본 관측 근거다. */
export interface ActivityRunDistanceEvidence {
  activityId: string;
  distanceInputRevision: string;
  sourceLayer: "raw_parts" | "api_streams";
  sourceSchemaVersion: string;
  sourceTimingBasis: "original_activity_elapsed";
  originEpochMs: number;
  durationSec: number;
  coverage: "unknown";
  quality: "unknown";
  scope: "single_observed_activity";
  targetsVersion: 2;
  inputPointCount: number;
  observedStartOffsetSec: number;
  observedEndOffsetSec: number;
  facts: ObservedRunDistanceFact[];
}
export interface ObservedRunDistanceFact {
  distance: ExpandedRunDistanceKey;
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
export type ActivityRunDistanceEvidenceResponse = {
  mode: "run_distance_evidence";
  activityId: string;
  distanceInputRevision: string | null;
} & ({
  state: "available";
  reason: null;
  sourceLayer: "raw_parts" | "api_streams";
  evidence: ActivityRunDistanceEvidence;
} | {
  state: "pending" | "changed_input" | "unavailable";
  reason: "missing_distance" | "unknown_axis" | "invalid_input" | "input_limit" | "incomplete_input" | "changed_input";
  sourceLayer: "raw_parts" | "api_streams" | null;
  evidence: null;
});
