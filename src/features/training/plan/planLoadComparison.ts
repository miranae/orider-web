import type { Activity } from "@shared/types";
import type { PlanWeek } from "@shared/types/goal";
import { planDayKey } from "@shared/training/planDate";
import { disciplineOfType } from "@shared/sport/discipline";
import type { Discipline } from "../../../utils/disciplineFilter";
import { acceptedTrainingActivities, estimateActivityTss } from "../../../utils/estimateTSS";
import { getWorkoutDiscipline } from "../../../utils/workoutDiscipline";

export type PlanLoadRange = { start: string; end: string };
export interface PlanLoadComparisonSummary {
  plannedTss: number | null;
  plannedDayCount: number;
  actualTss: number | null;
  ratioPct: number | null;
  deltaTss: number | null;
  estimated: boolean;
  unknownCount: number;
}
export interface PlanLoadComparisonRow extends PlanLoadComparisonSummary { date: string; future: boolean; activityIds?: string[] }
export interface PlanLoadComparison { summary: PlanLoadComparisonSummary; days: PlanLoadComparisonRow[] }
const DAY_MS = 86_400_000;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function getPlanLoadRangeBounds(range: PlanLoadRange) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(range.end)) return null;
  const startMs = Date.parse(`${range.start}T00:00:00+09:00`);
  const lastMs = Date.parse(`${range.end}T00:00:00+09:00`);
  const dayCount = (lastMs - startMs) / DAY_MS + 1;
  if (planDayKey(startMs) !== range.start || planDayKey(lastMs) !== range.end || !Number.isInteger(dayCount) || dayCount < 1 || dayCount > 366) return null;
  return { startMs, endExclusiveMs: lastMs + DAY_MS, dayCount };
}

const emptySummary = (): PlanLoadComparisonSummary => ({ plannedDayCount: 0, plannedTss: null, actualTss: null, ratioPct: null, deltaTss: null, estimated: false, unknownCount: 0 });
function compare(plannedTss: number | null, actualTss: number | null) {
  return { ratioPct: plannedTss !== null && plannedTss > 0 && actualTss !== null ? actualTss / plannedTss * 100 : null,
    deltaTss: plannedTss !== null && actualTss !== null ? actualTss - plannedTss : null };
}

/** 대표 활동은 범위·종목 필터 전에 선택한다. 실행 연결 유무는 실제 부하의 산입 조건이 아니다. */
export function computePlanLoadComparison(weeks: readonly PlanWeek[], activities: readonly Activity[], range: PlanLoadRange,
  discipline: Discipline, now = Date.now(), ftp?: number): PlanLoadComparison {
  const bounds = getPlanLoadRangeBounds(range);
  if (!bounds || !Number.isFinite(now)) return { summary: emptySummary(), days: [] };
  const today = planDayKey(now);
  const byDate = new Map<string, PlanLoadComparisonRow>();
  for (let i = 0; i < bounds.dayCount; i++) {
    const date = planDayKey(bounds.startMs + i * DAY_MS);
    const future = date > today;
    byDate.set(date, { date, future, activityIds: [], plannedDayCount: 0, plannedTss: 0, actualTss: future ? null : 0, ratioPct: null, deltaTss: null, estimated: false, unknownCount: 0 });
  }
  for (const week of weeks) for (const day of week.days ?? []) {
    const row = byDate.get(planDayKey(day.date));
    if (!row) continue;
    const sport = getWorkoutDiscipline(day.workout, discipline);
    if (sport !== "rest" && discipline !== "tri" && sport !== discipline) continue;
    row.plannedDayCount++;
    const planned = day.workout === "rest" ? 0 : day.adjustedTSS ?? day.plannedTSS;
    row.plannedTss = row.plannedTss !== null && nonnegative(planned) ? row.plannedTss + planned : null;
  }
  for (const activity of acceptedTrainingActivities(activities, ftp)) {
    if (activity.startTime > now || discipline !== "tri" && disciplineOfType(activity.type) !== discipline) continue;
    const row = byDate.get(planDayKey(activity.startTime));
    if (!row || row.future) continue;
    row.activityIds!.push(activity.id);
    const load = estimateActivityTss(activity, ftp);
    if (!nonnegative(load.value)) { row.unknownCount++; row.actualTss = null; }
    else if (row.actualTss !== null) row.actualTss += load.value;
    row.estimated ||= load.estimated;
  }
  const days = [...byDate.values()].map(row => {
    const plannedTss = row.plannedDayCount ? row.plannedTss : null;
    return { ...row, plannedTss, ...compare(plannedTss, row.actualTss) };
  });
  const elapsed = days.filter(row => !row.future);
  const plannedDayCount = days.reduce((sum, row) => sum + row.plannedDayCount, 0);
  const plannedTss = !plannedDayCount || days.some(row => row.plannedDayCount > 0 && row.plannedTss === null) ? null : days.reduce((sum, row) => sum + (row.plannedTss ?? 0), 0);
  const actualTss = !elapsed.length || elapsed.some(row => row.actualTss === null) ? null : elapsed.reduce((sum, row) => sum + row.actualTss!, 0);
  return { days, summary: { plannedDayCount, plannedTss, actualTss, ...compare(plannedTss, actualTss), estimated: elapsed.some(row => row.estimated), unknownCount: elapsed.reduce((sum, row) => sum + row.unknownCount, 0) } };
}
