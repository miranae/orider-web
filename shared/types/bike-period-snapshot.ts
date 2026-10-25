import type { PowerCurvePeriod, PowerCurvePeriodResult } from "./power-curve-periods";
import type { PeriodObservedTotal, PeriodZoneCoverage, PeriodHrZoneGroup, PeriodPowerZoneGroup } from "./training-analysis-periods";
/** Full enumeration at T; scanLimit from the legacy one-shot API is deliberately absent. */
export type BikeSnapshotPowerResult = Omit<PowerCurvePeriodResult, "coverage" | "weightNormalized"> & {
  coverage: Omit<PowerCurvePeriodResult["coverage"], "scanLimit">;
  weightNormalized?: Omit<NonNullable<PowerCurvePeriodResult["weightNormalized"]>, "coverage"> & {
    coverage: Omit<PowerCurvePeriodResult["coverage"], "scanLimit">;
  };
};
export interface BikePeriodSnapshotRequest {
  action: "start" | "advance" | "status" | "zones";
  period: PowerCurvePeriod;
  runId?: string;
  expectedVersion?: number;
  afterZone?: string;
}
export interface BikePeriodSnapshotResponse {
  runId: string; version: number;
  state: "scanning" | "identity" | "flattening" | "selecting" | "aggregating" | "complete" | "invalidated" | "expired";
  asOf: number; expiresAt: number; period: PowerCurvePeriod;
  scope: "owner_canonical_records_at_snapshot";
  scanned: number; candidates: number; representatives: number;
  sourceFreshness: "checked_at_each_step_not_continuously_current";
  result: null | {
    totals: Record<"distanceM" | "movingTimeSec" | "elevationGainM", PeriodObservedTotal>;
    /** Both totals.sourceActivityIds and zone group.activityIds are bounded examples, not complete lists. */
    sourceExamplesLimit: 20;
    pageSize: 20;
    heartRate: PeriodZoneCoverage; powerZones: PeriodZoneCoverage;
    power: BikeSnapshotPowerResult;
  };
  zoneGroups: Array<{ id: string; kind: "heartRate"; group: PeriodHrZoneGroup } | { id: string; kind: "power"; group: PeriodPowerZoneGroup }>;
  nextZone: string | null;
}
