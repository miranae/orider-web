import type { CafeScheduleEntry } from "@shared/clubCafeSchedule";
/** Meeting authoring dates and departure times are always Korea local time. */
export function meetingToday(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function calendarDays(month: string): (string | null)[] {
  const year = Number(month.slice(0, 4)), index = Number(month.slice(5, 7));
  const count = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const cells: (string | null)[] = Array(new Date(Date.UTC(year, index - 1, 1)).getUTCDay()).fill(null);
  for (let day = 1; day <= count; day++) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function shiftMonth(month: string, offset: number): string {
  const year = Number(month.slice(0, 4)), index = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function groupCafeDates(items: CafeScheduleEntry[]): [string, CafeScheduleEntry[]][] {
  const dates = new Map<string, CafeScheduleEntry[]>();
  for (const item of items) for (const date of item.dates) {
    const rows = dates.get(date) ?? [];
    if (!rows.some(row => row.id === item.id)) rows.push(item);
    dates.set(date, rows);
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b));
}
