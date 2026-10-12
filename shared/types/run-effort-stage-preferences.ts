import type { ExpandedRunDistanceKey } from "./personal-records";

export interface RunEffortStageMutationRequest {
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
export interface RunEffortStageMutationResponse {
  version: 1;
  scope: "stage_readtime_overlay";
  outcome: "stored_pending_analysis_refresh";
  activityId: string;
  activityIncarnation: string;
  preferenceRevision: number;
  target: ExpandedRunDistanceKey;
  excluded: boolean;
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
