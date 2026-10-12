import type { NormalizedCyclingDistanceProvenance } from "./cycling-distance-observations";
import type { BikeDistanceKey } from "../activity-bike-distance-evidence";
import type { HrZoneBoundaries } from "../training/hrZoneTable";
import type { PowerCurvePeriod } from "./power-curve-periods";
import type { ExpandedRunDistanceKey, RunDistanceKey } from "./personal-records";

export interface TrainingAnalysisPeriodsRequest {
  discipline: "bike" | "run" | "swim";
  periods: PowerCurvePeriod[];
  includeExpandedRunDistances?: true;
  includeRunningPaceZones?: true;
  includeCyclingClimbObservations?: true;
  includeCyclingDistanceObservations?: true;
}

/** 오라이더 정책이며 Strava의 구간 공식과 동일하다는 뜻이 아니다. */
export interface RunningPaceZoneAnalysis {
  version: 1;
  policy: "orider_gap_threshold_v1";
  basis: "calculation_snapshot";
  timingBasis: "observed_elapsed_intervals";
  state: "observed" | "unavailable";
  reason: "threshold_missing" | "gap_input_unavailable" | "profile_read_failed" | null;
  thresholdPaceSecPerKm: number | null;
  thresholdSource: "training.thresholdPace" | "thresholdPace" | null;
  calculatedAt: number;
  /** 계산 입력으로 읽은 프로필 문서 수정 revision. 주행 당시 역치의 증거가 아니다. */
  thresholdProfileRevision?: string;
  upperSpeedRatios: number[];
  zoneSeconds: number[];
  eligibleGapSeconds: number;
  /** 실제 제공된 경과 관측 간격의 부분 집계. 전체 활동시간의 분모가 아니다. */
  intervalCoverage: {
    scope: "provided_elapsed_intervals";
    observedIntervalSeconds: number;
    eligibleGapSeconds: number;
    stoppedSeconds: number;
    missingAltitudeMovingSeconds: number;
    gapExcludedSeconds: number;
    invalidDistanceSeconds: number;
  } | null;
}
export interface PeriodRunningPaceZones {
  status: "observed" | "unavailable";
  reason: "observed_canonical_gap_zones" | "canonical_pace_zones_unavailable";
  candidateActivityCount: number;
  eligibleActivityCount: number;
  legacyUnsupportedActivityCount: number;
  unavailableActivityCount: number;
  thresholdMissingActivityCount: number;
  gapInputUnavailableActivityCount: number;
  profileReadFailedActivityCount: number;
  truncated: boolean;
  groups: Array<Omit<RunningPaceZoneAnalysis, "calculatedAt" | "thresholdProfileRevision"> & {
    sources: Array<PeriodRunSource & { calculatedAt: number; thresholdProfileRevision?: string }>;
  }>;
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
export interface PeriodRunningEvidence {
  version: 1;
  /** 확정 입력에서 수치가 관측된 대표 활동만 포함. 누락·잘림은 채널 coverage로 확인한다. */
  scope: "observed_representatives";
  timingBasis: "elapsed_including_stops";
  /** 최대 200개, 활동별 거리 5개·페이스 9개 이하. */
  activities: Array<{
    activityId: string;
    startTime: number;
    metricsRevision: string;
    distanceRecords: Array<{ distance: RunDistanceKey; elapsedSec: number }>;
    paceCurve: {
      sourceBasis: "run_metrics_pace_curve" | "speed_curve_kmh_converted";
      unit: "sec_per_km";
      points: Array<{ durationSeconds: number; paceSecPerKm: number; speedKph: number | null }>;
    } | null;
  }>;
}
export interface ExpandedRunDistanceRecords {
  version: 1;
  targetsVersion: 2;
  timingBasis: "elapsed_including_stops";
  state: "observed" | "no_observed_efforts" | "legacy_unsupported" | "unavailable";
  points: Array<{ distance: ExpandedRunDistanceKey; elapsedSec: number }>;
}
export interface ExpandedRunDistanceAnalysis {
  version: 1;
  targetsVersion: 2;
  timingBasis: "elapsed_including_stops";
  scope: "observed_representatives";
  distances: Array<{
    distance: ExpandedRunDistanceKey;
    distanceM: number;
    candidateActivityCount: number;
    supportedActivityCount: number;
    observedEffortActivityCount: number;
    noObservedEffortActivityCount: number;
    unsupportedActivityCount: number;
    unavailableActivityCount: number;
    truncated: boolean;
    bestTimeSeconds: number | null;
    medianTimeSeconds: number | null;
    sources: Array<PeriodRunSource & { elapsedSec: number }>;
  }>;
}
export interface PeriodRunningAnalysis {
  expandedDistanceAnalysis?: ExpandedRunDistanceAnalysis;
  /** 추가 계약. 원본 센서·위치 없이 이미 읽은 정본의 관측 근거만 전달한다. */
  evidence?: PeriodRunningEvidence;
  bestDistances: {
    status: "complete" | "partial";
    timingBasis: "elapsed_including_stops";
    coverage: PeriodRunningCoverage;
    /** 대표 활동별 거리 최고 경과 시간의 관측 분포. 일부·잘림은 전체 기간 기록이 아니다. */
    observedStatistics?: Array<{
      distance: RunDistanceKey;
      bestTimeSeconds: number;
      medianTimeSeconds: number;
      contributingActivityCount: number;
    }>;
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
    /** 활동별 duration 최고 페이스의 관측 분포. 전체 훈련 평균·실력 변화가 아니다. */
    observedStatistics?: Array<{
      durationSeconds: number;
      observedBestPaceSecPerKm: number;
      observedMedianPaceSecPerKm: number;
      contributingActivityCount: number;
    }>;
    points: Array<PeriodRunSource & { durationSeconds: number; paceSecPerKm: number;
      /** 속도 변환에서만 원래 반올림된 km/h를 보존한다. 정본 페이스는 null이다. */
      speedKph: number | null }>;
  }>;
}
export interface CyclingClimbObservations {
  version: 1;
  scope: "observed_representatives";
  climbQuality: "unknown";
  /** supported = observed + noObserved; candidate = supported + unsupported + unavailable. */
  candidateActivityCount: number;
  supportedActivityCount: number;
  observedActivityCount: number;
  noObservedActivityCount: number;
  unsupportedActivityCount: number;
  unavailableActivityCount: number;
  truncated: boolean;
  /** 최대 5 sources; 활동별 가장 큰 단일 관측 상승만 기여한다. */
  sources: Array<PeriodRunSource & {
    startKm: number; endKm: number; lengthKm: number; elevationGainM: number; avgGrade: number;
    durationSec: number | null; vam: number | null;
    timingBasis: "stored_detector_time_unverified";
    wholeActivityElevationQuality: "reliable";
    sourceLayer: "raw_parts" | "inline_streams" | "unknown";
  }>;
}
export interface CyclingDistancePeriodAnalysis {
  version: 1;
  targetsVersion: 1;
  provenanceVersion: 2;
  sourceBasis: "stored_distance_parts";
  originalClockVerified: false;
  timingBasis: "stored_explicit_activity_elapsed";
  scope: "observed_representatives";
  quality: "unknown";
  coverage: "unknown";
  distances: Array<{
    distance: BikeDistanceKey;
    distanceM: number;
    /** candidate = supported + unsupported + unavailable; supported = observed + noObserved. */
    candidateActivityCount: number;
    supportedActivityCount: number;
    observedEffortActivityCount: number;
    noObservedEffortActivityCount: number;
    unsupportedActivityCount: number;
    unavailableActivityCount: number;
    truncated: boolean;
    bestTimeSeconds: number | null;
    medianTimeSeconds: number | null;
    /** 최대 200개 대표 활동. 경과 시간/날짜/ID 순; 계정 PR 순위가 아니다. */
    sources: Array<PeriodRunSource & { elapsedSec: number; provenance: NormalizedCyclingDistanceProvenance }>;
  }>;
}
export interface TrainingAnalysisPeriodResult extends PowerCurvePeriod {
  status: "complete" | "partial";
  cyclingClimbObservations?: CyclingClimbObservations;
  cyclingDistanceObservations?: CyclingDistancePeriodAnalysis;
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
    pace: { status: "unavailable"; reason: "canonical_pace_zones_unavailable" } | PeriodRunningPaceZones;
  };
}
export interface TrainingAnalysisPeriodsResponse {
  version: 1;
  discipline: TrainingAnalysisPeriodsRequest["discipline"];
  asOf: number;
  inputDigest: string;
  periods: TrainingAnalysisPeriodResult[];
}
