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
export type StatisticsPeriod = "week" | "month" | "3months" | "6months" | "12months";
export function activityPeriods(now: number, period: StatisticsPeriod) {
  if (period === "week") {
    const start = seoulWeekStartMs(now);
    return { start, end: Math.min(now + 1, start + 7 * DAY), previousStart: start - 7 * DAY, previousEnd: start };
  }
  const date = new Date(now + KST);
  const months = period === "month" ? 1 : Number.parseInt(period, 10);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months + 1, 1) - KST;
  return { start, end: now + 1, previousStart: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 2 * months + 1, 1) - KST, previousEnd: start };
}
/** 날짜 입력은 KST의 하루 전체를 뜻한다. 직전 비교는 동일한 일수이며 미래 날짜는 거부한다. */
export function customActivityPeriods(from: string, to: string, now: number) {
  const parse = (input: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
    const time = Date.parse(`${input}T00:00:00+09:00`);
    return Number.isFinite(time) && new Date(time + KST).toISOString().slice(0, 10) === input ? time : null;
  };
  const start = parse(from), last = parse(to);
  const today = Math.floor((now + KST) / DAY) * DAY - KST;
  if (start == null || last == null || start < 0 || last < start || last > today || last - start >= 366 * DAY) return null;
  const width = last + DAY - start;
  if (start - width < 0) return null;
  return { start, end: Math.min(last + DAY, now + 1), previousStart: start - width, previousEnd: start };
}
export function summarizePeriod(activities: Activity[], start: number, end: number, complete: boolean) {
  const sources = activities.filter((activity) => activity.startTime >= start && activity.startTime < end);
  const coverage = (read: (activity: Activity) => unknown) => {
    const values = sources.map((activity) => knownNumber(read(activity)));
    const known = values.filter((value): value is number => value != null);
    return {
      total: complete && known.length === sources.length ? known.reduce((sum, value) => sum + value, 0) : null,
      observed: complete && known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null,
      knownCount: complete ? known.length : null,
      missingCount: complete ? sources.length - known.length : null,
    };
  };
  const fields = {
    distance: coverage((activity) => activity.summary?.distance),
    // 경과시간(ridingTimeMillis)을 이동시간으로 대체하지 않는다.
    movingTime: coverage((activity) => activity.summary?.movingTimeSec),
    elevation: coverage((activity) => activity.summary?.elevationGain),
  };
  return {
    sources,
    count: complete ? sources.length : null,
    distance: fields.distance.total,
    movingTime: fields.movingTime.total,
    elevation: fields.elevation.total,
    fields,
  };
}
