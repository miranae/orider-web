import type { HrZoneBoundaries } from "../training/hrZoneTable";

/** Owner-only read contract. Selection is elapsed seconds, start-inclusive/end-exclusive. */
export interface ActivityRangeAnalysisRequest {
  activityId: string;
  startOffsetSec: number;
  endOffsetSec: number;
  expectedInputRevision?: string;
}
export interface ActivityRangeAnalysisResponse {
  state: "available" | "pending" | "unavailable" | "changed_input";
  activityId: string;
  selection: { startOffsetSec: number; endOffsetSec: number };
  inputRevision: string | null;
  computedAt: number;
  algorithmVersion: "activity-range-v1";
  sourceLayer: "raw_parts" | "api_streams" | null;
  inputCoverage: "complete" | "partial" | "unknown";
  reason: string | null;
  metrics: ActivityRangeMetrics | null;
}
export interface ActivityRangeChannelCoverage {
  measuredSec: number;
  fraction: number;
  reason: "missing" | "unaligned_elapsed_axis" | "invalid_axis" | null;
}
export interface ActivityRangeMetrics {
  elapsedSec: number;
  movingSec: number | null;
  pauseSec: number | null;
  distanceM: number | null;
  avgSpeedKph: number | null;
  speedBasis: "moving_time" | "measured_elapsed" | null;
  paceSecPerKm: number | null;
  averagePowerW: number | null;
  normalizedPowerW: number | null;
  averageHr: number | null;
  maxHr: number | null;
  averageCadence: number | null;
  hrZoneSec: number[] | null;
  powerZoneSec: number[] | null;
  /** Sensor means use measured sample-owned elapsed seconds; HR/cadence omit zero. */
  averageBasis: "measured_elapsed";
  channels: Record<"power" | "heartrate" | "cadence" | "speed", ActivityRangeChannelCoverage>;
  diagnostics: { clippedBoundary: boolean; gaps: boolean; distanceReason: string | null; zonesReason: string };
  powerSource: "measured" | "virtual" | null;
  isVirtualPower: boolean;
  context: { mode: "recorded" | "unavailable"; ftp: number | null; maxHr: number | null; lthr?: number | null; hrZoneBoundaries?: HrZoneBoundaries | null };
}
