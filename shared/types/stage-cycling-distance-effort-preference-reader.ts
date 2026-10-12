import type { BikeDistanceKey } from "../activity-bike-distance-evidence";
import type { NormalizedCyclingDistanceProvenance } from "./cycling-distance-observations";
import type { StageCyclingDistanceEffortPreferenceRequest } from "./stage-cycling-distance-effort-preferences";

export interface StageCyclingDistanceEffortPreferenceReadRequest {
  version: 1;
  activityId: string;
}
export type StageCyclingDistanceExcludeBinding = Omit<Extract<StageCyclingDistanceEffortPreferenceRequest, { excluded: true }>, "idempotencyKey">;
export type StageCyclingDistanceRestoreBinding = Omit<Extract<StageCyclingDistanceEffortPreferenceRequest, { excluded: false }>, "idempotencyKey">;
/** 명시적으로 선택한 활동의 관리 상태다. 기간 순위·통산 PR을 변경한 결과가 아니다. */
export interface StageCyclingDistanceEffortPreferenceReadResponse {
  version: 1;
  scope: "explicit_selected_activity";
  activityId: string;
  activityIncarnation: string;
  activityRevision: string;
  metricsRevision: string;
  preferenceRevision: number;
  excludedTargets: BikeDistanceKey[];
  observationState: "observed" | "no_observed_efforts" | "legacy_unsupported" | "unavailable";
  provenance: NormalizedCyclingDistanceProvenance | null;
  originalClockVerified: false;
  quality: "unknown";
  coverage: "unknown";
  globalRecords: "unchanged";
  aggregateEffect: "not_applied";
  readTimes: { source: { seconds: number; nanoseconds: number }; preference: { seconds: number; nanoseconds: number } };
  efforts: Array<{
    target: BikeDistanceKey;
    originalElapsedSeconds: number | null;
    excluded: boolean;
    effectiveElapsedSeconds: number | null;
    /** 사라진 관측값은 추측하지 않는다. 기존 제외 선택의 복원만 허용한다. */
    sourceStatus: "observed" | "source_missing" | "source_unavailable";
    excludeBinding: StageCyclingDistanceExcludeBinding | null;
    restoreBinding: StageCyclingDistanceRestoreBinding | null;
  }>;
}
