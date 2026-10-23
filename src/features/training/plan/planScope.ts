import { isPendingPlanWorkout } from "./planRecordPresentation";
import type { PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";

/** Presentation ranges only; stored schedule, progress and prescription values stay unchanged. */
export function summarizeStoredPlan(weeks: PlanWeek[], goalDate: Date | null | undefined, now: number, { legacy = false }: { legacy?: boolean } = {}) {
  const today = planDayKey(now);
  const goal = goalDate && Number.isFinite(goalDate.getTime()) ? planDayKey(goalDate.getTime()) : null;
  let untilGoal = 0;
  let afterGoal = 0;
  let overdue = 0;
  for (const week of weeks) for (const day of week.days) {
    const date = planDayKey(day.date);
    const pending = legacy ? !day.completed && !day.skipped && day.workout !== "rest" && day.workout !== "goal"
      : isPendingPlanWorkout(day, { date, today });
    if (!pending) continue;
    if (date < today) overdue++;
    else if (goal && date > goal) afterGoal++;
    else untilGoal++;
  }
  return { untilGoal, afterGoal, overdue };
}
