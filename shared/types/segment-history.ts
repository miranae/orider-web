/** 소유자 전용 세그먼트 이력. geometry 동일성/방향은 기존 저장 데이터로 확정할 수 없다. */
export interface MySegmentHistoryRequest {
  segmentId: string;
  currentActivityId: string;
  currentEffortId: string;
  pageSize?: number;
  cursor?: string;
  expectedInputRevision?: string;
}
export interface SegmentHistoryAttempt {
  effortId: string;
  activityId: string;
  segmentId: string;
  elapsedMs: number;
  startDateMs: number | null;
  averageSpeedKph: number | null;
  averageHeartrate: number | null;
  averageWatts: number | null;
  averageCadence: number | null;
  isVirtualPower: boolean | null;
  source: string | null;
  matchAlgorithmVersion: string | null;
  direction: "unknown";
  geometryRevision: null;
}
export interface MySegmentHistoryResponse {
  state: "available" | "changed_input";
  segmentId: string;
  currentActivityId: string;
  currentEffortId: string;
  inputRevision: string;
  /** 현재 시도는 페이지 포함 여부와 무관하게 소유권을 검증한다. changed_input에서는 null. */
  currentAttempt: SegmentHistoryAttempt | null;
  attempts: SegmentHistoryAttempt[];
  nextCursor: string | null;
  coverage: { complete: boolean; scannedCount: number; verifiedCount: number; hasMore: boolean; reason: "complete" | "bounded_page" | "continuation_page" | "invalid_source" | "changed_input" };
  comparison: {
    referenceEffortId: string;
    basis: "activity_deduplicated_current_vs_prior_best";
    analyzedAttempts: number;
    attemptNo: number;
    previousBestSec: number | null;
    deltaVsPreviousBestSec: number | null;
    isPR: boolean;
    currentVsPriorBest: "improving" | "stable" | "declining" | null;
  } | null;
  comparisonUnavailableReason: "partial_history" | "invalid_chronology" | "changed_input" | null;
  records: {
    state: "authoritative_snapshot" | "unavailable";
    topThree: SegmentHistoryAttempt[];
    rawTotalEfforts: number | null;
    authorityUpdatedAtMs: number | null;
    /** 원본 총계는 해당 스냅샷 시점의 값이며 분석에서 필터링한 시도 수가 아니다. */
    totalBasis: "persisted_snapshot";
  };
  alignment: "geometry_and_direction_unknown";
}
