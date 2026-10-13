import type { HrZoneBoundaries } from "../training/hrZoneTable";

/** Owner-only read contract. Selection is elapsed seconds, start-inclusive/end-exclusive. */
export interface ActivityRangeAnalysisRequest {
  activityId: string;
  startOffsetSec: number;
  endOffsetSec: number;
  expectedInputRevision?: string;
  /** true일 때만 기존 소유자 파워 입력을 반환한다. */
  includePowerWindowInput?: boolean;
  /** 저장된 epoch 파트 표본의 순고도·경사만 선택적으로 읽는다. */
  includeElevation?: true;
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
  powerWindowInput?: ActivityPowerWindowInput;
  elevation?: ActivityRangeElevation;
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
  context: { mode: "recorded" | "unavailable"; ftp: number | null; maxHr: number | null;
    /** Historical thresholds and the exact canonical HR boundaries used for these zones. */
    lthr?: number | null; hrZoneBoundaries?: HrZoneBoundaries | null };
}

/** 동적 시간 창 계산용. 정지 시간을 압축하지 않은 관측 구간이며 결측 구간을 넘지 않는다. */
export type ActivityPowerWindowInput = {
  inputRevision: string;
  algorithmVersion: "sample-time-weighted-v1";
  scope: "selected_range";
  rangeStartElapsedSec: number;
  rangeEndElapsedSec: number;
  timingBasis: "elapsed";
} & ({
  state: "available";
  reason: null;
  provenance: "strava_api" | "direct_file" | "orider_native";
  startsSec: number[];
  durationsSec: number[];
  watts: number[];
  segmentStarts: boolean[];
  longestContinuousSeconds: number;
} | {
  state: "unavailable";
  reason: "virtual_power" | "unknown_provenance" | "unaligned_elapsed_axis" | "missing_power" | "input_limit";
});

/** 요청 전체의 상승량이 아닌 실제 관측 표본 양 끝의 차이다. */
export type ActivityRangeElevation = {
  scope: "selected_observed_range";
  quality: "unknown";
  timingBasis: "stored_explicit_activity_elapsed";
  originalClockVerified: false;
  declaredActivitySource: "orider" | "strava" | "apple_health" | "health_connect" | null;
  inputRevision: string | null;
  requestedSelection: { startOffsetSec: number; endOffsetSec: number };
} & ({
  state: "available";
  reason: null;
  sourceBasis: "stored_epoch_parts";
  observedSelection: { startOffsetSec: number; endOffsetSec: number };
  boundaryCoverage: "exact" | "inside_samples";
  netElevationChangeM: number;
  distanceM: number;
  netMeanGradePct: number | null;
} | {
  state: "unavailable";
  reason: "input_unavailable" | "unsupported_source" | "incomplete_input" | "invalid_clock" | "invalid_axis" | "missing_samples" | "internal_gap" | "invalid_arithmetic";
});
