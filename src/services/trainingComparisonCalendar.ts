import type { PowerCurvePeriod } from "@shared/types/power-curve-periods";

const DAY = 86_400_000;
const KST = 9 * 3_600_000;
export type TrainingComparisonPreset = "fourWeeks" | "yearToDate";
/** Product comparison calendar; independent of the user's historical PMC day basis. */
export function trainingCalendarDate(timestamp: number): string {
  return new Date(timestamp + KST).toISOString().slice(0, 10);
}
function midnight(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return NaN;
  const utc = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(utc) && new Date(utc).toISOString().slice(0, 10) === date ? utc - KST : NaN;
}
/** Inclusive date inputs, exclusive timestamp end; today stops at the request instant. */
export function trainingCalendarPeriod(from: string, through: string, now: number): PowerCurvePeriod | null {
  const start = midnight(from), end = midnight(through);
  const stop = Math.min(end + DAY, now);
  return Number.isSafeInteger(now) && Number.isSafeInteger(start) && start >= 0
    && Number.isFinite(end) && end >= start && end <= now && start < stop
    ? { fromInclusive: start, toExclusive: stop } : null;
}
export function trainingComparisonPeriods(preset: TrainingComparisonPreset, now: number): PowerCurvePeriod[] {
  const today = midnight(trainingCalendarDate(now));
  if (preset === "fourWeeks") return [
    { fromInclusive: today - 28 * DAY, toExclusive: today },
    { fromInclusive: today - 56 * DAY, toExclusive: today - 28 * DAY },
  ];
  const date = new Date(now + KST), year = date.getUTCFullYear(), month = date.getUTCMonth();
  // Feb 29 compares through Feb 28 at the same KST clock in a non-leap year.
  const priorDay = Math.min(date.getUTCDate(), new Date(Date.UTC(year - 1, month + 1, 0)).getUTCDate());
  const priorEnd = Date.UTC(year - 1, month, priorDay, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()) - KST;
  return [
    { fromInclusive: Date.UTC(year, 0, 1) - KST, toExclusive: now },
    { fromInclusive: Date.UTC(year - 1, 0, 1) - KST, toExclusive: priorEnd },
  ];
}
