import { formatElapsedBoundary } from "./activityRangeSelection";
import { formatDistance } from "../../../utils/units";
import type { BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { CyclingDistanceHistoryResponse, CyclingDistanceHistoryRow } from "@shared/types/training-cycling-distance-history";
import { groupSamePhysicalRides, pickPhysicalRideRepresentative } from "../../../utils/samePhysicalRide";
import { CYCLING_HISTORY_CAP } from "../../../services/trainingCyclingDistanceHistory";
/** 전역 출처 우선순위는 유지한다. 이 채널은 명시적 ID 관계로만 중복을 묶는다. */
export function cyclingDistanceHistory(pages: CyclingDistanceHistoryResponse[]) {
  const rows = pages.flatMap(page => page.activities), scanned = pages.reduce((sum, page) => sum + page.page.scannedActivityCount, 0);
  if (new Set(rows.map(row => row.activityId)).size !== rows.length) throw new Error("history_repeated_activity");
  if (scanned > CYCLING_HISTORY_CAP || rows.length > CYCLING_HISTORY_CAP) throw new Error("history_memory_cap");
  const groups = groupSamePhysicalRides(rows.map(row => ({ id: row.activityId, source: row.representativeInput.source, localSessionId: row.representativeInput.localSessionId,
    stravaActivityId: row.representativeInput.stravaActivityId, stravaTwinActivityId: row.representativeInput.stravaTwinActivityId,
    movingSec: row.representativeInput.movingSec, hasLoad: row.representativeInput.hasLoad, row })));
  const representatives = groups.map(group => pickPhysicalRideRepresentative(group).row);
  return { rows, scanned, candidateCount: rows.length, groups, representatives, duplicateCount: rows.length - groups.length,
    scanComplete: pages.length > 0 && !!pages[pages.length - 1]?.page.exhausted, capped: scanned >= CYCLING_HISTORY_CAP && !pages[pages.length - 1]?.page.exhausted,
    skipped: pages.reduce((sum, page) => sum + page.page.skippedActivityCount, 0),
    states: Object.fromEntries(["ready", "missing", "pending", "stale", "outdated", "partial", "invalid"].map(state => [state, rows.filter(row => row.analysis.state === state).length])) };
}
export function cyclingDistanceHistoryLeaders(summary: ReturnType<typeof cyclingDistanceHistory>, distance: BikeDistanceKey, limit: 5 | 10) {
  let noObserved = 0, unsupported = 0, unavailable = 0;
  const sources: Array<CyclingDistanceHistoryRow & { elapsedSec: number; canonicalActivityId: string }> = [];
  for (const group of summary.groups) {
    const qualified = group.filter(value => value.row.analysis.state === "ready" && value.row.metricsRevision !== null
      && value.row.distanceObservations.state === "observed" && value.row.distanceObservations.points.some(point => point.distance === distance));
    if (qualified.length) {
      const source = pickPhysicalRideRepresentative(qualified).row, canonical = pickPhysicalRideRepresentative(group).row;
      sources.push({ ...source, elapsedSec: source.distanceObservations.points.find(point => point.distance === distance)!.elapsedSec, canonicalActivityId: canonical.activityId });
    } else if (group.some(value => value.row.analysis.state === "ready" && ["observed", "no_observed_efforts"].includes(value.row.distanceObservations.state))) noObserved++;
    else if (group.some(value => value.row.distanceObservations.state === "legacy_unsupported")) unsupported++;
    else unavailable++;
  }
  sources.sort((a, b) => a.elapsedSec - b.elapsedSec || b.startTime - a.startTime || (a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0));
  return { sources: sources.slice(0, limit), allSources: sources, observed: sources.length, noObserved, unsupported, unavailable,
    underlyingSourceCount: sources.filter(row => row.activityId !== row.canonicalActivityId).length };
}

/** 수신한 적격 원본의 실제 날짜 간격만 배치한다. 미관측값을 보간하지 않는다. */
export function cyclingDistanceHistoryTrend<T extends CyclingDistanceHistoryRow>(sources: readonly T[], valueOf: (source: T) => number) {
  const ordered = [...sources].sort((a, b) => a.startTime - b.startTime || (a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0));
  if (ordered.length > CYCLING_HISTORY_CAP || ordered.some(row => !Number.isSafeInteger(row.startTime) || row.startTime < 0 || !Number.isFinite(new Date(row.startTime).getTime()) )) throw new Error("invalid_cycling_history_trend");
  if (!ordered.length) return { points: [], minimum: null, maximum: null };
  const first = ordered[0]!.startTime, last = ordered[ordered.length - 1]!.startTime;
  const values = ordered.map(valueOf);
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error("invalid_cycling_history_trend");
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const points = ordered.map((source, index) => ({ source, value: values[index]!, x: last > first ? 65 + (source.startTime - first) / (last - first) * 320 : 225,
    y: maximum > minimum ? 135 - (values[index]! - minimum) / (maximum - minimum) * 110 : 80 }));
  if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error("invalid_cycling_history_trend");
  return { points, minimum, maximum };
}

export type CyclingHistoryTotalMetric = "distanceM" | "elevationGainM";
export type CyclingHistoryTotalBasis = "canonical_metrics" | "activity_summary";
/** 지표와 출처가 적격인 subgroup에만 기존 대표 우선순위를 적용한다. 0은 관측되었으나 순위가 아니다. */
export function cyclingHistoryTotalLeaders(summary: ReturnType<typeof cyclingDistanceHistory>, metric: CyclingHistoryTotalMetric, basis: CyclingHistoryTotalBasis, limit: 5 | 10) {
  const observations: Array<CyclingDistanceHistoryRow & { value: number; canonicalActivityId: string }> = [];
  let missing = 0, otherBasis = 0;
  for (const group of summary.groups) {
    const eligible = group.filter(item => item.row.activityTotals?.sourceBasis[metric] === basis && item.row.activityTotals[metric] !== null);
    if (eligible.length) {
      const source = pickPhysicalRideRepresentative(eligible).row;
      observations.push({ ...source, value: source.activityTotals![metric]!, canonicalActivityId: pickPhysicalRideRepresentative(group).row.activityId });
    } else if (group.some(item => item.row.activityTotals?.[metric] != null)) otherBasis++;
    else missing++;
  }
  observations.sort((a, b) => b.value - a.value || b.startTime - a.startTime || (a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0));
  const positive = observations.filter(row => row.value > 0);
  return { sources: positive.slice(0, limit), allSources: observations, observed: positive.length, zero: observations.length - positive.length, missing, otherBasis,
    underlyingSourceCount: observations.filter(row => row.activityId !== row.canonicalActivityId).length };
}
/** 로컬 단위 표시만 수행한다. 변환 overflow/underflow는 원본 SI 표시로 되돌린다. */
export function cyclingHistoryValueText(value: number, metric: "elapsed" | CyclingHistoryTotalMetric, units: "metric" | "imperial") {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (metric === "elapsed") {
    if (!Number.isFinite(value * 1e6) || Math.round(value * 1e6) / 1e6 !== value) return `${value}s`;
    const text = formatElapsedBoundary(value);
    return text && !/Infinity|NaN/u.test(text) && (value === 0 || !/^0:00$/u.test(text)) ? text : `${value}s`;
  }
  const scale = metric === "distanceM" ? units === "imperial" ? 1609.344 : value < 1000 ? 1 : 1000 : units === "imperial" ? 0.3048 : 1;
  const converted = value / scale, unit = metric === "distanceM" ? units === "imperial" ? "mi" : scale === 1 ? "m" : "km" : units === "imperial" ? "ft" : "m";
  if (!Number.isFinite(converted) || value > 0 && converted === 0) return `${value}m`;
  const text = metric === "distanceM" ? formatDistance(value, units) : `${Math.round(converted)}${unit}`;
  return /Infinity|NaN/u.test(text) ? `${value}m` : value > 0 && Number.parseFloat(text) === 0 ? `${converted}${unit}` : text;
}
