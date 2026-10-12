/** 기록 자격은 서버가 준비하거나 사용자가 명시적으로 입력한다. 공개 API 요청 DTO가 아니다. */
export interface RunningRaceSource {
  sourceId: string;
  distanceMeters: number;
  elapsedSeconds: number;
  occurredAt: number;
  maximalEffortAttested: boolean;
  provenance: "trusted_server_elapsed" | "user_supplied_race";
  timeBasis: "elapsed_including_stops" | "user_supplied_race_time";
  distanceQualified: boolean;
  clockVerified: boolean;
  excluded: boolean;
  deleted: boolean;
  supported: boolean;
  metricsRevision?: string;
  incarnation?: string;
  preferencesRevision?: string;
}

export interface TypicalRunningMileage {
  value: number;
  unit: "miles_per_week" | "km_per_week";
  basis: "self_reported_typical_pre_marathon_training";
  statedAt: number;
}

export type RunningRaceTarget = "5k" | "10k" | "half" | "marathon";
export type RunningRaceUnavailableReason =
  | "invalid_input" | "too_many_sources" | "no_qualified_source"
  | "missing_typical_mileage" | "unsupported_mileage_basis"
  | "invalid_typical_mileage" | "outside_model_domain" | "non_finite_result";

export interface RunningRaceEstimate {
  target: RunningRaceTarget;
  distanceMeters: number;
  asOf: number | null;
  status: "historical_reference" | "estimate" | "unavailable";
  elapsedSeconds: number | null;
  reason: RunningRaceUnavailableReason | null;
  method: "same_distance_reference_v1" | "riegel_race_equivalent_1_07_v1"
    | "vickers_one_race_raw_mileage_v1" | null;
  source: RunningRaceSource | null;
  typicalMileageMilesPerWeek: number | null;
  accuracy: "not_validated_for_orider";
  assumptions: readonly string[];
  policyVersion: "qualified_race_equivalent_v1";
}

export interface RunningRaceEstimatesInput {
  asOf: number;
  sources: readonly RunningRaceSource[];
  typicalMileage?: TypicalRunningMileage | null;
}
