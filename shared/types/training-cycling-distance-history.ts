import type { BikeDistanceKey } from "../activity-bike-distance-evidence";

export interface CyclingDistanceHistoryCursor {
  scope: "cycling_distance_history_v1_targets1";
  readTime: { seconds: number; nanoseconds: number };
  range: { fromInclusive: number; toExclusive: number };
  after: { startTime: number; activityId: string };
  /** 무서명 요청 일관성 digest. 인증·서버 누적 조회 한도가 아니다. */
  requestBinding: string;
}
type CyclingDistanceHistoryBase = {
  mode: "cycling_distance_history_page";
  discipline: "bike";
  calendarBasis: "Asia/Seoul";
  cursor?: CyclingDistanceHistoryCursor;
};
export type CyclingDistanceHistoryRequest = CyclingDistanceHistoryBase & (
  { rangeBasis: "calendar_year"; year: number } |
  { rangeBasis: "explicit_range"; range: { fromInclusive: number; toExclusive: number } }
);
export interface CyclingDistanceHistoryRow {
  activityId: string;
  startTime: number;
  activityRevision: string;
  metricsRevision: string | null;
  /** 페이지 경계를 넘는 명시적 twin을 포함해 클라이언트가 전체 수신 행에서 대표를 선택한다. */
  representativeInput: {
    source: string | null; type: string; discipline: "bike";
    localSessionId: string | null; stravaActivityId: number | null; stravaTwinActivityId: number | null;
    endTime: number | null; movingSec: number | null; hasLoad: boolean;
  };
  analysis: {
    state: "ready" | "missing" | "pending" | "stale" | "outdated" | "partial" | "invalid";
    calculatorVersion: number | null;
    inputCoverage: "complete" | "partial_terminal" | "pending" | null;
  };
  distanceObservations: {
    state: "observed" | "no_observed_efforts" | "legacy_unsupported" | "unavailable";
    points: Array<{ distance: BikeDistanceKey; elapsedSec: number }>;
  };
}
export interface CyclingDistanceHistoryResponse {
  version: 1;
  mode: "cycling_distance_history_page";
  discipline: "bike";
  calendarBasis: "Asia/Seoul";
  rangeBasis: CyclingDistanceHistoryRequest["rangeBasis"];
  year: number | null;
  targetsVersion: 1;
  timingBasis: "original_activity_elapsed";
  quality: "unknown";
  coverage: "unknown";
  scope: "page";
  /** startTime 없는 활동 및 전체 계정/전 생애 PR 완전성을 증명하지 않는다. */
  queryScope: "owner_activities_with_valid_start_time";
  range: CyclingDistanceHistoryCursor["range"];
  readTime: CyclingDistanceHistoryCursor["readTime"];
  expiresAt: number;
  page: {
    limit: 50; scannedActivityCount: number; candidateActivityCount: number; skippedActivityCount: number;
    exhausted: boolean; nextCursor: CyclingDistanceHistoryCursor | null;
    /** 페이지 후보의 상태 수. 아직 전체 페이지 dedupe를 적용한 수가 아니다. */
    observationCounts: { observed: number; noObserved: number; unsupported: number; unavailable: number };
  };
  activities: CyclingDistanceHistoryRow[];
}
