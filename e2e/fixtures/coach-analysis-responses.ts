// 코치 분석 화면 검증용 합성 응답 — 로컬 함수 에뮬레이터 자리에 Playwright 가 돌려준다. 실제 데이터·운영 호출 없음.
import { deriveHrZoneBoundaries } from "../../shared/training/hrZoneTable";
import type { PowerCurvePeriod, PowerCurvePeriodsResponse } from "../../shared/types/power-curve-periods";
import type { TrainingAnalysisPeriodsResponse } from "../../shared/types/training-analysis-periods";

const DIGEST = "c".repeat(64);
const DURATIONS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const RECENT_W = [980, 900, 760, 520, 410, 350, 312, 285, 262, 238, 204];
const PREVIOUS_W = [990, 905, 750, 505, 398, 340, 300, 276, 255, 233, 200];
const WEIGHT_KG = 70;

function powerPeriod(period: PowerCurvePeriod, watts: readonly number[], included: number, durations = DURATIONS) {
  const points = durations.map((durationSeconds, index) => ({ durationSeconds, watts: watts[index]!, sourceActivityId: `fixture-power-${index}`,
    startTime: period.fromInclusive + 86_400_000, source: "orider_native" as const, cohortEligible: true, metricsRevision: "1:0" }));
  const coverage = { scannedActivityCount: included, candidateActivityCount: included, candidateCountKnown: true, includedActivityCount: included,
    pendingActivityCount: 0, missingActivityCount: 0, incompleteActivityCount: 0, ineligibleActivityCount: 0, skippedActivityCount: 0, truncated: false, scanLimit: 1000 };
  return { ...period, status: "complete" as const, points, coverage,
    weightNormalized: { unit: "W/kg" as const, basis: "calculation_profile_snapshot" as const, status: "complete" as const, coverage: { ...coverage },
      weightCounts: { includedActivityCount: included, missingWeightActivityCount: 0, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 },
      points: points.map(point => ({ ...point, wattsPerKg: point.watts / WEIGHT_KG, weightKg: WEIGHT_KG, weightRevision: point.metricsRevision })) } };
}

/** 두 기간 파워 비교. [insufficient] 이면 이전 기간에 파워 기록이 없다. */
export function powerCurveResponse(periods: PowerCurvePeriod[], insufficient: boolean, asOf = Date.now()): PowerCurvePeriodsResponse {
  const [recent, previous] = periods;
  return { version: 1, discipline: "bike", unit: "W", asOf, inputDigest: DIGEST, periods: insufficient
    ? [powerPeriod(recent!, [880, 300, 240], 3, [5, 300, 1200]), powerPeriod(previous!, [], 0, [])]
    : [powerPeriod(recent!, RECENT_W, 14), powerPeriod(previous!, PREVIOUS_W, 11)] };
}

function trainingPeriod(period: PowerCurvePeriod, id: string, weeklyHours: number, powerSeconds: number[], hrSeconds: number[]) {
  const days = (period.toExclusive - period.fromInclusive) / 86_400_000;
  const movingTimeSec = Math.round(weeklyHours * 3600 * days / 7);
  const total = (value: number) => ({ observedValue: value, totalValue: value, knownActivityCount: 1, missingActivityCount: 0, summaryFallbackCount: 0, sourceBasis: "canonical_metrics" as const, sourceActivityIds: [id] });
  const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
  const channel = { candidateActivityCount: 1, eligibleActivityCount: 1, missingSensorActivityCount: 0, contextUnknownActivityCount: 0 };
  return { ...period, status: "complete" as const,
    coverage: { scannedActivityCount: 1, candidateActivityCount: 1, representativeActivityCount: 1, deduplicatedActivityCount: 0, includedActivityCount: 1, pendingActivityCount: 0,
      missingActivityCount: 0, incompleteActivityCount: 0, skippedActivityCount: 0, candidateCountKnown: true, truncated: false, scanLimit: 200, deduplicationBasis: "explicit_identity_within_period" as const },
    activities: [{ activityId: id, startTime: period.fromInclusive + 86_400_000, distanceM: movingTimeSec * 8, movingTimeSec, elevationGainM: 1200,
      sourceBasis: { distanceM: "canonical_metrics" as const, movingTimeSec: "canonical_metrics" as const, elevationGainM: "canonical_metrics" as const } }],
    totals: { distanceM: total(movingTimeSec * 8), movingTimeSec: total(movingTimeSec), elevationGainM: total(1200) },
    zones: {
      heartRate: { ...channel, observedSeconds: sum(hrSeconds), groups: [{ boundaries: deriveHrZoneBoundaries({ lthr: 170, maxHr: 190, sport: "bike" })!, seconds: hrSeconds, observedSeconds: sum(hrSeconds), activityIds: [id] }] },
      power: { ...channel, observedSeconds: sum(powerSeconds), reason: "recorded_ftp" as const, groups: [{ ftp: 240, powerSource: "measured" as const, seconds: powerSeconds, observedSeconds: sum(powerSeconds), activityIds: [id] }] },
      pace: { status: "unavailable" as const, reason: "canonical_pace_zones_unavailable" as const },
    } };
}

/** 두 기간 훈련 구성(주당 시간·존 비중). */
export function trainingPeriodsResponse(periods: PowerCurvePeriod[], asOf = Date.now()): TrainingAnalysisPeriodsResponse {
  const [recent, previous] = periods;
  return { version: 1, discipline: "bike", asOf, inputDigest: DIGEST, periods: [
    trainingPeriod(recent!, "fixture-recent", 6.2, [9000, 12000, 5400, 3200, 1600, 500, 100], [8000, 13000, 5000, 4000, 1800]),
    trainingPeriod(previous!, "fixture-previous", 5.8, [10000, 13000, 5200, 2400, 1000, 300, 100], [9000, 13000, 5200, 3000, 1000]),
  ] };
}
