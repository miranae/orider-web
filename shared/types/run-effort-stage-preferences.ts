import type { ExpandedRunDistanceKey } from "./personal-records";
import type { StageRunDistanceSnapshot } from "./stage-run-distance-snapshot";

export interface RunEffortStageExclusionRequest {
  activityId: string;
  target: ExpandedRunDistanceKey;
  excluded: boolean;
  expectedPreferenceRevision: number;
  expectedMetricsRevision: string;
  /** Stage 파생 거리로 제외할 때만 현재 snapshot revision을 CAS로 지정한다. */
  expectedDerivedRevision?: string;
  expectedActivityIncarnation: string;
  idempotencyKey: string;
}
export interface RunEffortStageExclusionResponse {
  version: 1;
  scope: "stage_readtime_overlay";
  outcome: "stored_pending_analysis_refresh";
  activityId: string;
  activityIncarnation: string;
  preferenceRevision: number;
  target: ExpandedRunDistanceKey;
  excluded: boolean;
}
/** 수정 시간은 사용자의 보고이며 원본 시각이나 공식 PR 인증이 아니다. */
export type RunEffortReportedKind = "chip_time" | "timing_correction";
export interface RunEffortTimeSourceAuthority {
  version: 1;
  basis: "canonical_producer_elapsed_axis_v2" | "stage_distance_snapshot";
  timingBasis: "elapsed_including_stops" | StageRunDistanceSnapshot["basis"] | NonNullable<StageRunDistanceSnapshot["source"]["timeBasis"]>;
  activityId: string;
  activityIncarnation: string;
  activityRevision: string;
  metricsRevision: string;
  target: ExpandedRunDistanceKey;
  originalElapsedSeconds: number;
  derivedRevision?: string;
}
export interface RunEffortTimeCorrection {
  reportedElapsedSeconds: number;
  reportedKind?: RunEffortReportedKind;
  reportedAtEpochMs: number;
  provenance: "owner_reported";
  sourceAuthorityRevision: string;
  sourceAuthority: RunEffortTimeSourceAuthority;
}
export type RunEffortTimeCorrections = Partial<Record<ExpandedRunDistanceKey, RunEffortTimeCorrection>>;
type RunEffortTimeRequestBase = Pick<RunEffortStageExclusionRequest,
  "activityId" | "target" | "expectedPreferenceRevision" | "expectedMetricsRevision" | "expectedActivityIncarnation" | "idempotencyKey">;
export interface RunEffortStageSetTimeRequest extends RunEffortTimeRequestBase {
  action: "set_time";
  reportedElapsedSeconds: number;
  reportedKind?: RunEffortReportedKind;
  /** 현재 원본 관측값과 활동·metrics·snapshot 세대를 결속한 SHA256. */
  expectedSourceAuthorityRevision: string;
  expectedDerivedRevision?: string;
}
/** 수정 해제는 현재 활동/metrics 권한을 확인하며 사라진 관측값이나 snapshot은 요구하지 않는다. */
export interface RunEffortStageClearTimeRequest extends RunEffortTimeRequestBase { action: "clear_time" }
export type RunEffortStageMutationRequest = RunEffortStageExclusionRequest | RunEffortStageSetTimeRequest | RunEffortStageClearTimeRequest;
export interface RunEffortStageTimeResponse extends Omit<RunEffortStageExclusionResponse, "excluded"> {
  action: "set_time" | "clear_time";
  timeCorrection: RunEffortTimeCorrection | null;
}
export type RunEffortStageMutationResponse = RunEffortStageExclusionResponse | RunEffortStageTimeResponse;

/** Stage opt-in에만 사용할 독립 투영이다. 원본 기록·성장·통산 PR 채널을 대체하지 않는다. */
export interface StageTimeAdjustedRunEffort {
  version: 1;
  scope: "stage_user_reported_time";
  sourceAuthority: RunEffortTimeSourceAuthority;
  sourceAuthorityRevision: string;
  originalElapsedSeconds: number;
  originalAnchor?: NonNullable<StageRunDistanceSnapshot["records"][ExpandedRunDistanceKey]>;
  excluded: boolean;
  effectiveElapsedSeconds: number | null;
  correctionStatus: "none" | "applied" | "source_changed";
  timeCorrection: RunEffortTimeCorrection | null;
  originalClockVerified: false;
  globalRecords: "unchanged";
}

/** 원본 관측이 사라져도 현재 기본 권한으로 수정을 해제할 수 있다. */
export type StageRunTimeClearBinding = Pick<RunEffortStageClearTimeRequest,
  "activityId" | "target" | "expectedPreferenceRevision" | "expectedMetricsRevision" | "expectedActivityIncarnation">;
export interface StageTimeAdjustedRunEffortPeriod {
  version: 1;
  scope: "explicit_selected_activity";
  sourceMode: "canonical_observed" | "explicit_stage_snapshot";
  sourceAvailability: "observed" | "no_observed_targets" | "unavailable";
  selected: {
    activityId: string;
    startTime: number;
    activityIncarnation: string;
    metricsRevision: string | null;
    preferenceRevision: number;
    clearReady: boolean;
  } | null;
  /** 원본 관측이 확인된 목표만 있다. 전체 계정/기간 최고나 성장 지표가 아니다. */
  efforts: StageTimeAdjustedRunEffort[];
  /** 현재 관측 authority·원본 시간·anchor를 만들지 않는다. 저장된 보고값과 해제 권한만 표시한다. */
  orphanedCorrections: Array<{
    target: ExpandedRunDistanceKey;
    status: "source_missing";
    timeCorrection: RunEffortTimeCorrection;
    effectiveElapsedSeconds: null;
    clearBinding: StageRunTimeClearBinding | null;
  }>;
  globalRecords: "unchanged";
}

export interface RunEffortStageOverlay {
  version: 1;
  scope: "stage_readtime_overlay";
  selectionBasis: "observed_period_representatives";
  aliasPolicy: "selected_activity_incarnation_only";
  globalRecords: "unchanged";
  checkedActivityCount: number;
  preferenceBindings: Array<{
    activityId: string;
    activityIncarnation: string;
    preferenceRevision: number;
    /** 현재 마스크된 메트릭 문서 updateTime. 문서 부재 시 null. */
    metricsRevision: string | null;
    mutationReady: boolean;
    derivedRevision?: string;
    excludedTargets: ExpandedRunDistanceKey[];
  }>;
}
