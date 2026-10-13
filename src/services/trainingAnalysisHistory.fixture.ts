import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import type { TrainingAnalysisHistoryRequest, TrainingAnalysisHistoryResponse, TrainingAnalysisHistoryRow } from "@shared/types/training-analysis-history";
export const historyNow = Date.parse("2026-10-11T12:00:00+09:00");
export const historyRequest: TrainingAnalysisHistoryRequest = { mode: "history_page", discipline: "run", calendarBasis: "Asia/Seoul", year: 2026 };
const start = Date.parse("2026-01-01T00:00:00+09:00");
export function historyRow(activityId = "run", offset = 0): TrainingAnalysisHistoryRow {
  return { activityId, startTime: start + offset, activityRevision: "123:0", metricsRevision: "124:0", representativeInput: { source: "orider", type: "Run", discipline: "run", localSessionId: null, stravaActivityId: null, stravaTwinActivityId: null, endTime: null, movingSec: null, hasLoad: false }, analysis: { state: "ready", calculatorVersion: ACTIVITY_METRICS_VERSION, inputCoverage: "complete" }, distanceRecords: { state: "observed", reason: null, points: [{ distance: "5km", elapsedSec: 1200 }] }, paceCurve: { state: "observed", reason: null, value: { sourceBasis: "run_metrics_pace_curve", unit: "sec_per_km", points: [{ durationSeconds: 300, paceSecPerKm: 300, speedKph: null }] } } };
}
export function historyPage(rows = [historyRow()], exhausted = true, offset = 0): TrainingAnalysisHistoryResponse {
  const readTime = { seconds: historyNow / 1000, nanoseconds: 0 };
  const range = { fromInclusive: start, toExclusive: historyNow };
  return { version: 1, mode: "history_page", discipline: "run", calendarBasis: "Asia/Seoul", year: 2026, scope: "page", queryScope: "owner_activities_with_valid_start_time", range, readTime, expiresAt: historyNow + 1800000,
    page: { limit: 50, scannedActivityCount: exhausted ? rows.length : 50, candidateActivityCount: rows.length, skippedActivityCount: exhausted ? 0 : 50 - rows.length, exhausted, nextCursor: exhausted ? null : { readTime, toExclusive: historyNow, after: { startTime: start + offset + 49000, activityId: "scan-tail" }, requestBinding: "a".repeat(64) } }, activities: rows };
}
