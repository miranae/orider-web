import { describe, expect, it } from "vitest";

import {
  applyDisciplineToWorkout,
  getWorkoutCategory,
  makeFactChips,
  tsbTone,
  workoutToRecType,
  workoutToZone,
} from "./todaysWorkoutUtils";

const t = (key: string, opts?: Record<string, unknown>) =>
  opts && "value" in opts ? `${key}:${opts.value}` : key;

describe("todaysWorkoutUtils", () => {
  it("classifies workout intent for recommendation facts", () => {
    expect(getWorkoutCategory("z2")).toBe("base");
    expect(getWorkoutCategory("intervalRun")).toBe("vo2");
    expect(workoutToRecType("threshRun")).toBe("threshold");
    expect(workoutToZone("vo2")).toBe(5);
  });

  it("maps generic workouts to discipline-specific display kinds", () => {
    expect(applyDisciplineToWorkout("z2Long", "run")).toBe("longRun");
    expect(applyDisciplineToWorkout("ftp", "swim")).toBe("cssSwim");
    expect(applyDisciplineToWorkout("tempo", "bike")).toBe("tempo");
  });

  it("builds status chips with stable tones", () => {
    expect(tsbTone(-20)).toBe("rose");
    expect(tsbTone(0)).toBe("amber");
    expect(tsbTone(8)).toBe("lime");
    expect(makeFactChips({ tsb: 4, recent7d: 123.4, daysSinceLastActivity: 1, goalDaysUntil: 9 }, t).map((c) => c.label))
      .toEqual(["TSB +4.0", "today.sevenDayTss:123", "today.activityYesterday", "D-9"]);
  });
});
