import { describe, expect, it } from "vitest";
import type { Goal, PlanWeek } from "@shared/types/goal";
import { goalLoadScope, summarizeStoredPlan } from "./planScope";

const day = (date: string, overrides = {}) => ({ date: Date.parse(`${date}T12:00:00+09:00`), workout: "z2", completed: false, skipped: false, ...overrides });
describe("stored plan presentation ranges", () => {
  it("separates overdue, through-goal and after-goal days without modifying the stored schedule", () => {
    const weeks = [{ days: [day("2026-10-16"), day("2026-10-17"), day("2026-10-18"), day("2026-10-21"),
      day("2026-10-22", { completed: true }), day("2026-10-23", { skipped: true }), day("2026-10-24", { workout: "rest" }), day("2026-10-18", { workout: "goal" })] }] as PlanWeek[];
    const before = JSON.stringify(weeks);
    expect(summarizeStoredPlan(weeks, new Date("2026-10-18T00:00:00+09:00"), Date.parse("2026-10-17T23:00:00+09:00"))).toEqual({ untilGoal: 2, afterGoal: 1, overdue: 1 });
    expect(JSON.stringify(weeks)).toBe(before);
  });
});


it("counts only pending occurrences despite stale false mirrors and preserves the embedded legacy count", () => {
  const weeks = [{ days: ["completed", "skipped", "postponed", "partial"].map(executionStatus => day("2026-10-21", { executionStatus })).concat([day("2026-10-22")]) }] as PlanWeek[];
  const now = Date.parse("2026-10-20T00:00:00+09:00");
  const before = JSON.stringify(weeks);
  expect(summarizeStoredPlan(weeks, null, now)).toEqual({ untilGoal: 1, afterGoal: 0, overdue: 0 });
  expect(summarizeStoredPlan(weeks, null, now, { legacy: true })).toEqual({ untilGoal: 5, afterGoal: 0, overdue: 0 });
  expect(JSON.stringify(weeks)).toBe(before);
});


describe("goal load scope", () => {
  const weeks = [{ days: [day("2026-08-17"), day("2026-10-25")] }] as PlanWeek[];
  const now = Date.parse("2026-10-23T00:00:00+09:00");
  it("uses the canonical deadline, excludes post-goal plans and reports zero remaining weeks after it passes", () => {
    const goal = { targetDate: Date.parse("2026-10-18T23:30:00+09:00"), eventDate: Date.parse("2026-10-25T00:00:00+09:00") } as Goal;
    expect(goalLoadScope(weeks, goal, now)).toMatchObject({ valid: true, expired: true, remainingWeeks: 0, range: { start: "2026-08-17", end: "2026-10-18" } });
    expect(goalLoadScope(weeks, { ...goal, targetDate: undefined }, now).range.end).toBe("2026-10-25");
  });
  it("does not replace malformed, missing, reversed or oversized goal ranges with all stored plans", () => {
    for (const targetDate of [NaN, undefined, Date.parse("2026-08-16T00:00:00+09:00"), Date.parse("2028-10-18T00:00:00+09:00")]) {
      expect(goalLoadScope(weeks, { targetDate, eventDate: NaN } as Goal, now).valid).toBe(false);
    }
  });
});
