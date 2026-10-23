import { isPendingPlanWorkout } from "./planRecordPresentation";
import type { Goal, PlanWeek } from "@shared/types/goal";
import { getPlanLoadRangeBounds } from "./planLoadComparison";
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

/** 목표기간은 저장 계획 시작일부터 정본 목표일까지이며, 잘못된 목표일은 추정하지 않는다. */
export function goalLoadScope(weeks: PlanWeek[], goal: Goal | null | undefined, now: number) {
  const target = goal?.targetDate ?? goal?.eventDate;
  const goalDate = typeof target === "number" && Number.isFinite(target) && planDayKey(target) ? new Date(target) : null;
  const dates = weeks.flatMap(week => week.days.map(day => planDayKey(day.date))).filter(Boolean).sort();
  const range = { start: dates[0] ?? "", end: goalDate ? planDayKey(goalDate.getTime()) : "" };
  const valid = !!getPlanLoadRangeBounds(range);
  const today = planDayKey(now);
  const expired = !!goalDate && range.end < today;
  const remainingDays = goalDate ? Math.max(0, Math.round((Date.parse(`${range.end}T00:00:00+09:00`) - Date.parse(`${today}T00:00:00+09:00`)) / 86_400_000)) : null;
  return { range, valid, goalDate, expired, remainingWeeks: remainingDays === null ? null : Math.ceil(remainingDays / 7) };
}
