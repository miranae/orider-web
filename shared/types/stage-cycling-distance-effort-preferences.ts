import type { BikeDistanceKey } from "../activity-bike-distance-evidence";

interface RequestBase {
  activityId: string;
  target: BikeDistanceKey;
  expectedPreferenceRevision: number;
  expectedActivityIncarnation: string;
  expectedActivityRevision: string;
  expectedMetricsRevision: string;
  idempotencyKey: string;
}
/** 제외는 현재 관측 근거를 요구한다. 복원은 사라진 관측값을 만들지 않는다. */
export type StageCyclingDistanceEffortPreferenceRequest = RequestBase & (
  { excluded: true; expectedSourceAuthorityRevision: string }
  | { excluded: false; expectedSourceAuthorityRevision: null }
);
export interface StageCyclingDistanceEffortPreferenceResponse {
  version: 1;
  scope: "stage_cycling_distance_readtime_overlay";
  outcome: "stored_pending_analysis_refresh";
  activityId: string;
  activityIncarnation: string;
  preferenceRevision: number;
  target: BikeDistanceKey;
  excluded: boolean;
  globalRecords: "unchanged";
}
export interface StageCyclingDistanceEffortPreference {
  version: 1;
  userId: string;
  activityId: string;
  activityIncarnation: string;
  revision: number;
  excludedTargets: BikeDistanceKey[];
}
