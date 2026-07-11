import { describe, expect, it } from "vitest";
import type { PlanWeek } from "@shared/types/goal";
import { buildFitnessWeeklyInsight, buildPlanAdjustmentInsight, computePlanCompliancePct } from "./trainingHubInsights";

describe("training hub insights", () => {
  it("builds a weekly fatigue interpretation from recent load", () => {
    const dailyData = [
      ...Array.from({ length: 7 }, () => ({ totalLoad: 10 })),
      ...Array.from({ length: 7 }, () => ({ totalLoad: 20 })),
    ];

    expect(buildFitnessWeeklyInsight({ ctlDelta: 3, ctl: 40, atl: 42, tsb: -5, dailyData })).toMatchObject({
      thisWeek: 140,
      previousWeek: 70,
      fatiguePct: 100,
      recommendation: "interval",
    });
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
