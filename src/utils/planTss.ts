import type { PlanDay } from "@shared/types/goal";

export function effectivePlanTSS(day: PlanDay): number {
  if (day.skipped) return 0;
  const adjusted = day.adjustedTSS ?? day.plannedTSS;
  return day.completed ? (day.actualTSS ?? adjusted) : adjusted;
}

export function sumEffectivePlanTSS(days: PlanDay[]): number {
  return days.reduce((sum, day) => sum + effectivePlanTSS(day), 0);
}
