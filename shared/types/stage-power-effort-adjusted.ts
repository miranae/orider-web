import type { PowerEffortBasis, PowerEffortOrigin, StagePowerEffortPreferenceRequest } from "./stage-power-effort-preference";
export interface StagePowerEffortPeriod { id: string; fromInclusiveMs: number; toExclusiveMs: number }
export interface StagePowerEffortAdjustedRequest {
  version: 1; mode: "stage_power_effort_adjusted_native12" | "stage_power_effort_adjusted_canonical" | "stage_power_effort_adjusted_v1";
  activityIds: string[]; periods: StagePowerEffortPeriod[];
  /** V1 수동 point만 명시 정수초를 받는다. 다른 모드는 이 필드를 받지 않는다. */
  durationSeconds?: number;
}
export interface StagePowerEffortPointControl {
  durationSeconds: number; basisVersion: PowerEffortBasis; powerSource: PowerEffortOrigin;
  state: "available" | "missing" | "short" | "unresolved"; originalWatts: number | null;
  originalWattsPerKg: number | null; excluded: boolean;
  /** 모든 incarnation/authority 필드는 opaque 서버 binding이다. raw Auth/ingest lifecycle은 없다. */
  excludeReady: Omit<StagePowerEffortPreferenceRequest, "idempotencyKey"> | null;
  restoreReady: Omit<StagePowerEffortPreferenceRequest, "idempotencyKey"> | null;
}
export interface StagePowerEffortAdjustedSource {
  activityId: string; activityIncarnationBinding: string | null;
  incarnationBasis: "document_create_time_and_validated_native_lifecycle" | "legacy_document_create_time_only" | "unavailable";
  originEpochMs: number | null; preferenceRevision: string | null; points: StagePowerEffortPointControl[];
}
export interface StagePowerEffortAdjustedWinner { activityId: string; watts: number; wattsPerKg: number | null; activityIncarnationBinding: string }
export interface StagePowerEffortAdjustedResponse {
  version: 1; mode: StagePowerEffortAdjustedRequest["mode"]; scope: "selected_and_checked_activities";
  populationCoverage: "partial_checked_subset"; originalClockVerified: false;
  sources: StagePowerEffortAdjustedSource[];
  periods: Array<{ period: StagePowerEffortPeriod; rows: Array<{ durationSeconds: number; basisVersion: PowerEffortBasis; powerSource: PowerEffortOrigin;
    watts: StagePowerEffortAdjustedWinner | null; wattsPerKg: StagePowerEffortAdjustedWinner | null;
    counts: { physicalGroups: number; excluded: number; unresolved: number; missing: number; short: number; qualified: number } }> }>;
  costs: { reserved: { documents: number; metadata: number; auth: number; writes: number }; delivered: { documents: number; metadata: number; auth: number; writes: number }; deliveryUnknown: boolean; queries: 0; raw: 0 };
}

/** 이전에 서버에서 받은 opaque handle만 lookup 힌트로 쓴다. LIST/원본 값 복구는 없다. */
export interface StagePowerEffortOrphanInspectRequest {
  version: 1; mode: "stage_power_effort_orphan_inspect"; activityId: string; activityIncarnationBinding: string;
}
export interface StagePowerEffortOrphanInspectResponse {
  version: 1; mode: "stage_power_effort_orphan_inspect"; scope: "owned_private_decision_restore_only";
  activityId: string; activityIncarnationBinding: string; preferenceRevision: string | null;
  sourceState: "missing" | "soft_deleted" | "owned_present";
  points: StagePowerEffortPointControl[]; costs: StagePowerEffortAdjustedResponse["costs"];
}
