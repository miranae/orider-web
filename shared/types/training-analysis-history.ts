import type { ExpandedRunDistanceRecords, PeriodRunningEvidence } from "./training-analysis-periods";

export interface TrainingAnalysisHistoryCursor {
  readTime: { seconds: number; nanoseconds: number };
  toExclusive: number;
  after: { startTime: number; activityId: string };
  /** 요청 범위·소유자 연결용 digest. 서명이나 인증 수단이 아니다. */
  requestBinding: string;
}
export interface TrainingAnalysisHistoryRequest {
  mode: "history_page";
  discipline: "run";
  calendarBasis: "Asia/Seoul";
  year: number;
  cursor?: TrainingAnalysisHistoryCursor;
  includeExpandedRunDistances?: true;
}
export interface TrainingAnalysisHistoryRow {
  activityId: string;
  startTime: number;
  activityRevision: string;
  metricsRevision: string | null;
  /** 페이지 안에서는 대표를 선택하지 않는다. 완주한 클라이언트가 정본 comparator를 적용한다. */
  representativeInput: {
    source: string | null;
    type: string;
    discipline: "run";
    localSessionId: string | null;
    stravaActivityId: number | null;
    stravaTwinActivityId: number | null;
    endTime: number | null;
    movingSec: number | null;
    hasLoad: boolean;
  };
  analysis: {
    state: "ready" | "missing" | "pending" | "stale" | "outdated" | "partial" | "invalid";
    calculatorVersion: number | null;
    inputCoverage: "complete" | "partial_terminal" | "pending" | null;
  };
  expandedDistanceRecords?: ExpandedRunDistanceRecords;
  distanceRecords: { state: "observed" | "no_observed_efforts" | "unavailable";
    reason: "metrics_unavailable" | "missing_or_invalid_field" | null;
    points: Array<{ distance: "1km" | "5km" | "10km" | "half" | "full"; elapsedSec: number }> };
  paceCurve: { state: "observed" | "no_observed_efforts" | "unavailable";
    reason: "metrics_unavailable" | "missing_or_invalid_field" | null;
    value: NonNullable<PeriodRunningEvidence["activities"][number]["paceCurve"]> | null };
}
export interface TrainingAnalysisHistoryResponse {
  version: 1;
  mode: "history_page";
  discipline: "run";
  calendarBasis: "Asia/Seoul";
  year: number;
  scope: "page";
  /** 정렬 필드가 없는 활동의 존재·누락까지 검증한 전체 계정 목록은 아니다. */
  queryScope: "owner_activities_with_valid_start_time";
  range: { fromInclusive: number; toExclusive: number };
  readTime: TrainingAnalysisHistoryCursor["readTime"];
  expiresAt: number;
  page: { limit: 50; scannedActivityCount: number; candidateActivityCount: number;
    skippedActivityCount: number; exhausted: boolean; nextCursor: TrainingAnalysisHistoryCursor | null };
  /** 현재 페이지의 사용 가능한 러닝 기록. 결측 분석도 행으로 남긴다. */
  activities: TrainingAnalysisHistoryRow[];
}
