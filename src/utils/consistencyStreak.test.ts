import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { computeConsistencyStreak } from "./consistencyStreak";

function act(id: string, start: string): Activity {
  return {
    id,
    userId: "u1",
    type: "Ride",
    startTime: new Date(start).getTime(),
    summary: {
      distance: 10_000,
      ridingTimeMillis: 1_000_000,
      elevationGain: 100,
    },
  } as Activity;
}

describe("computeConsistencyStreak", () => {
  it("counts consecutive active weeks including the current week", () => {
    const now = new Date("2026-07-10T12:00:00+09:00").getTime();
    const summary = computeConsistencyStreak([
      act("w0", "2026-07-09T07:00:00+09:00"),
      act("w1", "2026-07-01T07:00:00+09:00"),
      act("w2", "2026-06-25T07:00:00+09:00"),
    ], now);

    expect(summary?.streakWeeks).toBe(3);
    expect(summary?.thisWeekCount).toBe(1);
    expect(summary?.needsThisWeek).toBe(0);
  });

  it("keeps the previous streak alive but asks for one ride when this week is empty", () => {
    const now = new Date("2026-07-10T12:00:00+09:00").getTime();
    const summary = computeConsistencyStreak([
      act("w1", "2026-07-01T07:00:00+09:00"),
      act("w2", "2026-06-25T07:00:00+09:00"),
    ], now);

    expect(summary?.streakWeeks).toBe(2);
    expect(summary?.thisWeekCount).toBe(0);
    expect(summary?.needsThisWeek).toBe(1);
  });

  it("returns null with no recent activities", () => {
    expect(computeConsistencyStreak([], new Date("2026-07-10T12:00:00+09:00").getTime())).toBeNull();
  });
});
