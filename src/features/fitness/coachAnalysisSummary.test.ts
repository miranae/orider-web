import { describe, expect, it } from "vitest";
import type { PowerCurvePeriodResult, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { TrainingAnalysisPeriodResult, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { movingHours, periodPaceCurves, summarizeCoachAnalysis, zoneGroups } from "./coachAnalysisSummary";

const DAY = 86_400_000;
function powerPeriod(watts: Record<number, number>, included: number, wattsPerKg?: Record<number, number>): PowerCurvePeriodResult {
  const point = (durationSeconds: number, value: number) => ({ durationSeconds, watts: value, sourceActivityId: "a", startTime: 0, source: "orider_native", cohortEligible: true, metricsRevision: "1:0" });
  return {
    fromInclusive: 0, toExclusive: 90 * DAY, status: "complete",
    points: Object.entries(watts).map(([seconds, value]) => point(Number(seconds), value)),
    coverage: { includedActivityCount: included } as PowerCurvePeriodResult["coverage"],
    ...(wattsPerKg ? { weightNormalized: { points: Object.entries(wattsPerKg).map(([seconds, value]) => ({ ...point(Number(seconds), value * 70), wattsPerKg: value, weightKg: 70, weightRevision: "r" })) } as unknown as PowerCurvePeriodResult["weightNormalized"] } : {}),
  } as PowerCurvePeriodResult;
}
const powerResponse = (...periods: PowerCurvePeriodResult[]) => ({ periods } as unknown as PowerCurvePeriodsResponse);
function trainingPeriod({ power = [], hr = [], movingSec = null as number | null, totalSec, partial = false }: { power?: number[][]; hr?: number[][]; movingSec?: number | null; totalSec?: number | null; partial?: boolean }): TrainingAnalysisPeriodResult {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return {
    fromInclusive: 0, toExclusive: 90 * DAY, status: partial ? "partial" : "complete", coverage: { truncated: false },
    totals: { movingTimeSec: { observedValue: movingSec, totalValue: totalSec === undefined ? movingSec : totalSec } },
    zones: {
      power: { groups: power.map(seconds => ({ ftp: 240, seconds, observedSeconds: sum(seconds) })) },
      heartRate: { groups: hr.map(seconds => ({ boundaries: { reference: "lthr", referenceBpm: 170 }, seconds, observedSeconds: sum(seconds) })) },
    },
  } as unknown as TrainingAnalysisPeriodResult;
}
const trainingResponse = (...periods: TrainingAnalysisPeriodResult[]) => ({ periods } as unknown as TrainingAnalysisPeriodsResponse);

describe("coachAnalysisSummary", () => {
  it("최근·이전 5분/60분 파워와 표 행을 서버 값 그대로 나란히 만든다(변화율 없음)", () => {
    const summary = summarizeCoachAnalysis({
      power: powerResponse(powerPeriod({ 5: 900, 300: 312, 1200: 260, 3600: 204 }, 12), powerPeriod({ 5: 900, 300: 300, 3600: 200 }, 10)),
      training: null,
    });
    expect(summary.insufficient).toBeNull();
    expect(summary.fiveMin).toEqual({ durationSeconds: 300, recent: 312, previous: 300 });
    expect(summary.sixtyMin).toEqual({ durationSeconds: 3600, recent: 204, previous: 200 });
    expect(summary.rows.map(row => [row.durationSeconds, row.recent, row.previous])).toEqual([[5, 900, 900], [300, 312, 300], [1200, 260, null], [3600, 204, 200]]);
    expect(Object.keys(summary.rows[0]!)).not.toContain("changePct");
  });

  it("W/kg 이면 체중 기준 서버 값만 쓴다", () => {
    const summary = summarizeCoachAnalysis({
      power: powerResponse(powerPeriod({ 300: 330, 3600: 220 }, 5, { 300: 4.4 }), powerPeriod({ 300: 300, 3600: 200 }, 5, { 300: 4 })),
      training: null, unit: "W/kg",
    });
    expect(summary.fiveMin).toEqual({ durationSeconds: 300, recent: 4.4, previous: 4 });
    expect(summary.rows).toEqual([{ durationSeconds: 300, recent: 4.4, previous: 4 }]);
  });

  it("두 기간 모두 체중 기준 점이 있어야 W/kg 를 고를 수 있다", () => {
    const withWeight = summarizeCoachAnalysis({ power: powerResponse(powerPeriod({ 300: 330 }, 5, { 300: 4.4 }), powerPeriod({ 300: 300 }, 5, { 300: 4 })), training: null });
    const withoutWeight = summarizeCoachAnalysis({ power: powerResponse(powerPeriod({ 300: 330 }, 5, { 300: 4.4 }), powerPeriod({ 300: 300 }, 5)), training: null });
    expect(withWeight.weightNormalizedAvailable).toBe(true);
    expect(withoutWeight.weightNormalizedAvailable).toBe(false);
  });

  it("한 기간이라도 파워 기록이 없으면 비교 불가로 판정하고 두 기간 기록 수를 더한다", () => {
    const summary = summarizeCoachAnalysis({ power: powerResponse(powerPeriod({ 300: 250 }, 3), powerPeriod({}, 0)), training: null });
    expect(summary.insufficient).toEqual({ powerActivityCount: 3 });
    expect(summary.fiveMin).toBeNull();
    expect(summary.rows).toEqual([]);
  });

  it("파워 비교를 아직 받지 않았으면 비교 불가로 보지 않는다", () => {
    expect(summarizeCoachAnalysis({ power: null, training: null }).insufficient).toBeNull();
  });

  it("존은 서버 묶음을 그대로 고른다 — 파워 존이 있으면 파워, 없으면 심박", () => {
    const both = trainingPeriod({ power: [[10, 0, 0, 0, 0, 0, 0]], hr: [[5, 5, 0, 0, 0]] });
    expect(zoneGroups(both).map(group => group.seconds)).toEqual([[10, 0, 0, 0, 0, 0, 0]]);
    expect(zoneGroups(trainingPeriod({ hr: [[5, 0, 0, 0, 5]] })).map(group => group.seconds)).toEqual([[5, 0, 0, 0, 5]]);
    expect(zoneGroups(trainingPeriod({ power: [[0, 0, 0, 0, 0, 0, 0]] }))).toEqual([]);
    const summary = summarizeCoachAnalysis({ power: null, training: trainingResponse(both, trainingPeriod({})) });
    expect(summary.recentZones).toHaveLength(1);
    expect(summary.previousZones).toEqual([]);
  });

  it("두 기간 존 기준을 맞춘다 — 같은 기준이 있으면 그것, 없으면 mixed", () => {
    const powerAndHr = trainingPeriod({ power: [[10, 0, 0, 0, 0, 0, 0]], hr: [[5, 5, 0, 0, 0]] });
    const hrOnly = trainingPeriod({ hr: [[5, 0, 0, 0, 5]] });
    const powerOnly = trainingPeriod({ power: [[10, 0, 0, 0, 0, 0, 0]] });
    const common = summarizeCoachAnalysis({ power: null, training: trainingResponse(powerAndHr, hrOnly) });
    expect(common.zoneBasis).toBe("heartRate");
    expect(common.recentZones.map(group => group.seconds)).toEqual([[5, 5, 0, 0, 0]]);
    const mixed = summarizeCoachAnalysis({ power: null, training: trainingResponse(powerOnly, hrOnly) });
    expect(mixed.zoneBasis).toBe("mixed");
    expect(mixed.recentZones.map(group => group.seconds)).toEqual([[10, 0, 0, 0, 0, 0, 0]]);
    expect(mixed.previousZones.map(group => group.seconds)).toEqual([[5, 0, 0, 0, 5]]);
  });

  it("이동 시간은 서버 합계를 시간으로만 바꾸고, 전체 값이 없거나 일부 집계면 partial 로 표시한다", () => {
    expect(movingHours(trainingPeriod({ movingSec: 18 * 3600 }))).toEqual({ hours: 18, partial: false });
    expect(movingHours(trainingPeriod({ movingSec: 9 * 3600, totalSec: null }))).toEqual({ hours: 9, partial: true });
    expect(movingHours(trainingPeriod({ movingSec: 9 * 3600, partial: true }))).toEqual({ hours: 9, partial: true });
    expect(movingHours(trainingPeriod({ movingSec: null, totalSec: null }))).toBeNull();
  });

  it("파워 비교 기간이 일부만 집계됐으면 powerPartial", () => {
    const partial = { ...powerPeriod({ 300: 310, 3600: 200 }, 4), status: "partial" } as PowerCurvePeriodResult;
    expect(summarizeCoachAnalysis({ power: powerResponse(partial, powerPeriod({ 300: 300, 3600: 200 }, 4)), training: null }).powerPartial).toBe(true);
  });

  it("러닝 기간 페이스 커브는 두 기간에 같은 산출 기준이 있는 서버 커브를 고른다", () => {
    const curve = (sourceBasis: string, pace: number) => ({ sourceBasis, points: [{ durationSeconds: 300, paceSecPerKm: pace }] });
    const period = (...paceCurves: unknown[]) => ({ running: { paceCurves } }) as unknown as TrainingAnalysisPeriodResult;
    expect(periodPaceCurves(period(curve("speed_curve_kmh_converted", 250), curve("run_metrics_pace_curve", 240)), period(curve("run_metrics_pace_curve", 260))))
      .toEqual({ recent: [{ durationSec: 300, paceSecPerKm: 240 }], previous: [{ durationSec: 300, paceSecPerKm: 260 }] });
    expect(periodPaceCurves(period(curve("speed_curve_kmh_converted", 250)), period(curve("run_metrics_pace_curve", 260))))
      .toEqual({ recent: [], previous: [{ durationSec: 300, paceSecPerKm: 260 }] });
    expect(periodPaceCurves(period(), period())).toBeNull();
    expect(periodPaceCurves(undefined, undefined)).toBeNull();
  });
});
