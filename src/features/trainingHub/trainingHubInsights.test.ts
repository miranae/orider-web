import { describe, expect, it } from "vitest";
import type { PlanWeek } from "@shared/types/goal";
import { buildFitnessWeeklyInsight, buildPlanAdjustmentInsight, computePlanCompliancePct } from "./trainingHubInsights";

describe("training hub insights", () => {
  const base = { ctlDelta: 3, ctl: 40, atl: 42, tsb: -5, asOf: "2026-10-12", dateBasis: "utc" as const };
  const full = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.parse("2026-10-12T00:00:00Z") - i * 86_400_000).toISOString().slice(0, 10), totalLoad: i < 7 ? 20 : 10 }));
  it("compares fourteen actual calendar dates, independently of row order", () => {
    expect(buildFitnessWeeklyInsight({ ...base, dailyData: [...full].reverse() })).toMatchObject({ thisWeek: 140, previousWeek: 70, loadChangePct: 100, recommendation: "interval", complete: true });
  });
  it.each([
    [{date:"2026-01-01", totalLoad:70}],
    [{date:"2026-10-12", totalLoad:0, unknownCount:1}],
    [],
    [{date:"2026-10-13", totalLoad:70}],
    [{date:"2026-02-30", totalLoad:70}],
    [...full, full[0]!],
    full.map((day, i) => i === 0 ? {...day,pending:true} : day),
    full.map((day, i) => i === 0 ? {...day,stale:true} : day),
  ].map(dailyData => ({ dailyData })))("withholds comparison and advice for incomplete or invalid dates %j", ({ dailyData }) => {
    expect(buildFitnessWeeklyInsight({...base,dailyData})).toMatchObject({loadChangePct:null,recommendation:null,complete:false});
  });
  it("keeps confirmed zero and refuses a rate divided by zero", () => {
    expect(buildFitnessWeeklyInsight({...base,dailyData:full.map(day=>({...day,totalLoad:0}))})).toMatchObject({thisWeek:0,previousWeek:0,loadChangePct:null,recommendation:"restart",complete:true});
  });
  it("withholds advice and comparison while canonical refresh is pending", () => {
    expect(buildFitnessWeeklyInsight({...base,ready:false,dailyData:full})).toMatchObject({loadChangePct:null,recommendation:null,complete:false});
  });
  it("preserves an observed subtotal but not a recommendation beside unknown load", () => {
    expect(buildFitnessWeeklyInsight({...base,dailyData:full.map((day,i)=>i===0?{...day,unknownCount:1}:day)})).toMatchObject({thisWeek:140,loadChangePct:null,recommendation:null,missingDays:1});
  });
  it("anchors inclusive 0..6 and 7..13 day windows to explicit UTC date at KST midnight", () => {
    const dailyData=[...full,{date:"2026-09-28",totalLoad:900},{date:"2026-10-13",totalLoad:900}];
    expect(buildFitnessWeeklyInsight({...base,dailyData})).toMatchObject({thisWeek:140,previousWeek:70});
    expect(buildFitnessWeeklyInsight({...base,asOf:"2026-10-13",dailyData:full})).toMatchObject({complete:false,recommendation:null});
    expect(buildFitnessWeeklyInsight({...base,dateBasis:"mixed",dailyData:full})).toMatchObject({thisWeek:null,complete:false,recommendation:null});
  });

  it("distinguishes an unobserved previous week from observed zero", () => {
    expect(buildFitnessWeeklyInsight({...base,dailyData:full.slice(0,7)})).toMatchObject({previousWeek:null,loadChangePct:null});
    expect(buildFitnessWeeklyInsight({...base,dailyData:full.map(day=>({...day,totalLoad:0}))})).toMatchObject({previousWeek:0});
  });
  it("computes capped plan compliance over adjusted workouts", () => {
    const weeks = [{
      id: "week-01",
      weekNumber: 1,
      phase: "build",
      startDate: 1,
      plannedTSS: 100,
      days: [
        { date: 1, dayOfWeek: 1, workout: "endurance", plannedTSS: 50, plannedDurationMin: 60, adjustedTSS: 40, completed: true, skipped: false, actualTSS: 60 },
        { date: 2, dayOfWeek: 2, workout: "tempo", plannedTSS: 60, plannedDurationMin: 60, completed: false, skipped: true },
        { date: 3, dayOfWeek: 3, workout: "rest", plannedTSS: 0, plannedDurationMin: 0, completed: false, skipped: false },
      ],
    }] satisfies PlanWeek[];

    expect(computePlanCompliancePct(weeks)).toBe(40);
  });

  it("explains the latest adjustment using goal adjustment kind and compliance", () => {
    const weeks = [{
      id: "week-02",
      weekNumber: 2,
      phase: "build",
      startDate: 10,
      plannedTSS: 100,
      adjustmentFactor: 0.88,
      adjustmentReason: "compliance_low",
      adjustedAt: 20,
      days: [
        { date: 10, dayOfWeek: 1, workout: "endurance", plannedTSS: 100, plannedDurationMin: 90, completed: true, skipped: false, actualTSS: 50 },
      ],
    }] satisfies PlanWeek[];

    expect(buildPlanAdjustmentInsight({ id: "goal-1", lastAdjustmentKind: "factor" } as never, weeks)).toMatchObject({
      compliancePct: 50,
      changePct: 12,
      direction: "down",
    });
  });
});
