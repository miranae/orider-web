import { describe, expect, it } from "vitest";
import type { PlanDay } from "@shared/types/goal";
import { effectivePlanTSS, sumEffectivePlanTSS } from "./planTss";

function day(overrides: Partial<PlanDay> = {}): PlanDay {
  return {
    date: new Date("2026-07-06T00:00:00+09:00").getTime(),
    dayOfWeek: 0,
    workout: "z2",
    plannedTSS: 50,
    plannedDurationMin: 60,
    completed: false,
    skipped: false,
    ...overrides,
  };
}

describe("effectivePlanTSS", () => {
  it("uses adjusted TSS for planned adapted workouts", () => {
    expect(effectivePlanTSS(day({ plannedTSS: 50, adjustedTSS: 42 }))).toBe(42);
  });

  it("uses actual TSS for completed workouts", () => {
    expect(effectivePlanTSS(day({ plannedTSS: 50, adjustedTSS: 42, completed: true, actualTSS: 64 }))).toBe(64);
  });

  it("falls back to adjusted or planned TSS when a completed workout has no actual TSS", () => {
    expect(effectivePlanTSS(day({ plannedTSS: 50, adjustedTSS: 42, completed: true }))).toBe(42);
    expect(effectivePlanTSS(day({ plannedTSS: 50, completed: true }))).toBe(50);
  });

  it("counts skipped workouts as zero", () => {
    expect(effectivePlanTSS(day({ plannedTSS: 50, adjustedTSS: 42, completed: true, actualTSS: 64, skipped: true }))).toBe(0);
  });
});

describe("sumEffectivePlanTSS", () => {
  it("sums the same effective values used by week headers and sport stacks", () => {
    expect(sumEffectivePlanTSS([
      day({ plannedTSS: 50, adjustedTSS: 40 }),
      day({ plannedTSS: 50, completed: true, actualTSS: 70 }),
      day({ plannedTSS: 50, skipped: true }),
    ])).toBe(110);
  });
});
