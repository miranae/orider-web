import type { Activity } from "@shared/types";
import type { Units } from "../../../utils/units";
import { isIndoorActivity } from "../../../utils/indoorActivity";
import { knownNumber, sameActivitySport } from "./activityGrowth";
import { formatTime } from "./activityDetailUtils";

export type SimilarRouteMetric = "distance" | "movingTime" | "pauseTime";
export interface SimilarRouteHistoryRow {
  activity: Activity;
  distance: number | null;
  movingTime: number | null;
  pauseTime: number | null;
}
/** 추천된 후보를 표시용으로 정렬한다. 경로 확정·원본 조회·이동시간 재계산을 하지 않는다. */
export function similarRouteHistoryRows(current: Activity, candidates: readonly Activity[]): SimilarRouteHistoryRow[] {
  if (!Number.isFinite(current.startTime) || current.startTime < 0) return [];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id) || candidate.id === current.id || candidate.userId !== current.userId
      || candidate.deletedAt != null || isIndoorActivity(candidate) || !Number.isFinite(candidate.startTime)
      || candidate.startTime < 0 || candidate.startTime >= current.startTime || !sameActivitySport(current, candidate)) return false;
    seen.add(candidate.id);
    return true;
  }).map(similarRouteSummary).sort((left, right) => left.activity.startTime - right.activity.startTime
    || (left.activity.id < right.activity.id ? -1 : left.activity.id > right.activity.id ? 1 : 0));
}
export function similarRouteSummary(activity: Activity): SimilarRouteHistoryRow {
  return { activity, distance: knownNumber(activity.summary?.distance), movingTime: knownNumber(activity.summary?.movingTimeSec), pauseTime: knownNumber(activity.summary?.pauseTimeSec) };
}
export function similarRouteMetricValue(row: SimilarRouteHistoryRow, metric: SimilarRouteMetric, units: Units): number | null {
  const value = row[metric];
  return value == null ? null : metric === "distance" ? value / (units === "imperial" ? 1609.344 : 1000) : value;
}
export function formatSimilarRouteValue(value: number | null, metric: SimilarRouteMetric): string {
  const number = knownNumber(value);
  return number == null ? "—" : metric === "distance" ? number.toFixed(2) : formatTime(Math.round(number) * 1000);
}
