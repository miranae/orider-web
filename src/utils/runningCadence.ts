import type { ActivityMetrics } from "@shared/types/activity-metrics";

/** Strava의 한 발 보폭만 양발 걸음 수로 바꾼다. 값의 크기로 출처를 추측하지 않는다. */
export function runningCadenceSpm(value: number | null | undefined, unit: ActivityMetrics["cadenceUnit"]): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  if (unit === "strides_per_minute") return value * 2;
  return unit === "spm" ? value : null;
}
