import type { BikeDistanceKey } from "../activity-bike-distance-evidence";
import type { CyclingHistoryActivityTotals, CyclingDistanceHistoryRow } from "./training-cycling-distance-history";

/** 20개 활동×13개 노력과 순위를 포함하는 새 DTO만의 출력 상한. */
export const STAGE_CYCLING_COVERED_RESPONSE_MAX_BYTES = 512 * 1024;
export const STAGE_CYCLING_COVERED_ACTIVITY_ID_MAX_CHARS = 200;

export type CyclingCoveredStamp = { seconds: number; nanoseconds: number };
export type CyclingCoveredRange = { rangeBasis: "calendar_year"; year: number } |
  { rangeBasis: "explicit_range"; fromInclusive: number; toExclusive: number };
/** 수동 전체 교체 조회. 커서·세션·외부 owner는 받지 않는다. */
export interface StageCyclingDistanceCoveredRankingsRequest {
  version: 1;
  mode: "stage_cycling_distance_covered_rankings_v1";
  calendarBasis: "Asia/Seoul";
  range: CyclingCoveredRange;
  profile: 10 | 20;
  anchorActivityId?: string;
}
export interface CyclingCoveredEffort {
  target: BikeDistanceKey;
  originalElapsedSec: number | null;
  effectiveElapsedSec: number | null;
  basis: "canonical_metrics" | "stage_distance_snapshot" | "unavailable";
  excluded: boolean;
  canonicalActivityId: string;
  effortSourceActivityId: string | null;
  conflict: boolean;
  originalClockVerified: false;
  quality: "unknown";
  coverage: "unknown";
}
export interface CyclingCoveredRow {
  activityId: string;
  startTime: number;
  type: string;
  source: string | null;
  representativeInput: CyclingDistanceHistoryRow["representativeInput"];
  activityTotals: CyclingHistoryActivityTotals;
  canonicalState: "observed" | "no_observed_efforts" | "legacy_unsupported" | "unavailable";
  snapshotState: "supported" | "missing" | "not_applicable";
  duplicateUncertain: boolean;
  efforts: CyclingCoveredEffort[];
}
export interface CyclingCoveredRank extends CyclingCoveredEffort {
  activityId: string;
  startTime: number;
  effectiveElapsedSec: number;
}
export interface StageCyclingDistanceCoveredRankingsResponse {
  version: 1;
  mode: "stage_cycling_distance_covered_rankings_v1";
  requestScope: {
    calendarBasis: "Asia/Seoul";
    range: { fromInclusive: number; toExclusive: number };
    rangeBasis: CyclingCoveredRange["rangeBasis"];
    year: number | null;
    profile: 10 | 20;
    anchor: { activityId: string | null; outcome: "not_requested" | "in_prefix" | "included" | "outside_range" | "unavailable" };
    selectionOrder: "start_time_asc_with_optional_anchor";
  };
  cohort: {
    hash: string;
    loadedActivityCount: number;
    scannedActivityCount: number;
    queryExhausted: boolean;
    profileLimitReached: boolean;
    rankingScope: "covered_activities";
    overlayApplied: true;
  };
  readTimes: { sourceInitial: CyclingCoveredStamp; sourceFinal: CyclingCoveredStamp; stageInitial: CyclingCoveredStamp; stageFinal: CyclingCoveredStamp };
  rows: CyclingCoveredRow[];
  targets: Array<{ target: BikeDistanceKey; distanceM: number; top10: CyclingCoveredRank[]; winner: CyclingCoveredRank | null; nextBest: CyclingCoveredRank | null }>;
  coverage: {
    canonicalSupported: number; snapshotSupported: number; missing: number; legacyUnsupported: number; noObserved: number;
    excludedByTarget: Record<BikeDistanceKey, number>; duplicateUncertain: number; skipped: number;
  };
  io: { sourceDocs: number; stageDocs: number; metadata: number; payloads: 0; writes: 0;
    limits: { docs: 200 | 370; metadata: 20 | 40; payloads: 0; writes: 0 }; logicalDocMaximum: 188 | 358 };
}
