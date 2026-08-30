import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { deriveActivityStimulus } from "./activityStimulus";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "ride",
    type: "Ride",
    startTime: Date.parse("2026-08-29T08:00:00Z"),
    summary: {
      ridingTimeMillis: 7_200_000,
      normalizedPower: 180,
      averageHeartRate: 145,
    },
    ftp: 240,
    ...overrides,
  } as Activity;
}

describe("deriveActivityStimulus", () => {
  it("prefers the persisted server workout classification and keeps its provenance", () => {
    const metrics = {
      workoutType: "interval",
      workoutTypeConfidence: 0.92,
      if: 0.88,
      durationSec: 5_400,
      avgHr: 151,
      decoupling: { decouplingPct: 4.2 },
      contextSnapshot: { ftp: 255 },
    } as ActivityMetrics;

    expect(deriveActivityStimulus(activity(), metrics)).toEqual({
      workoutType: "interval",
      confidence: 0.92,
      source: "server-analysis",
      intensityFactor: 0.88,
      durationSec: 5_400,
      heartRateRecorded: true,
      ftp: 255,
      decouplingPct: 4.2,
    });
  });

  it("uses IF from the activity summary conservatively when server analysis is absent", () => {
    expect(deriveActivityStimulus(activity())).toMatchObject({
      workoutType: "endurance",
      confidence: null,
      source: "activity-summary",
      intensityFactor: 0.75,
      durationSec: 7_200,
      heartRateRecorded: true,
    });
  });

  it("does not infer intensity from distance, duration, or heart rate alone", () => {
    const withoutPowerContext = activity({
      ftp: undefined,
      summary: {
        distance: 100_000,
        ridingTimeMillis: 12_000_000,
        normalizedPower: 190,
        averageHeartRate: 150,
      } as Activity["summary"],
    });

    expect(deriveActivityStimulus(withoutPowerContext)).toMatchObject({
      workoutType: "unknown",
      confidence: null,
      source: "insufficient",
      heartRateRecorded: true,
    });
  });
});
