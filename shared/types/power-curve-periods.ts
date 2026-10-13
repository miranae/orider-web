import type { ObservedPeriodPowerDurationPoint, PowerDurationPeriodObservations } from "./power-duration-periods";
import type { PdcPowerSource } from "./pdc";

export interface PowerCurvePeriod {
  /** Epoch ms, inclusive. Calendar boundaries are chosen by the caller. */
  fromInclusive: number;
  /** Epoch ms, exclusive; must not be in the future. */
  toExclusive: number;
}
export interface PowerCurvePeriodsRequest {
  unit: "W";
  /** 저장된 계산 당시 프로필 체중만 사용한다. 활동 당시 체중은 주장하지 않는다. */
  includeWeightNormalized?: boolean;
  periods: PowerCurvePeriod[];
}
export interface PeriodPowerPoint {
  durationSeconds: number;
  watts: number;
  sourceActivityId: string;
  startTime: number;
  source: PdcPowerSource;
  cohortEligible: boolean;
  /** Persisted document updateTime, retaining nanoseconds. */
  metricsRevision: string;
}
export interface PowerCurvePeriodCoverage {
  scannedActivityCount: number;
  /** Count of active cycling candidates among the scanned documents. */
  candidateActivityCount: number;
  /** False when truncation prevents knowing the entire period candidate count. */
  candidateCountKnown: boolean;
  includedActivityCount: number;
  pendingActivityCount: number;
  missingActivityCount: number;
  incompleteActivityCount: number;
  ineligibleActivityCount: number;
  skippedActivityCount: number;
  truncated: boolean;
  scanLimit: number;
}
export interface CalculationWeightCounts {
  includedActivityCount: number;
  missingWeightActivityCount: number;
  invalidWeightActivityCount: number;
  incompatibleWeightActivityCount: number;
}
export interface WeightNormalizedPowerPoint extends PeriodPowerPoint {
  wattsPerKg: number;
  weightKg: number;
  weightRevision: string;
}
export interface WeightNormalizedDurationPoint extends ObservedPeriodPowerDurationPoint {
  maxAveragePowerWPerKg: number;
  weightKg: number;
  weightRevision: string;
}
export interface WeightNormalizedDurationObservations extends Omit<PowerDurationPeriodObservations, "points"> {
  unit: "W/kg";
  basis: "calculation_profile_snapshot";
  weightCounts: CalculationWeightCounts;
  points: WeightNormalizedDurationPoint[];
}
export interface WeightNormalizedPowerPeriod {
  unit: "W/kg";
  basis: "calculation_profile_snapshot";
  status: "complete" | "partial";
  coverage: PowerCurvePeriodCoverage;
  weightCounts: CalculationWeightCounts;
  points: WeightNormalizedPowerPoint[];
  powerDurationObservations?: WeightNormalizedDurationObservations;
}
export interface PowerCurvePeriodResult extends PowerCurvePeriod {
  weightNormalized?: WeightNormalizedPowerPeriod;
  /** Optional fixed-grid observations from the same scanned candidates; old 11 points remain unchanged. */
  powerDurationObservations?: PowerDurationPeriodObservations;
  status: "complete" | "partial";
  /** When partial, points are maxima of included records only, not period bests. */
  points: PeriodPowerPoint[];
  coverage: PowerCurvePeriodCoverage;
}
export interface PowerCurvePeriodsResponse {
  version: 1;
  discipline: "bike";
  unit: "W";
  /** Consistent Firestore transaction snapshot readTime, not activity cutoff time. */
  asOf: number;
  inputDigest: string;
  periods: PowerCurvePeriodResult[];
}
