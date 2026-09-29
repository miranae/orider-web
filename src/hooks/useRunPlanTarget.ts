import { useEffect, useMemo, useState } from "react";
import type { Goal, PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { toRunNextTrainingSession, type RunNextTrainingSession } from "./useRunNextTraining";

/** 정확한 현재 소유자의 goal/week/day/date만 연다. 결측 참조는 다른 날짜로 대체하지 않는다. */
export function resolveRunPlanTarget(params: URLSearchParams, viewerUid: string | undefined, goal: Goal | null, weeks: PlanWeek[]): { session: RunNextTrainingSession; weekIndex: number } | null {
  if (!viewerUid || !goal || goal.userId !== viewerUid || goal.discipline !== "run" || goal.status !== "active"
    || params.get("sport") !== "run" || params.get("goalId") !== goal.id) return null;
  if (weeks.some(week => !Array.isArray(week?.days))) return null;
  const dayIndexText = params.get("dayIndex");
  const date = params.get("date");
  if (!dayIndexText || !/^[0-6]$/.test(dayIndexText) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const weekIndex = weeks.findIndex(week => week.id === params.get("weekId"));
  const week = weeks[weekIndex];
  const dayIndex = Number(dayIndexText);
  const day = Array.isArray(week?.days) ? week.days[dayIndex] : undefined;
  if (!week || !day || planDayKey(day.date) !== date || day.completed || day.skipped || day.actualActivityId) return null;
  const session = toRunNextTrainingSession(goal.id, week, dayIndex);
  return session ? { session, weekIndex } : null;
}

export function useRunPlanTarget(params: URLSearchParams, viewerUid: string | undefined, isAnonymous: boolean, goal: Goal | null, weeks: PlanWeek[], loading: boolean, loadError: unknown, isTodayCell: (day: PlanWeek["days"][number]) => boolean, onWeekOffset: (offset: number) => void) {
  const query = params.toString();
  const key = `${viewerUid ?? ""}:${goal?.id ?? ""}:${query}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const requested = params.has("goalId") || params.has("weekId") || params.has("dayIndex") || params.has("date");
  const target = useMemo(() => !loading && !loadError && !isAnonymous
    ? resolveRunPlanTarget(new URLSearchParams(query), viewerUid, goal, weeks) : null,
  [query, viewerUid, goal, weeks, loading, loadError, isAnonymous]);
  useEffect(() => {
    if (!target || dismissedKey === key) return;
    const todayIndex = weeks.findIndex(week => Array.isArray(week.days) && week.days.some(isTodayCell));
    const futureIndex = weeks.findIndex(week => Array.isArray(week.days) && week.days.some(day => day.date >= Date.now()));
    const current = todayIndex >= 0 ? todayIndex : futureIndex >= 0 ? futureIndex : Math.max(0, weeks.length - 1);
    onWeekOffset(target.weekIndex - current);
  }, [target, weeks, isTodayCell, onWeekOffset, dismissedKey, key]);
  return { session: dismissedKey !== key ? target?.session ?? null : null,
    unavailable: requested && !loading && !target && !isAnonymous && !!viewerUid,
    close: () => setDismissedKey(key) };
}
