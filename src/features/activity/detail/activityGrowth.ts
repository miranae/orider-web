import type { Activity } from "@shared/types";
import { getDiscipline } from "../../../utils/disciplineFilter";
import { seoulWeekStartMs } from "../../../utils/seoulWeek";
import { powerCurvePoints, speedCurvePoints, type MetricsLike } from "./metricsPresentation";

const DAY = 86400000;
const KST = 9 * 3600000;
export function knownNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
export function sameActivitySport(left: Activity, right: Activity): boolean {
  const discipline = getDiscipline(left.type);
  return discipline ? discipline === getDiscipline(right.type) : left.type === right.type;
}
export function settledMetrics(metrics: MetricsLike | null): boolean {
  return metrics != null && metrics.inputPending !== true && metrics.inputCoverage !== "pending";
}
export function comparisonRows(current: MetricsLike | null, previous: MetricsLike | null, running: boolean) {
  const keys = ["distanceKm", "movingTimeSec", "avgSpeedKph", "avgHr", "avgPower", "np", "elevationGainM"] as const;
  return keys.map((key) => {
    const read = (metrics: MetricsLike | null) => {
      if (!settledMetrics(metrics) || (key === "distanceKm" && metrics?.distanceSource === null)) return null;
      const value = knownNumber(metrics?.[key]);
      return key === "avgSpeedKph" && running ? value != null && value > 0 ? 3600 / value : null : value;
    };
    const value = read(current);
    const baseline = read(previous);
    return { key, value, baseline, delta: value != null && baseline != null && (!(key === "avgPower" || key === "np") || (typeof current?.isVirtualPower === "boolean" && current.isVirtualPower === previous?.isVirtualPower)) ? value - baseline : null };
  });
}
export function comparableCurves(current: MetricsLike, previous: MetricsLike, power: boolean) {
  if (!settledMetrics(current) || !settledMetrics(previous) || (power && (typeof current.isVirtualPower !== "boolean" || current.isVirtualPower !== previous.isVirtualPower))) return [];
  const left = power ? powerCurvePoints(current).map((p) => ({ duration: p.durationSeconds, value: p.maxPower }))
    : speedCurvePoints(current).map((p) => ({ duration: p.durationSeconds, value: p.speedKmh }));
  const right = power ? powerCurvePoints(previous).map((p) => ({ duration: p.durationSeconds, value: p.maxPower }))
    : speedCurvePoints(previous).map((p) => ({ duration: p.durationSeconds, value: p.speedKmh }));
  return left.flatMap((point) => {
    const match = right.find((candidate) => candidate.duration === point.duration);
    return match && knownNumber(point.value) != null && knownNumber(match.value) != null && (power || (point.value > 0 && match.value > 0))
      ? [{ ...point, baseline: match.value, delta: point.value - match.value }] : [];
  });
}
export function activityPeriods(now: number, period: "week" | "month") {
  if (period === "week") {
    const start = seoulWeekStartMs(now);
    return { start, end: Math.min(now + 1, start + 7 * DAY), previousStart: start - 7 * DAY, previousEnd: start };
  }
  const date = new Date(now + KST);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - KST;
  return { start, end: now + 1, previousStart: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1) - KST, previousEnd: start };
}
export function summarizePeriod(activities: Activity[], start: number, end: number, complete: boolean) {
  const sources = activities.filter((activity) => activity.startTime >= start && activity.startTime < end);
  const sum = (read: (activity: Activity) => unknown) => {
    const values = sources.map((activity) => knownNumber(read(activity)));
    return complete && values.every((value) => value != null) ? values.reduce<number>((total, value) => total + value!, 0) : null;
  };
  return {
    sources,
    count: complete ? sources.length : null,
    distance: sum((activity) => activity.summary?.distance),
    movingTime: sum((activity) => activity.summary?.movingTimeSec),
    elevation: sum((activity) => activity.summary?.elevationGain),
  };
}
