import { athleteProfilePeriods } from "./athleteProfilePeriods";
import { recentAthleteDays } from "./AthleteRecentSummary";
import { createMockActivity, createMockSummary } from "../../__tests__/fixtures/mockData";

const activity = (date: Date) => createMockActivity({ startTime: date.getTime(), summary: createMockSummary({ distance: 10000, ridingTimeMillis: 3600000, movingTimeSec: 1800, pauseTimeSec: 1800 }) });
it("keeps calendar-year boundaries and zero months while using display duration", () => {
  const periods = athleteProfilePeriods([activity(new Date(2025, 11, 31)), activity(new Date(2026, 0, 1)), activity(new Date(2027, 0, 1))], 2026, "month");
  expect(periods).toHaveLength(12);
  expect(periods[0]!.stat).toMatchObject({ distance: 10, time: 0.5, rides: 1 });
  expect(periods[1]!.stat.rides).toBe(0);
  expect(periods[11]!.range.end).toBe(new Date(2027, 0, 1).getTime());
});
it("clips cross-year Monday weeks without including activities outside the selected year", () => {
  const periods = athleteProfilePeriods([activity(new Date(2025, 11, 31)), activity(new Date(2026, 0, 1)), activity(new Date(2026, 0, 4)), activity(new Date(2026, 0, 5))], 2026, "week");
  expect(periods[0]!.range.start).toBe(new Date(2026, 0, 1).getTime());
  expect(periods[0]!.range.end).toBe(new Date(2026, 0, 5).getTime());
  expect(periods[0]!.stat.rides).toBe(2);
  expect(periods[1]!.stat.rides).toBe(1);
});
it("shows exactly 28 local calendar days including today, excluding tomorrow and earlier days", () => {
  const today = new Date(2026, 9, 21, 12);
  const days = recentAthleteDays([activity(new Date(2026, 8, 23, 23)), activity(new Date(2026, 8, 24)), activity(new Date(2026, 9, 21, 23)), activity(new Date(2026, 9, 22))], today);
  expect(days).toHaveLength(28);
  expect(days[0]!.date.getTime()).toBe(new Date(2026, 8, 24).getTime());
  expect(days.flatMap(day => day.items)).toHaveLength(2);
});

it("preserves known training load separately from physical activity counts", () => {
  const date = new Date(2026, 8, 1);
  const physical = activity(date);
  const training = { ...physical, summary: { ...physical.summary, tss: 42 } };
  const rows = athleteProfilePeriods([physical], 2026, "month", [training]);
  expect(rows[8]!.stat).toMatchObject({ rides: 1, tss: 42, tssEstimated: false, tssUnknownCount: 0 });
  const loadOnly = athleteProfilePeriods([], 2026, "month", [training]);
  expect(loadOnly[8]!.stat).toMatchObject({ rides: 0, tss: 42 });
});

it("retains estimated load and the unknown-activity qualifier", () => {
  const start = new Date(2026, 8, 1).getTime();
  const known = createMockActivity({ id: "known", startTime: start, endTime: start + 3600000, summary: { ridingTimeMillis: 3600000 } as never });
  const unknown = createMockActivity({ id: "unknown", startTime: start + 86400000, endTime: start + 90000000, summary: {} as never });
  expect(athleteProfilePeriods([known, unknown], 2026, "month")[8]!.stat).toMatchObject({ tss: 42, tssEstimated: true, tssUnknownCount: 1 });
});
