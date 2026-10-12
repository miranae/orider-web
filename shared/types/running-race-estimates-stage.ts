import type { RunningRaceEstimate, RunningRaceTarget, TypicalRunningMileage } from "./running-race-estimates";

export interface StageRaceActivityInput {
  activityId: string;
  target: RunningRaceTarget;
  maximalEffortAttested: true;
  expectedActivityIncarnation: string;
  expectedMetricsRevision: string;
  expectedPreferenceRevision: number;
}
export interface StageRaceManualInput {
  id: string;
  target: RunningRaceTarget;
  elapsedSeconds: number;
  occurredAt: number;
  maximalEffortAttested: true;
}
export interface StageRaceEstimateInputs {
  activities: StageRaceActivityInput[];
  manualRaces: StageRaceManualInput[];
  typicalMileage?: {
    value: number;
    unit: "miles_per_week" | "km_per_week";
    attestedTypicalTraining: true;
  };
}
export type StageRaceEstimateRequest =
  | ({ mode: "preview" } & StageRaceEstimateInputs)
  | ({ mode: "save_snapshot"; idempotencyKey: string } & StageRaceEstimateInputs)
  | { mode: "history_page"; windowMonths: 1 | 3 | 6; cursor?: string };

export interface StageRaceSourceWitness {
  activityId: string;
  target: RunningRaceTarget;
  activityIncarnation: string;
  activityRevision: string;
  metricsRevision: string;
  preferenceRevision: number;
  preferenceDocumentRevision: string;
  qualification: "producer_elapsed_axis_v2" | "unavailable";
  originalSensorClock: "not_independently_verified";
  reason: "legacy_or_incomplete" | "excluded" | null;
}
export interface StageRaceEstimateSnapshot {
  version: 1;
  scope: "stage_only_race_estimate";
  snapshotId: string | null;
  asOf: number;
  estimates: RunningRaceEstimate[];
  inputs: StageRaceEstimateInputs;
  typicalMileage: TypicalRunningMileage | null;
  sourceWitnesses: StageRaceSourceWitness[];
  domainPolicy: "adjusted_training_bounds_applied_to_raw_inputs_not_raw_endpoint_validation";
}
export type StageRaceEstimateResponse =
  | { mode: "preview"; snapshot: StageRaceEstimateSnapshot }
  | { mode: "save_snapshot"; snapshot: StageRaceEstimateSnapshot;
      outcome: "stored_source_checked" | "stored_source_unverified" | "idempotent_historical_replay" }
  | { mode: "history_page"; windowMonths: 1 | 3 | 6; windowDays: 30 | 90 | 180;
      scope: "latest_64_actual_snapshots_within_180_days"; registryRevision: string;
      snapshots: Array<{ snapshot: StageRaceEstimateSnapshot; sourceValidity: "unchanged" | "changed_or_unavailable" }>;
      nextCursor: string | null; capped: boolean };
