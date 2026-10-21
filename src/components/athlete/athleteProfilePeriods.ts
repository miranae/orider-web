import type { Activity } from "@shared/types";
import type { WeeklyStat } from "../WeeklyChart";
import { sumAcceptedActivityTss } from "../../utils/estimateTSS";
import { resolveDuration } from "../../utils/activityTime";

export interface AthletePeriod { start: number; end: number; label: string }
export function athleteProfilePeriods(activities: Activity[], year: number, mode: "week" | "month", loadActivities = activities) {
  const periods = new Map<string, { range: AthletePeriod; stat: WeeklyStat }>();
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year + 1, 0, 1).getTime();
  for (const activity of activities) {
    if (activity.startTime < yearStart || activity.startTime >= yearEnd || !Number.isFinite(activity.startTime)) continue;
    const date = new Date(activity.startTime);
    const start = new Date(date.getFullYear(), date.getMonth(), mode === "month" ? 1 : date.getDate());
    if (mode === "week") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const end = new Date(start);
    if (mode === "week") end.setDate(start.getDate() + 7);
    else end.setMonth(start.getMonth() + 1);
    const key = mode === "month" ? `${year}.${String(start.getMonth() + 1).padStart(2, "0")}` : `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    let period = periods.get(key);
    if (!period) {
      period = { range: { start: Math.max(yearStart, start.getTime()), end: Math.min(yearEnd, end.getTime()), label: key }, stat: { week: key, distance: 0, time: 0, elevation: 0, rides: 0, tss: null, tssEstimated: false } };
      periods.set(key, period);
    }
    period.stat.distance += Number.isFinite(activity.summary?.distance) ? activity.summary.distance / 1000 : 0;
    period.stat.elevation += Number.isFinite(activity.summary?.elevationGain) ? activity.summary.elevationGain : 0;
    const duration = resolveDuration(activity.summary ?? {}).displayMs;
    period.stat.time += Number.isFinite(duration) ? duration / 3600000 : 0;
    period.stat.rides += 1;
  }
  const cursor = new Date(year, 0, 1);
  if (mode === "week") cursor.setDate(cursor.getDate() - (cursor.getDay() + 6) % 7);
  while (cursor.getTime() < yearEnd) {
    const end = new Date(cursor);
    if (mode === "week") end.setDate(end.getDate() + 7);
    else end.setMonth(end.getMonth() + 1);
    const key = mode === "month" ? `${year}.${String(cursor.getMonth() + 1).padStart(2, "0")}` : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (!periods.has(key)) periods.set(key, { range: { start: Math.max(yearStart, cursor.getTime()), end: Math.min(yearEnd, end.getTime()), label: key }, stat: { week: key, distance: 0, time: 0, elevation: 0, rides: 0, tss: null, tssEstimated: false } });
    cursor.setTime(end.getTime());
  }
  for (const period of periods.values()) {
    const load = sumAcceptedActivityTss(loadActivities.filter(activity => activity.startTime >= period.range.start && activity.startTime < period.range.end));
    period.stat.tss = load.value;
    period.stat.tssEstimated = load.estimated;
    period.stat.tssUnknownCount = load.unknownCount;
  }
  return [...periods.values()].sort((a, b) => a.range.start - b.range.start);
}
