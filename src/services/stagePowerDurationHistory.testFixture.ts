import type { StagePowerHistoryCandidate, StagePowerHistoryComputedCandidate, StagePowerHistoryComputeResponse, StagePowerHistoryPageResponse, StagePowerHistorySelection } from "@shared/types/stage-power-duration-history";
import { exactPowerWeightRatio } from "../features/activity/detail/stagePowerHistoryExact";
/** 합성 로컬 계약 회귀용. 실제 사용자·서버 실행 증거가 아니다. */
export const historySelection: StagePowerHistorySelection = { unit: "W", durationSeconds: 17, periods: [{ fromInclusive: 1000, toExclusive: 10000 }, { fromInclusive: 0, toExclusive: 1000 }], periodIndex: 0, includeWeightNormalized: true };
export const historySession = { readTime: { seconds: 1000, nanoseconds: 0 }, expiresAt: 2800000, requestBinding: "a".repeat(64) };
export function historyCandidate(activityId = "a", startTime = 2000): StagePowerHistoryCandidate {
  return { activityId, startTime, activityIncarnation: "99:1", activityRevision: "100:1", baseMetricsRevision: "100:1", sourcePowerOrigin: "measured", analysisState: "ready", snapshotState: "present_unverified", snapshotRevision: "b".repeat(64), candidateBinding: "c".repeat(64), physicalIdentity: { source: "orider", localSessionId: null, stravaActivityId: null, stravaTwinActivityId: null } };
}
export function historyPage(candidates = [historyCandidate()]): StagePowerHistoryPageResponse {
  return { ...structuredClone(historySelection), version: 1, mode: "stage_power_duration_history_page", scope: "observed_manual_history_page", queryScope: "owner_activities_with_valid_start_time", session: structuredClone(historySession),
    page: { limit: 20, scannedActivityCount: candidates.length, candidateActivityCount: candidates.length, skippedActivityCount: 0, exhausted: true, enumerationState: "exhausted", nextCursor: null }, activities: candidates,
    collectionCompleteness: "unknown", originalClockVerified: false, costs: { documents: 30, metadata: 0, snapshotBodies: 0, queries: 1, rawPayloads: 0, writes: 0 } };
}
export function historyComputed(row = historyCandidate(), watts = 250, kg: number | null = 80): StagePowerHistoryComputedCandidate {
  const durationMilliseconds = historySelection.durationSeconds * 1000, energyWattMilliseconds = (BigInt(watts) * BigInt(durationMilliseconds)).toString();
  return { ...row, state: "available", reason: null, sourceDigest: "d".repeat(64), timingBasis: "stored_native_one_second_slot_policy", sensorBucketOriginVerified: false, originalClockVerified: false, quality: "unknown", collectionCompleteness: "unknown",
    result: { version: 1, scope: "whole_activity_observed_intervals", timingBasis: "stored_native_one_second_slot_policy", sensorBucketOriginVerified: false, originalClockVerified: false, quality: "unknown", collectionCompleteness: "unknown", unit: "W", ...(row.sourcePowerOrigin === "stored_native_watts_unverified" ? { powerSource: "stored_native_watts_unverified" as const } : {}), state: "available", reason: null, requestedDurationSeconds: historySelection.durationSeconds, maxAveragePowerW: watts, windowStartElapsedSec: 0, windowEndElapsedSec: historySelection.durationSeconds, observedSeconds: 200, longestContinuousSeconds: 200 },
    comparison: { sourcePowerOrigin: row.sourcePowerOrigin!, energyWattMilliseconds, durationMilliseconds },
    weightNormalized: { unit: "W/kg", basis: "calculation_profile_snapshot", state: kg === null ? "missing" : "available", weightKg: kg, weightRevision: "100:1", computedAt: null, maxAveragePowerWPerKg: kg === null ? null : watts / kg, comparison: kg === null ? null : exactPowerWeightRatio(energyWattMilliseconds, durationMilliseconds, kg) } };
}
export function historyCompute(candidates = [historyComputed()]): StagePowerHistoryComputeResponse {
  const coverage = (rows: StagePowerHistoryComputedCandidate[]) => ({ inspectedActivityCount: rows.length, computedActivityCount: rows.filter(v => v.state === "available").length, missingSnapshotCount: rows.filter(v => v.reason === "snapshot_missing").length, noContinuousWindowCount: rows.filter(v => v.reason === "no_continuous_window").length });
  return { ...structuredClone(historySelection), version: 1, mode: "stage_power_duration_history_compute", scope: "observed_explicit_history_candidates", session: structuredClone(historySession), candidates,
    analysisCoverage: { ...coverage(candidates), origins: (["measured", "stored_native_watts_unverified"] as const).map(sourcePowerOrigin => { const rows = candidates.filter(v => v.sourcePowerOrigin === sourcePowerOrigin); return { sourcePowerOrigin, ...coverage(rows), weightCounts: { includedActivityCount: rows.filter(v => v.weightNormalized?.state === "available").length, missingWeightActivityCount: rows.filter(v => v.weightNormalized?.state === "missing").length, invalidWeightActivityCount: rows.filter(v => v.weightNormalized?.state === "invalid").length, incompatibleWeightActivityCount: rows.filter(v => v.weightNormalized?.state === "incompatible").length } }; }) },
    costs: { documents: 60, metadata: 4, snapshotBodies: candidates.length, queries: 0, rawPayloads: 0, writes: 0 }, enumerationState: "not_certified", collectionCompleteness: "unknown", originalClockVerified: false };
}
