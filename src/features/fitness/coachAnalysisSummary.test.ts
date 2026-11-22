import { describe, expect, it } from "vitest";
import type { PowerCurvePeriodResult, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { TrainingAnalysisPeriodResult, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { changePct, movingHours, signedChange, summarizeCoachAnalysis, zoneGroups } from "./coachAnalysisSummary";

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
  it("최근·이전 5분/60분 파워 변화율과 표 행을 만든다", () => {
    const summary = summarizeCoachAnalysis({
      power: powerResponse(powerPeriod({ 5: 900, 300: 312, 1200: 260, 3600: 204 }, 12), powerPeriod({ 5: 900, 300: 300, 3600: 200 }, 10)),
      training: null,
    });
    expect(summary.insufficient).toBeNull();
    expect(summary.fiveMinPct).toBe(4);
    expect(summary.sixtyMinPct).toBe(2);
    expect(summary.rows.map(row => [row.durationSeconds, row.changePct])).toEqual([[5, 0], [300, 4], [1200, null], [3600, 2]]);
  });

  it("W/kg 표는 체중 기준 값만 쓰고 요약 타일은 W 기준을 유지한다", () => {
    const summary = summarizeCoachAnalysis({
      power: powerResponse(powerPeriod({ 300: 330, 3600: 220 }, 5, { 300: 4.4 }), powerPeriod({ 300: 300, 3600: 200 }, 5, { 300: 4 })),
      training: null, unit: "W/kg",
    });
    expect(summary.fiveMinPct).toBe(10);
    expect(summary.rows).toEqual([{ durationSeconds: 300, recent: 4.4, previous: 4, changePct: 10 }]);
  });

  it("한 기간이라도 파워 기록이 없으면 비교 불가로 판정하고 두 기간 기록 수를 더한다", () => {
    const summary = summarizeCoachAnalysis({ power: powerResponse(powerPeriod({ 300: 250 }, 3), powerPeriod({}, 0)), training: null });
    expect(summary.insufficient).toEqual({ powerActivityCount: 3 });
    expect(summary.fiveMinPct).toBeNull();
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

  it("변화율·부호 표기 경계", () => {
    expect(changePct(110, 0)).toBeNull();
    expect(changePct(null, 100)).toBeNull();
    expect(changePct(95, 100)).toBe(-5);
    expect(signedChange(4)).toBe("+4.0");
    expect(signedChange(-1.25)).toBe("−1.3");
    expect(signedChange(0)).toBe("0.0");
  });
});
