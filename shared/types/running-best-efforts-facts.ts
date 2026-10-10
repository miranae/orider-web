import type { RunDistanceKey } from "./personal-records";
export interface RunningBestEffortFact {
  distance: RunDistanceKey;
  distanceM: number;
  elapsedSec: number;
  exactElapsedSec: number;
  startOffsetSec: number;
  endOffsetSec: number;
  /** 인덱스는 이 정본 거리축의 위치이며 GPS 인덱스가 아니다. */
  axis: "canonical_distance_observations" | "canonical_route";
  startIndex: number;
  endBeforeIndex: number;
  endIndex: number;
  endFraction: number;
}
export interface RunningBestEffortsFacts {
  state: "available" | "unavailable" | "changed_input";
  reason: string | null;
  streamInputRevision: string | null;
  metricsRevision: string | null;
  facts: RunningBestEffortFact[];
}
