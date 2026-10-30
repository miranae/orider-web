import { planCalendarDate, planDayKey, planMonthBounds } from "@shared/training/planDate";
import { seoulWeekStartMs, WEEK_MS } from "../../utils/seoulWeek";
import type { Activity } from "@shared/types";
import type { WeeklyStat } from "../WeeklyChart";
import { sumAcceptedActivityTss } from "../../utils/estimateTSS";
import { resolveDuration } from "../../utils/activityTime";

export interface AthletePeriod { start: number; end: number; label: string }
export function athleteProfilePeriods(activities: Activity[], year: number, mode: "week" | "month", loadActivities = activities) {
  const periods = new Map<string, { range: AthletePeriod; stat: WeeklyStat }>();
  const yearStart = planMonthBounds(year, 0).start;
  const yearEnd = planMonthBounds(year + 1, 0).start;
  const bounds = (time: number) => {
    const date = planCalendarDate(time);
    const month = planMonthBounds(date.getUTCFullYear(), date.getUTCMonth());
    const start = mode === "month" ? month.start : seoulWeekStartMs(time);
    const end = mode === "month" ? month.end + 1 : start + WEEK_MS;
    const key = mode === "month" ? planDayKey(start).slice(0, 7).replace("-", ".") : planDayKey(start);
    return { start, end, key };
  };
  for (let cursor = yearStart; cursor < yearEnd;) {
    const { start, end, key } = bounds(cursor);
    periods.set(key, { range: { start: Math.max(yearStart, start), end: Math.min(yearEnd, end), label: key }, stat: { week: key, distance: 0, time: 0, elevation: 0, rides: 0, tss: null, tssEstimated: false } });
    cursor = end;
  }
  for (const activity of activities) {
    if (!Number.isFinite(activity.startTime) || activity.startTime < yearStart || activity.startTime >= yearEnd) continue;
    const period = periods.get(bounds(activity.startTime).key)!;
    period.stat.distance += Number.isFinite(activity.summary?.distance) ? activity.summary.distance / 1000 : 0;
    period.stat.elevation += Number.isFinite(activity.summary?.elevationGain) ? activity.summary.elevationGain : 0;
    const duration = resolveDuration(activity.summary ?? {}).displayMs;
    period.stat.time += Number.isFinite(duration) ? duration / 3600000 : 0;
    period.stat.rides += 1;
  }
  for (const period of periods.values()) {
    const load = sumAcceptedActivityTss(loadActivities.filter(activity => activity.startTime >= period.range.start && activity.startTime < period.range.end));
    period.stat.tss = load.value;
    period.stat.tssEstimated = load.estimated;
    period.stat.tssUnknownCount = load.unknownCount;
  }
  return [...periods.values()].sort((a, b) => a.range.start - b.range.start);
}
