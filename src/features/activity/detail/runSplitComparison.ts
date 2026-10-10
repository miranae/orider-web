import { ACTIVITY_METRICS_VERSION, type SplitRow } from "@shared/types/activity-metrics";
import { settledMetrics } from "./activityGrowth";
import type { MetricsLike } from "./metricsPresentation";

const observed = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
/** 서버 정본의 완전 km만 교집합으로 읽는다. 거리/시간 또는 센서를 재계산하지 않는다. */
function completeSplits(metrics: MetricsLike | null): Map<number, SplitRow> {
  const result = new Map<number, SplitRow>();
  if (!settledMetrics(metrics) || !metrics || metrics.inputCoverage !== "complete" || !Number.isSafeInteger(metrics.version) || metrics.version! < ACTIVITY_METRICS_VERSION || metrics.distanceSource === null || !observed(metrics.distanceKm) || !Array.isArray(metrics.splits)) return result;
  const counts = new Map<number, number>();
  for (const split of metrics.splits) if (split) counts.set(split.km, (counts.get(split.km) ?? 0) + 1);
  for (const split of metrics.splits) {
    if (!split || !Number.isInteger(split.km) || split.km <= 0 || split.km > Math.floor(metrics.distanceKm) || counts.get(split.km) !== 1 || !observed(split.paceSec)) continue;
    result.set(split.km, split);
  }
  return result;
}
export function compareRunSplits(current: MetricsLike | null, previous: MetricsLike | null) {
  const left = completeSplits(current), right = completeSplits(previous);
  const read = (split: SplitRow) => ({ pace: split.paceSec,
    heartRate: observed(split.avgHr) ? split.avgHr : null });
  return [...left.entries()].sort(([a], [b]) => a - b).flatMap(([km, split]) => {
    const match = right.get(km);
    return match ? [{ km, current: read(split), previous: read(match) }] : [];
  });
}
