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
  return { sources: sources.slice(0, limit), observed: sources.length, noObserved, unsupported, unavailable,
    underlyingSourceCount: sources.filter(row => row.activityId !== row.canonicalActivityId).length };
}
