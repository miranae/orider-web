import type { PdcPowerSource } from "./pdc";

export interface PowerCurvePeriod {
  /** Epoch ms, inclusive. Calendar boundaries are chosen by the caller. */
  fromInclusive: number;
  /** Epoch ms, exclusive; must not be in the future. */
  toExclusive: number;
}
export interface PowerCurvePeriodsRequest {
  unit: "W";
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
export interface PowerCurvePeriodResult extends PowerCurvePeriod {
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
