import { BIKE_DISTANCE_TARGETS, BIKE_DISTANCE_M } from "@shared/activity-bike-distance-evidence";
import type { CyclingDistancePeriodAnalysis, PeriodRunSource, TrainingAnalysisPeriodResult } from "@shared/types/training-analysis-periods";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: unknown, keys: string[]) => object(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
/** 배열의 빈 슬롯이나 prototype의 요소를 DTO 실요소로 받지 않는다. */
function dense(value: unknown, max: number): boolean {
  if (!Array.isArray(value) || value.length > max) return false;
  for (let index = 0; index < value.length; index++) if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  return true;
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const positive = (value: unknown): value is number => count(value) && Number(value) > 0;
export const compareCyclingSources = (a: PeriodRunSource & { elapsedSec: number }, b: PeriodRunSource & { elapsedSec: number }) => a.elapsedSec - b.elapsedSec || b.startTime - a.startTime || a.sourceActivityId.localeCompare(b.sourceActivityId);
export function validCyclingDistanceAnalysis(value: unknown, period: TrainingAnalysisPeriodResult): value is CyclingDistancePeriodAnalysis {
  if (!period?.coverage || !Array.isArray(period.activities)) return false;
  if (!exact(value, ["version", "targetsVersion", "timingBasis", "scope", "quality", "coverage", "distances"])) return false;
  const a = value as CyclingDistancePeriodAnalysis;
  if (a.version !== 1 || a.targetsVersion !== 1 || a.timingBasis !== "original_activity_elapsed" || a.scope !== "observed_representatives" || a.quality !== "unknown" || a.coverage !== "unknown" || !dense(a.distances, 13) || a.distances.length !== 13 || new Set(a.distances.map(d => d?.distance)).size !== 13) return false;
  return a.distances.every((d, distanceIndex) => {
    if (!exact(d, ["distance", "distanceM", "candidateActivityCount", "supportedActivityCount", "observedEffortActivityCount", "noObservedEffortActivityCount", "unsupportedActivityCount", "unavailableActivityCount", "truncated", "bestTimeSeconds", "medianTimeSeconds", "sources"]) || d.distance !== BIKE_DISTANCE_TARGETS[distanceIndex] || d.distanceM !== BIKE_DISTANCE_M[d.distance]
      || ![d.candidateActivityCount, d.supportedActivityCount, d.observedEffortActivityCount, d.noObservedEffortActivityCount, d.unsupportedActivityCount, d.unavailableActivityCount].every(count)
      || (["supportedActivityCount", "unsupportedActivityCount", "unavailableActivityCount"] as const).some(key => d[key] !== a.distances[0]![key])
      || d.supportedActivityCount + d.unsupportedActivityCount > period.coverage.includedActivityCount
      || d.candidateActivityCount !== period.coverage.representativeActivityCount || d.truncated !== period.coverage.truncated
      || d.supportedActivityCount !== d.observedEffortActivityCount + d.noObservedEffortActivityCount || d.candidateActivityCount !== d.supportedActivityCount + d.unsupportedActivityCount + d.unavailableActivityCount
      || !dense(d.sources, 200) || d.sources.length !== d.observedEffortActivityCount || new Set(d.sources.map(s => s?.sourceActivityId)).size !== d.sources.length) return false;
    if (!d.sources.every((s, index) => exact(s, ["sourceActivityId", "startTime", "metricsRevision", "contributingActivityCount", "elapsedSec"]) && typeof s.sourceActivityId === "string" && !!s.sourceActivityId && count(s.startTime) && s.startTime >= period.fromInclusive && s.startTime < period.toExclusive && positive(s.elapsedSec) && s.contributingActivityCount === 1 && typeof s.metricsRevision === "string" && /^\d+:\d+$/u.test(s.metricsRevision) && period.activities.some(row => row.activityId === s.sourceActivityId && row.startTime === s.startTime) && (index === 0 || compareCyclingSources(d.sources[index - 1]!, s) <= 0))) return false;
    const times = d.sources.map(s => s.elapsedSec).sort((x, y) => x - y), middle = Math.floor(times.length / 2);
    if (!times.length) return d.bestTimeSeconds === null && d.medianTimeSeconds === null;
    const median = times.length % 2 ? times[middle]! : times[middle - 1]! / 2 + times[middle]! / 2;
    return d.bestTimeSeconds === times[0]! && d.medianTimeSeconds === median;
  });
}
