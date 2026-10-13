import { RUN_DISTANCE_TARGETS_V2, RUN_DISTANCE_TARGET_M_V2 } from "@shared/types/personal-records";
import type { ExpandedRunDistanceAnalysis, TrainingAnalysisPeriodResult } from "@shared/types/training-analysis-periods";
/** 합성 입력만 사용한다. 기존 정본 요약을 변경하지 않는다. */
export function expandedPeriodFixture(period: TrainingAnalysisPeriodResult): ExpandedRunDistanceAnalysis {
  return { version: 1, targetsVersion: 2, timingBasis: "elapsed_including_stops", scope: "observed_representatives", distances: RUN_DISTANCE_TARGETS_V2.map(distance => {
    const sources = distance === "400m" ? period.activities.map(row => ({ sourceActivityId: row.activityId, startTime: row.startTime, metricsRevision: "100:1", contributingActivityCount: 1, elapsedSec: 90 })) : [];
    return { distance, distanceM: RUN_DISTANCE_TARGET_M_V2[distance], candidateActivityCount: period.coverage.representativeActivityCount, supportedActivityCount: period.coverage.representativeActivityCount, observedEffortActivityCount: sources.length, noObservedEffortActivityCount: period.coverage.representativeActivityCount - sources.length, unsupportedActivityCount: 0, unavailableActivityCount: 0, truncated: period.coverage.truncated, bestTimeSeconds: sources.length ? 90 : null, medianTimeSeconds: sources.length ? 90 : null, sources };
  }) };
}
