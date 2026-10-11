import type { TrainingAnalysisPeriodResult } from "@shared/types/training-analysis-periods";
export type BikeObservedMetric = "distanceM" | "elevationGainM";
export type BikeObservedBasis = "all" | "canonical_metrics" | "activity_summary";
export type BikeObservedActivity = TrainingAnalysisPeriodResult["activities"][number];
/** 응답의 정본 대표 활동만 정렬한다. 중복 ID에 새 대표값을 만들어 주지 않는다. */
export function bikeObservedPeriodRecords(period: TrainingAnalysisPeriodResult, metric: BikeObservedMetric, basis: BikeObservedBasis = "all") {
  const occurrences = new Map<string, number>();
  for (const activity of period.activities) occurrences.set(activity.activityId, (occurrences.get(activity.activityId) ?? 0) + 1);
  const eligible = period.activities.filter(activity => typeof activity.activityId === "string" && !!activity.activityId && !activity.activityId.includes("/")
    && occurrences.get(activity.activityId) === 1 && Number.isFinite(activity.startTime) && activity.startTime >= period.fromInclusive && activity.startTime < period.toExclusive
    && typeof activity[metric] === "number" && Number.isFinite(activity[metric]) && activity[metric]! > 0
    && ["canonical_metrics", "activity_summary"].includes(activity.sourceBasis[metric])
    && (basis === "all" || activity.sourceBasis[metric] === basis));
  const sorted = [...eligible].sort((left, right) => right[metric]! - left[metric]! || right.startTime - left.startTime
    || (left.activityId < right.activityId ? -1 : left.activityId > right.activityId ? 1 : 0));
  return { records: sorted.slice(0, 5), observedCount: sorted.length };
}
