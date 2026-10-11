import { RUN_DISTANCES, RUN_DISTANCE_TARGETS_V2, RUN_DISTANCE_TARGET_M_V2, type ExpandedRunDistanceKey } from "@shared/types/personal-records";
import type { ExpandedRunDistanceAnalysis, ExpandedRunDistanceRecords, TrainingAnalysisPeriodResult } from "@shared/types/training-analysis-periods";
import type { TrainingAnalysisHistoryRow } from "@shared/types/training-analysis-history";
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
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-9;
export const isLegacyRunDistance = (distance: ExpandedRunDistanceKey) => RUN_DISTANCES.some(key => key === distance);
export function validExpandedDistanceRecords(value: unknown, ready: boolean): value is ExpandedRunDistanceRecords {
  if (!exact(value, ["version", "targetsVersion", "timingBasis", "state", "points"])) return false;
  const r = value as ExpandedRunDistanceRecords;
  return r.version === 1 && r.targetsVersion === 2 && r.timingBasis === "elapsed_including_stops"
    && ["observed", "no_observed_efforts", "legacy_unsupported", "unavailable"].includes(r.state)
    && (ready || r.state === "unavailable") && dense(r.points, 14)
    && (r.state === "observed" ? r.points.length > 0 : r.points.length === 0)
    && new Set(r.points.map(point => point?.distance)).size === r.points.length
    && r.points.every(point => exact(point, ["distance", "elapsedSec"]) && RUN_DISTANCE_TARGETS_V2.includes(point.distance) && positive(point.elapsedSec));
}
export function validExpandedDistanceAnalysis(value: unknown, period: TrainingAnalysisPeriodResult): value is ExpandedRunDistanceAnalysis {
  if (!exact(value, ["version", "targetsVersion", "timingBasis", "scope", "distances"])) return false;
  const a = value as ExpandedRunDistanceAnalysis;
  if (a.version !== 1 || a.targetsVersion !== 2 || a.timingBasis !== "elapsed_including_stops" || a.scope !== "observed_representatives" || !dense(a.distances, 14) || a.distances.length !== 14 || new Set(a.distances.map(d => d?.distance)).size !== 14) return false;
  return a.distances.every(d => {
    if (!exact(d, ["distance", "distanceM", "candidateActivityCount", "supportedActivityCount", "observedEffortActivityCount", "noObservedEffortActivityCount", "unsupportedActivityCount", "unavailableActivityCount", "truncated", "bestTimeSeconds", "medianTimeSeconds", "sources"]) || !RUN_DISTANCE_TARGETS_V2.includes(d.distance) || d.distanceM !== RUN_DISTANCE_TARGET_M_V2[d.distance]
      || ![d.candidateActivityCount, d.supportedActivityCount, d.observedEffortActivityCount, d.noObservedEffortActivityCount, d.unsupportedActivityCount, d.unavailableActivityCount].every(count)
      || (["supportedActivityCount", "unsupportedActivityCount", "unavailableActivityCount"] as const).some(key => d[key] !== a.distances[0]![key])
      || d.candidateActivityCount !== period.coverage.representativeActivityCount || d.truncated !== period.coverage.truncated
      || d.supportedActivityCount !== d.observedEffortActivityCount + d.noObservedEffortActivityCount || d.candidateActivityCount !== d.supportedActivityCount + d.unsupportedActivityCount + d.unavailableActivityCount
      || !dense(d.sources, 200) || d.sources.length !== d.observedEffortActivityCount || new Set(d.sources.map(s => s?.sourceActivityId)).size !== d.sources.length) return false;
    if (!d.sources.every(s => exact(s, ["sourceActivityId", "startTime", "metricsRevision", "contributingActivityCount", "elapsedSec"]) && positive(s.elapsedSec) && s.contributingActivityCount === 1 && typeof s.metricsRevision === "string" && /^\d+:\d+$/u.test(s.metricsRevision) && period.activities.some(row => row.activityId === s.sourceActivityId && row.startTime === s.startTime))) return false;
    const times = d.sources.map(s => s.elapsedSec).sort((x, y) => x - y), middle = Math.floor(times.length / 2);
    if (!times.length) return d.bestTimeSeconds === null && d.medianTimeSeconds === null;
    const median = times.length % 2 ? times[middle]! : times[middle - 1]! / 2 + times[middle]! / 2;
    return typeof d.bestTimeSeconds === "number" && near(d.bestTimeSeconds, times[0]!) && typeof d.medianTimeSeconds === "number" && near(d.medianTimeSeconds, median);
  });
}
/** 기존 대표 선택을 마친 행만 센다. 이전 계약의 결측을 미관측으로 바꾸지 않는다. */
export function expandedAnnualCoverage(rows: TrainingAnalysisHistoryRow[], distance: ExpandedRunDistanceKey) {
  let supported = 0, observed = 0, unsupported = 0, unavailable = 0;
  for (const row of rows) {
    const channel = row.expandedDistanceRecords;
    if (row.analysis.state !== "ready" || channel?.state === "unavailable") unavailable++;
    else if (!channel || channel.state === "legacy_unsupported") unsupported++;
    else { supported++; if (channel.points.some(point => point.distance === distance)) observed++; }
  }
  return { candidate: rows.length, supported, observed, noObserved: supported - observed, unsupported, unavailable };
}
