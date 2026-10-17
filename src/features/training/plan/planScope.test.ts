import { describe, expect, it } from "vitest";
import type { PlanWeek } from "@shared/types/goal";
import { summarizeStoredPlan } from "./planScope";

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
