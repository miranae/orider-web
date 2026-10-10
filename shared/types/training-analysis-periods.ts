import type { HrZoneBoundaries } from "../training/hrZoneTable";
import type { PowerCurvePeriod } from "./power-curve-periods";
import type { RunDistanceKey } from "./personal-records";

export interface TrainingAnalysisPeriodsRequest {
  discipline: "bike" | "run" | "swim";
  periods: PowerCurvePeriod[];
}
export interface PeriodObservedTotal {
  /** Known canonical subtotal; null means no observed values. */
  observedValue: number | null;
  /** Entire period total only when every representative is known and scan is complete. */
  totalValue: number | null;
  knownActivityCount: number;
  missingActivityCount: number;
  summaryFallbackCount: number;
  sourceBasis: "canonical_metrics" | "activity_summary" | "mixed" | "unavailable";
  sourceActivityIds: string[];
}
export interface PeriodZoneCoverage {
  candidateActivityCount: number;
  eligibleActivityCount: number;
  /** Includes records with missing, pending or incomplete canonical metrics. */
  missingSensorActivityCount: number;
  contextUnknownActivityCount: number;
  observedSeconds: number;
}
export interface PeriodHrZoneGroup {
  boundaries: HrZoneBoundaries;
  seconds: number[];
  observedSeconds: number;
  activityIds: string[];
}
export interface PeriodPowerZoneGroup {
  ftp: number;
  powerSource: "measured" | "virtual";
  seconds: number[];
  observedSeconds: number;
  activityIds: string[];
}
export interface PeriodRunningCoverage {
  candidateActivityCount: number;
  eligibleActivityCount: number;
  /** 정본 부재·대기·구버전·영구 일부 누락 또는 해당 필드 부재·무효 건수. */
  missingActivityCount: number;
  /** 확정·완전 입력에서 해당 노력 수치가 관측되지 않은 활동 수. */
  noObservedEffortActivityCount: number;
  truncated: boolean;
}
export interface PeriodRunSource {
  sourceActivityId: string;
  startTime: number;
  metricsRevision: string;
  contributingActivityCount: number;
}
export interface PeriodRunningAnalysis {
  bestDistances: {
    status: "complete" | "partial";
    timingBasis: "elapsed_including_stops";
    coverage: PeriodRunningCoverage;
    /** 일부 누락이면 포함된 입력 안에서의 최소값이며 기간 전체 최고 기록이 아니다. */
    points: Array<PeriodRunSource & { distance: RunDistanceKey; distanceM: number; elapsedSec: number }>;
  };
  /** 생산 경로·단위 기준을 분리한다. 서로 다른 기준으로 성장률을 계산하지 않는다. */
  paceCurves: Array<{
    status: "complete" | "partial";
    sourceBasis: "run_metrics_pace_curve" | "speed_curve_kmh_converted";
    timingBasis: "elapsed";
    unit: "sec_per_km";
    coverage: PeriodRunningCoverage;
    points: Array<PeriodRunSource & { durationSeconds: number; paceSecPerKm: number;
      /** 속도 변환에서만 원래 반올림된 km/h를 보존한다. 정본 페이스는 null이다. */
      speedKph: number | null }>;
  }>;
}
export interface TrainingAnalysisPeriodResult extends PowerCurvePeriod {
  status: "complete" | "partial";
  coverage: {
    scannedActivityCount: number;
    candidateActivityCount: number;
    representativeActivityCount: number;
    deduplicatedActivityCount: number;
    includedActivityCount: number;
    pendingActivityCount: number;
    missingActivityCount: number;
    incompleteActivityCount: number;
    skippedActivityCount: number;
    candidateCountKnown: boolean;
    truncated: boolean;
    scanLimit: number;
    deduplicationBasis: "explicit_identity_within_period";
  };
  totals: { distanceM: PeriodObservedTotal; movingTimeSec: PeriodObservedTotal; elevationGainM: PeriodObservedTotal };
  /** Deduplicated, owner-validated timeline. Null values are unknown, never zero-filled. */
  activities: Array<{ activityId: string; startTime: number; distanceM: number | null;
    movingTimeSec: number | null; elevationGainM: number | null;
    sourceBasis: Record<"distanceM" | "movingTimeSec" | "elevationGainM", "canonical_metrics" | "activity_summary" | "unavailable"> }>;
  /** 추가 응답 필드. 구형 API에는 없으며 러닝 이외 종목에서는 null이다. */
  running?: PeriodRunningAnalysis | null;
  zones: {
    /** Groups have distinct recorded boundaries; never treat them as one fixed threshold. */
    heartRate: PeriodZoneCoverage & { groups: PeriodHrZoneGroup[] };
    power: PeriodZoneCoverage & { groups: PeriodPowerZoneGroup[]; reason: "recorded_ftp" | "not_applicable" };
    pace: { status: "unavailable"; reason: "canonical_pace_zones_unavailable" };
  };
}
export interface TrainingAnalysisPeriodsResponse {
  version: 1;
  discipline: TrainingAnalysisPeriodsRequest["discipline"];
  asOf: number;
  inputDigest: string;
  periods: TrainingAnalysisPeriodResult[];
}
