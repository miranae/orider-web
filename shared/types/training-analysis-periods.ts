import type { HrZoneBoundaries } from "../training/hrZoneTable";
import type { PowerCurvePeriod } from "./power-curve-periods";

export interface TrainingAnalysisPeriodsRequest {
  discipline: "bike" | "run" | "swim";
  periods: PowerCurvePeriod[];
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
export interface TrainingAnalysisPeriodResult extends PowerCurvePeriod {
  status: "complete" | "partial";
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
  zones: {
    /** Groups have distinct recorded boundaries; never treat them as one fixed threshold. */
    heartRate: PeriodZoneCoverage & { groups: PeriodHrZoneGroup[] };
    power: PeriodZoneCoverage & { groups: PeriodPowerZoneGroup[]; reason: "recorded_ftp" | "not_applicable" };
    pace: { status: "unavailable"; reason: "canonical_pace_zones_unavailable" };
  };
}
export interface TrainingAnalysisPeriodsResponse {
  version: 1;
  discipline: TrainingAnalysisPeriodsRequest["discipline"];
  asOf: number;
  inputDigest: string;
  periods: TrainingAnalysisPeriodResult[];
}
