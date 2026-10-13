import { RUN_DISTANCES, type ExpandedRunDistanceKey } from "@shared/types/personal-records";
import type { TrainingAnalysisHistoryResponse, TrainingAnalysisHistoryRow } from "@shared/types/training-analysis-history";
import { dedupeSamePhysicalRides } from "../../../utils/samePhysicalRide";
export const ANNUAL_HISTORY_CAP = 5000;
/** 페이지별 대표를 고르지 않고 전체 후보에 기존 동일 실주행 대표 선택을 적용한다. */
export function annualRunHistory(pages: TrainingAnalysisHistoryResponse[]) {
  const rows = pages.flatMap(page => page.activities);
  const ids = new Set<string>();
  if (rows.some(row => { if (ids.has(row.activityId)) return true; ids.add(row.activityId); return false; })) throw new Error("history_repeated_activity");
  const scanned = pages.reduce((sum, page) => sum + page.page.scannedActivityCount, 0);
  if (scanned > ANNUAL_HISTORY_CAP || rows.length > ANNUAL_HISTORY_CAP) throw new Error("history_memory_cap");
  const representatives = dedupeSamePhysicalRides(rows.map(row => ({ ...row.representativeInput, id: row.activityId, startTime: row.startTime, sportFamily: "run", row }))).map(value => value.row);
  const states = Object.fromEntries(["ready", "missing", "pending", "stale", "outdated", "partial", "invalid"].map(state => [state, representatives.filter(row => row.analysis.state === state).length])) as Record<TrainingAnalysisHistoryRow["analysis"]["state"], number>;
  return { rows, representatives, scanned, candidateCount: rows.length, deduplicatedCount: rows.length - representatives.length, states,
    scanComplete: pages.length > 0 && pages[pages.length - 1]!.page.exhausted,
    capped: scanned >= ANNUAL_HISTORY_CAP && !pages[pages.length - 1]?.page.exhausted,
    channels: { distance: representatives.filter(row => row.distanceRecords.state === "unavailable").length, pace: representatives.filter(row => row.paceCurve.state === "unavailable").length },
  };
}
export function annualDistanceLeaders(rows: TrainingAnalysisHistoryRow[], distance: string | ExpandedRunDistanceKey) {
  return rows.flatMap(row => {
    const channel = RUN_DISTANCES.some(key => key === distance) ? row.distanceRecords : row.expandedDistanceRecords;
    const record = channel?.points.find(point => point.distance === distance);
    return row.analysis.state === "ready" && channel?.state === "observed" && record && Number.isFinite(record.elapsedSec) && record.elapsedSec > 0 ? [{ ...row, elapsedSec: record.elapsedSec }] : [];
  }).sort((a, b) => a.elapsedSec - b.elapsedSec || b.startTime - a.startTime || (a.activityId < b.activityId ? -1 : a.activityId > b.activityId ? 1 : 0)).slice(0, 10);
}
