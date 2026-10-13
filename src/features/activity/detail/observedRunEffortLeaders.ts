import { RUN_DISTANCES, type RunDistanceKey } from "@shared/types/personal-records";
import type { PeriodRunningEvidence } from "@shared/types/training-analysis-periods";

/** 이미 받은 최대 200개 대표 활동에서 명시된 경과 기록만 정렬한다. */
export function observedRunEffortLeaders(evidence: PeriodRunningEvidence | undefined, distance: RunDistanceKey) {
  if (evidence?.version !== 1 || evidence.scope !== "observed_representatives" || evidence.timingBasis !== "elapsed_including_stops") return [];
  const records = evidence.activities.slice(0, 200).flatMap(activity => {
    if (!activity.activityId || !activity.metricsRevision || !Number.isFinite(activity.startTime) || activity.startTime < 0 || activity.distanceRecords.length > 5
      || activity.distanceRecords.some(record => !RUN_DISTANCES.includes(record.distance) || !Number.isFinite(record.elapsedSec) || record.elapsedSec <= 0)
      || new Set(activity.distanceRecords.map(record => record.distance)).size !== activity.distanceRecords.length) return [];
    const record = activity.distanceRecords.find(record => record.distance === distance);
    return record ? [{ activityId: activity.activityId, metricsRevision: activity.metricsRevision, startTime: activity.startTime, elapsedSec: record.elapsedSec }] : [];
  }).sort((a, b) => a.elapsedSec - b.elapsedSec || b.startTime - a.startTime || (a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0));
  const seen = new Set<string>();
  return records.filter(record => { if (seen.has(record.activityId)) return false; seen.add(record.activityId); return true; }).slice(0, 3);
}

interface ObservedMedianSample {
  key: string | number;
  median: number;
  count: number;
  basis: string | undefined;
  timingBasis: string | undefined;
  unit: string | undefined;
}
/** 같은 정본 거리·관측 시간 및 생산 기준의 표본 중앙값만 연결한다. */
export function observedMedianDifference(current: ObservedMedianSample | undefined, previous: ObservedMedianSample | undefined, imperial = false) {
  if (!current || !previous || current.key !== previous.key || !current.basis || current.basis !== previous.basis || !current.timingBasis || current.timingBasis !== previous.timingBasis || current.unit !== previous.unit
    || (current.unit !== "seconds" && current.unit !== "sec_per_km")
    || [current, previous].some(sample => !Number.isFinite(sample.median) || sample.median <= 0 || !Number.isInteger(sample.count) || sample.count <= 0 || sample.count > 200)) return null;
  const deltaSeconds = (current.median - previous.median) * (imperial && current.unit === "sec_per_km" ? 1.609344 : 1);
  return { deltaSeconds, previousCount: previous.count, currentCount: current.count };
}
