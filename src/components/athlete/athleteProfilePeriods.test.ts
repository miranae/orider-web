import { athleteProfilePeriods } from "./athleteProfilePeriods";
import { recentAthleteDays } from "./AthleteRecentSummary";
import { createMockActivity, createMockSummary } from "../../__tests__/fixtures/mockData";

const kst = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(Date.UTC(year, month, day, hour, minute) - 9 * 3600000);
const activity = (date: Date) => createMockActivity({ startTime: date.getTime(), summary: createMockSummary({ distance: 10000, ridingTimeMillis: 3600000, movingTimeSec: 1800, pauseTimeSec: 1800 }) });
it("keeps calendar-year boundaries and zero months while using display duration", () => {
  const periods = athleteProfilePeriods([activity(kst(2025, 11, 31)), activity(kst(2026, 0, 1)), activity(kst(2027, 0, 1))], 2026, "month");
  expect(periods).toHaveLength(12);
  expect(periods[0]!.stat).toMatchObject({ distance: 10, time: 0.5, rides: 1 });
  expect(periods[1]!.stat.rides).toBe(0);
  expect(periods[11]!.range.end).toBe(kst(2027, 0, 1).getTime());
});
it("clips cross-year Monday weeks without including activities outside the selected year", () => {
  const periods = athleteProfilePeriods([activity(kst(2025, 11, 31)), activity(kst(2026, 0, 1)), activity(kst(2026, 0, 4)), activity(kst(2026, 0, 5))], 2026, "week");
  expect(periods[0]!.range.start).toBe(kst(2026, 0, 1).getTime());
  expect(periods[0]!.range.end).toBe(kst(2026, 0, 5).getTime());
  expect(periods[0]!.stat.rides).toBe(2);
  expect(periods[1]!.stat.rides).toBe(1);
});
it("shows exactly 28 KST calendar days including today, excluding tomorrow and earlier days", () => {
  const today = kst(2026, 9, 21, 12);
  const days = recentAthleteDays([activity(kst(2026, 8, 23, 23)), activity(kst(2026, 8, 24)), activity(kst(2026, 9, 21, 23)), activity(kst(2026, 9, 22))], today);
  expect(days).toHaveLength(28);
  expect(days[0]!.date.getTime()).toBe(kst(2026, 8, 24).getTime());
  expect(days.flatMap(day => day.items)).toHaveLength(2);
});

it("preserves known training load separately from physical activity counts", () => {
  const date = kst(2026, 8, 1);
  const physical = activity(date);
  const training = { ...physical, summary: { ...physical.summary, tss: 42 } };
  const rows = athleteProfilePeriods([physical], 2026, "month", [training]);
  expect(rows[8]!.stat).toMatchObject({ rides: 1, tss: 42, tssEstimated: false, tssUnknownCount: 0 });
  const loadOnly = athleteProfilePeriods([], 2026, "month", [training]);
  expect(loadOnly[8]!.stat).toMatchObject({ rides: 0, tss: 42 });
});

it("retains estimated load and the unknown-activity qualifier", () => {
  const start = kst(2026, 8, 1).getTime();
  const known = createMockActivity({ id: "known", startTime: start, endTime: start + 3600000, summary: { ridingTimeMillis: 3600000 } as never });
  const unknown = createMockActivity({ id: "unknown", startTime: start + 86400000, endTime: start + 90000000, summary: {} as never });
  expect(athleteProfilePeriods([known, unknown], 2026, "month")[8]!.stat).toMatchObject({ tss: 42, tssEstimated: true, tssUnknownCount: 1 });
});

 it("keeps exact KST year and Monday boundaries for fixed UTC timestamps", () => {
  const rows = ["2025-12-31T14:59:59.999Z", "2025-12-31T15:00:00.000Z", "2026-01-04T14:59:59.999Z", "2026-01-04T15:00:00.000Z"].map(value => activity(new Date(value)));
  const periods = athleteProfilePeriods(rows, 2026, "week");
  expect(periods[0]!.range).toMatchObject({start: Date.parse("2025-12-31T15:00:00Z"), end: Date.parse("2026-01-04T15:00:00Z")});
  expect(periods.slice(0, 2).map(row => row.stat.rides)).toEqual([2, 1]);
  const days = recentAthleteDays(rows, new Date("2025-12-31T15:30:00Z"));
  expect(days[27]!.date.toISOString()).toBe("2025-12-31T15:00:00.000Z");
  expect(days[27]!.items).toHaveLength(1);
 });
