import type { PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";

/**
 * Presentation ranges only; stored schedule, progress and prescription values stay unchanged.
 * 계획 연결 판정(day.completed) 대신 그날 그 종목 실제 활동이 있는 날(hasActivity)을 "한 날"로 본다.
 */
export function summarizeStoredPlan(
  weeks: PlanWeek[],
  goalDate: Date | null | undefined,
  now: number,
  hasActivity: (dateKey: string) => boolean = () => false,
) {
  const today = planDayKey(now);
  const goal = goalDate && Number.isFinite(goalDate.getTime()) ? planDayKey(goalDate.getTime()) : null;
  let untilGoal = 0;
  let afterGoal = 0;
  let overdue = 0;
  for (const week of weeks) for (const day of week.days) {
    if (day.skipped || day.workout === "rest" || day.workout === "goal") continue;
    const date = planDayKey(day.date);
    if (hasActivity(date)) continue;
    if (date < today) overdue++;
    else if (goal && date > goal) afterGoal++;
    else untilGoal++;
  }
  return { untilGoal, afterGoal, overdue };
}
