import { describe, expect, it } from "vitest";
import { trainingCalendarDate, trainingCalendarPeriod, trainingComparisonPeriods } from "./trainingComparisonCalendar";
const ms = Date.parse;
describe("KST training comparison calendar", () => {
  it("keeps dates across UTC midnight and the Korean year boundary", () => {
    expect(trainingCalendarDate(ms("2025-12-31T15:00:00Z"))).toBe("2026-01-01");
    expect(trainingCalendarPeriod("2026-01-01", "2026-01-01", ms("2026-01-02T00:00:00Z")))
      .toEqual({ fromInclusive: ms("2025-12-31T15:00:00Z"), toExclusive: ms("2026-01-01T15:00:00Z") });
  });
  it("compares exactly two adjacent complete 28-day windows excluding today", () => {
    const [a, b] = trainingComparisonPeriods("fourWeeks", ms("2026-10-25T16:10:00Z"));
    expect(a!.toExclusive).toBe(ms("2026-10-25T15:00:00Z"));
    expect(a!.fromInclusive).toBe(b!.toExclusive);
    expect(a!.toExclusive - a!.fromInclusive).toBe(28 * 86400000);
    expect(b!.toExclusive - b!.fromInclusive).toBe(28 * 86400000);
  });
  it("clamps leap day without rolling the prior period into March", () => {
    const [a, b] = trainingComparisonPeriods("yearToDate", ms("2024-02-29T03:04:05.006Z"));
    expect(a).toEqual({ fromInclusive: ms("2023-12-31T15:00:00Z"), toExclusive: ms("2024-02-29T03:04:05.006Z") });
    expect(b).toEqual({ fromInclusive: ms("2022-12-31T15:00:00Z"), toExclusive: ms("2023-02-28T03:04:05.006Z") });
  });
  it("clips today, rejects future/reversed/impossible dates", () => {
    const now = ms("2026-10-25T16:00:00Z");
    expect(trainingCalendarPeriod("2026-10-26", "2026-10-26", now)?.toExclusive).toBe(now);
    for (const [from, through] of [["2026-02-30", "2026-03-01"], ["2026-10-27", "2026-10-27"], ["2026-10-25", "2026-10-24"]])
      expect(trainingCalendarPeriod(from!, through!, now)).toBeNull();
  });
});
