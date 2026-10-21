import { profileWeeklyStreak } from "./profileWeeklyStreak";
import { seoulWeekStartMs, WEEK_MS } from "./seoulWeek";
const now = Date.parse("2026-10-21T12:00:00+09:00");
const monday = seoulWeekStartMs(now);
const cutoff = monday - 51 * WEEK_MS;
const ride = (weeksAgo: number) => monday - weeksAgo * WEEK_MS + 3600000;
it("shows a real sixteen week streak with a verified preceding gap", () => {
  const result = profileWeeklyStreak(Array.from({ length: 16 }, (_, index) => ride(index)), cutoff, now);
  expect(result).toMatchObject({ weeksCount: 16, atLeast: false });
  expect(result.week[0]?.active).toBe(true); expect(result.week[2]?.today).toBe(true);
});
it("keeps last week's streak when the current week has no activity", () => {
  expect(profileWeeklyStreak([ride(1), ride(2)], cutoff, now)).toMatchObject({ weeksCount: 2, atLeast: false });
});
it("ends a streak at a proven empty week rather than the latest historical activity", () => {
  expect(profileWeeklyStreak([ride(2), ride(3)], cutoff, now)).toMatchObject({ weeksCount: 0, atLeast: false });
});
it("marks a streak continuing past the query horizon as a lower bound", () => {
  expect(profileWeeklyStreak(Array.from({ length: 52 }, (_, index) => ride(index)), cutoff, now)).toMatchObject({ weeksCount: 52, atLeast: true });
});
it("does not invent zero or inactive days when a row cap covers only part of this week", () => {
  const since = monday + 86400000;
  const result = profileWeeklyStreak([], since, now);
  expect(result).toMatchObject({ weeksCount: null, atLeast: true });
  expect(result.week[0]?.active).toBeNull();
});
it("counts a positive partial earliest week without claiming the preceding week is empty", () => {
  const since = monday - WEEK_MS + 3600000;
  expect(profileWeeklyStreak([ride(0), since + 1000], since, now)).toMatchObject({ weeksCount: 2, atLeast: true });
});
it("uses KST Monday across the UTC Sunday boundary and ignores future records", () => {
  const boundary = Date.parse("2026-10-19T00:05:00+09:00");
  const result = profileWeeklyStreak([boundary - 1000, boundary + WEEK_MS], cutoff, boundary);
  expect(result).toMatchObject({ weeksCount: 1, atLeast: false });
  expect(result.week[0]).toMatchObject({ active: true, today: true });
});
