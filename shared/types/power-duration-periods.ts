import type { MeasuredPowerDurationSource, PowerDurationCurve } from "./power-duration-curve";

export interface ObservedPeriodPowerDurationPoint {
  durationSeconds: number;
  maxAveragePowerW: number;
  sourceActivityId: string;
  startTime: number;
  parentRevision: string;
  provenance: MeasuredPowerDurationSource;
  observedActivityCount: number;
}

/** 동일 후보 조회의 관측 집계. 연간/평생 전체 기록을 뜻하지 않는다. */
export interface PowerDurationPeriodObservations {
  algorithmVersion: "power-duration-grid-v1";
  gridVersion: 1;
  timingBasis: "sample_owned_elapsed";
  scope: "observed_power_candidates";
  fromInclusive: number;
  toExclusive: number;
  partial: boolean;
  scanTruncated: boolean;
  inputCandidateCount: number;
  counts: { available: number; missing: number; pending: number; incomplete: number; malformed: number; unavailable: number };
  unavailableReasonCounts: Record<Extract<PowerDurationCurve, { state: "unavailable" }>["reason"], number>;
  points: ObservedPeriodPowerDurationPoint[];
}
