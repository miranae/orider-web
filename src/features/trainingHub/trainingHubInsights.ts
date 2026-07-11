import type { Goal, PlanWeek } from "@shared/types/goal";

type DailyLoadPoint = { totalLoad: number };

export function sumRecentLoad(points: DailyLoadPoint[], days: number): number {
  return Math.round(points.slice(-days).reduce((sum, day) => sum + day.totalLoad, 0));
}

export function buildFitnessWeeklyInsight({
  ctlDelta,
  ctl,
  atl,
  tsb,
  dailyData,
}: {
  ctlDelta: number;
  ctl: number;
  atl: number;
  tsb: number;
  dailyData: DailyLoadPoint[];
}) {
  const thisWeek = sumRecentLoad(dailyData, 7);
  const previousWeek = Math.round(dailyData.slice(-14, -7).reduce((sum, day) => sum + day.totalLoad, 0));
  const fatiguePct = previousWeek > 0 ? Math.round(((thisWeek - previousWeek) / previousWeek) * 100) : null;
  const recommendation =
    tsb < -20 ? "recover" :
    ctlDelta > 0 && atl <= ctl * 1.25 ? "interval" :
    thisWeek === 0 ? "restart" :
    "maintain";

  return {
    thisWeek,
    previousWeek,
    fatiguePct,
    recommendation,
  };
}

export function computePlanCompliancePct(weeks: PlanWeek[]): number | null {
  let planned = 0;
  let actual = 0;
  for (const week of weeks.slice(-4)) {
    for (const day of week.days) {
      if (day.workout === "rest" || day.workout === "goal") continue;
      const target = day.adjustedTSS ?? day.plannedTSS;
      if (target <= 0) continue;
      planned += target;
      if (day.completed) actual += Math.min(day.actualTSS ?? target, target);
      else if (day.skipped) actual += 0;
    }
  }
  if (planned <= 0) return null;
  return Math.round((actual / planned) * 100);
}

export function findLatestAdjustedWeek(weeks: PlanWeek[]): PlanWeek | null {
  return [...weeks]
    .filter((week) => week.adjustmentFactor != null)
    .sort((a, b) => (b.adjustedAt ?? b.startDate) - (a.adjustedAt ?? a.startDate))[0] ?? null;
}

export function buildPlanAdjustmentInsight(goal: Goal | null, weeks: PlanWeek[]) {
  const adjustedWeek = findLatestAdjustedWeek(weeks);
  const compliancePct = computePlanCompliancePct(weeks);
  if (!goal?.lastAdjustmentKind && !adjustedWeek) return null;

  const factor = adjustedWeek?.adjustmentFactor ?? null;
  const changePct = factor != null ? Math.round(Math.abs(1 - factor) * 100) : null;
  const direction = factor == null ? goal?.lastAdjustmentKind ?? "factor" : factor < 1 ? "down" : "up";

  return {
    compliancePct,
    changePct,
    direction,
    reason: adjustedWeek?.adjustmentReason ?? null,
  };
}
