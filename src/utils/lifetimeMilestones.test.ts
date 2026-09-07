import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { computeLifetimeMilestones, LIFETIME_MILESTONE_KM } from "./lifetimeMilestones";

function act(id: string, startTime: string, distanceMeters: number, type = "Ride"): Activity {
  return {
    id,
    userId: "u1",
    type,
    startTime: new Date(startTime).getTime(),
    summary: {
      distance: distanceMeters,
      ridingTimeMillis: 1_000_000,
      elevationGain: 100,
    },
  } as Activity;
}

describe("computeLifetimeMilestones", () => {
  it("returns zeroed summary with no achievements for an empty activity list", () => {
    const summary = computeLifetimeMilestones([]);
    expect(summary.totalDistanceMeters).toBe(0);
    expect(summary.longestRide).toBeNull();
    expect(summary.milestones).toHaveLength(LIFETIME_MILESTONE_KM.length);
    expect(summary.milestones.every((m) => !m.achieved && m.achievedAt === null)).toBe(true);
  });

  it("sums distance across all disciplines regardless of input order", () => {
    const activities = [
      act("a2", "2026-02-01", 60_000, "Run"),
      act("a1", "2026-01-01", 40_000, "Ride"),
    ];
    const summary = computeLifetimeMilestones(activities);
    expect(summary.totalDistanceMeters).toBe(100_000);
  });

  it("marks the 100km milestone achieved at the crossing activity's startTime", () => {
    const activities = [
      act("a1", "2026-01-01", 60_000),
      act("a2", "2026-01-08", 50_000),
    ];
    const summary = computeLifetimeMilestones(activities);
    const m100 = summary.milestones.find((m) => m.km === 100)!;
    expect(m100.achieved).toBe(true);
    expect(m100.achievedAt).toBe(new Date("2026-01-08").getTime());

    const m500 = summary.milestones.find((m) => m.km === 500)!;
    expect(m500.achieved).toBe(false);
    expect(m500.achievedAt).toBeNull();
  });

  it("treats a single activity that exactly meets the threshold as achieved (boundary, inclusive)", () => {
    const activities = [act("a1", "2026-01-01", 100_000)];
    const summary = computeLifetimeMilestones(activities);
    expect(summary.milestones.find((m) => m.km === 100)!.achieved).toBe(true);
  });

  it("picks the longest single-activity distance across all disciplines", () => {
    const activities = [
      act("a1", "2026-01-01", 30_000, "Ride"),
      act("a2", "2026-01-02", 42_195, "Run"),
      act("a3", "2026-01-03", 20_000, "Ride"),
    ];
    const summary = computeLifetimeMilestones(activities);
    expect(summary.longestRide).toEqual({
      activityId: "a2",
      distanceMeters: 42_195,
      startTime: new Date("2026-01-02").getTime(),
      type: "Run",
    });
  });

  it("ignores activities missing summary or non-positive distance", () => {
    const malformed = { id: "bad", userId: "u1", type: "Ride", startTime: Date.now() } as Activity;
    const zeroDistance = act("zero", "2026-01-01", 0);
    const summary = computeLifetimeMilestones([malformed, zeroDistance]);
    expect(summary.totalDistanceMeters).toBe(0);
    expect(summary.longestRide).toBeNull();
  });
});
