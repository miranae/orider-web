import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { activitySensorOrigin } from "./activitySensorOrigin";
import { buildSummaryStats, getAvailableOverlays } from "./activityDetailDerived";
import type { SampledPoint } from "./activityDetailUtils";
import { runningCadenceSpm } from "../../../utils/runningCadence";
import { formatPace, type Units } from "../../../utils/units";

/** 관측 속도를 러닝 표시 단위로만 변환한다. 정지·결측은 페이스 선의 공백으로 남긴다. */
export function getPerformanceOverlays(
  sampled: SampledPoint[], sport: string, units: Units,
  cadenceUnit: Parameters<typeof runningCadenceSpm>[1], unknownCadenceLabel: string,
) {
  return getAvailableOverlays(sampled).map(cfg => {
    if (sport !== "run") return cfg;
    if (cfg.key === "speed") return {
      ...cfg, label: "pace", unit: units === "imperial" ? "min/mi" : "min/km", reverseAxis: true,
      formatValue: (minutes: number) => formatPace(minutes * 60, "metric").split("/")[0]!,
      getValue: (point: SampledPoint) => Number.isFinite(point.speed) && point.speed > 0
        ? 60 / point.speed * (units === "imperial" ? 1.609344 : 1) : null,
    };
    if (cfg.key === "cadence") return {
      ...cfg, unit: cadenceUnit == null ? unknownCadenceLabel : "spm",
      getValue: (point: SampledPoint) => cadenceUnit == null ? point.cadence : runningCadenceSpm(point.cadence, cadenceUnit),
    };
    return cfg;
  });
}


export function canonicalActivityChartMetrics(activity: Activity | null, metrics: Partial<ActivityMetrics> | null | undefined, overridden = false) {
  const p = activity?.activityPresentationV1;
  return !overridden && activitySensorOrigin(activity) != null && metrics?.version != null && metrics.version >= 41
    && p?.metricsVersion === metrics.version && p.computedAt === metrics.computedAt ? metrics : null;
}

/** A privacy-reduced maximum must not discard an available canonical average. */
export function withCanonicalChartSummary(observed: ReturnType<typeof buildSummaryStats>, metrics: Partial<ActivityMetrics> | null) {
  if (!observed || !metrics) return observed;
  const overlays = { ...observed.overlays };
  for (const [key, avg, max] of [["speed", metrics.avgSpeedKph, metrics.maxSpeedKph],
    ["power", metrics.avgPower, metrics.maxPower], ["hr", metrics.avgHr, metrics.maxHr],
    ["cadence", metrics.avgCadence, metrics.maxCadence]] as const) {
    const previous = overlays[key];
    if (!previous) continue;
    overlays[key] = { avg: typeof avg === "number" && Number.isFinite(avg) ? avg : previous.avg,
      max: typeof max === "number" && Number.isFinite(max) ? max : previous.max };
  }
  return { ...observed, overlays };
}
