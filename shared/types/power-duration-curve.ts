/** 고정 지속시간에서 관측 interval의 시간가중 최대 파워. 임의 지속시간/보간 곡선이 아니다. */
export type MeasuredPowerDurationSource = "strava_api" | "direct_file" | "orider_native";

interface PowerDurationCurveBase {
  algorithmVersion: "power-duration-grid-v1";
  gridVersion: 1;
  timingBasis: "sample_owned_elapsed";
}

export type PowerDurationCurve = PowerDurationCurveBase & (
  | {
    state: "available";
    reason: null;
    provenance: MeasuredPowerDurationSource;
    measuredSeconds: number;
    longestContinuousSeconds: number;
    inputPointCount: number;
    points: Array<{ durationSeconds: number; maxAveragePowerW: number }>;
  }
  | {
    state: "unavailable";
    reason: "incomplete_input" | "virtual_power" | "unknown_provenance" | "unaligned_elapsed_axis" | "missing_power" | "input_limit";
  }
);
