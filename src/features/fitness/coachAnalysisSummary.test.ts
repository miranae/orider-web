import { describe, expect, it } from "vitest";
import type { PowerCurvePeriodResult, PowerCurvePeriodsResponse } from "@shared/types/power-curve-periods";
import type { TrainingAnalysisPeriodResult, TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { changePct, signedChange, summarizeCoachAnalysis, weeklyHours, zoneChannel, zoneShare } from "./coachAnalysisSummary";

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
function trainingPeriod({ power = [], hr = [], movingSec = null as number | null, days = 90 }: { power?: number[][]; hr?: number[][]; movingSec?: number | null; days?: number }): TrainingAnalysisPeriodResult {
  return {
    fromInclusive: 0, toExclusive: days * DAY,
    totals: { movingTimeSec: { observedValue: movingSec } },
    zones: {
      power: { groups: power.map(seconds => ({ seconds })) },
      heartRate: { groups: hr.map(seconds => ({ seconds })) },
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

  it("존 시간을 Z1–2 / Z3 / Z4+ 로 묶고 Z4+ 비중 변화를 %p 로 낸다", () => {
    const recent = trainingPeriod({ power: [[30, 30, 20, 10, 10]], movingSec: 360000 });
    const previous = trainingPeriod({ power: [[40, 30, 15, 10, 5]] });
    expect(zoneShare(recent, "power")).toEqual({ low: 0.6, mid: 0.2, high: 0.2 });
    const summary = summarizeCoachAnalysis({ power: null, training: trainingResponse(recent, previous) });
    expect(summary.highSharePp).toBe(5);
  });

  it("여러 기준 묶음은 존 번호끼리 더한다", () => {
    expect(zoneShare(trainingPeriod({ hr: [[10, 10, 0, 0, 0], [0, 0, 10, 10, 0]] }), "heartRate")).toEqual({ low: 0.5, mid: 0.25, high: 0.25 });
  });

  it("두 기간 모두 파워 존이 있어야 파워를 쓰고 아니면 심박으로 맞춘다", () => {
    const powerOnly = trainingPeriod({ power: [[10, 0, 0, 0]], hr: [[5, 5, 0, 0, 0]] });
    const hrOnly = trainingPeriod({ hr: [[5, 0, 0, 0, 5]] });
    expect(zoneChannel(powerOnly, powerOnly)).toBe("power");
    expect(zoneChannel(powerOnly, hrOnly)).toBe("heartRate");
    expect(zoneChannel(trainingPeriod({}), trainingPeriod({}))).toBeNull();
  });

  it("주당 이동 시간은 기간 길이로 나눈다", () => {
    expect(weeklyHours(trainingPeriod({ movingSec: 28 * 3600, days: 28 }))).toBe(7);
    expect(weeklyHours(trainingPeriod({ movingSec: null }))).toBeNull();
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
