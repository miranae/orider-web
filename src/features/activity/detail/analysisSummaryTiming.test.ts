import { describe, expect, it } from "vitest";

import { resolveAnalysisSummaryTiming } from "./analysisSummaryTiming";

const summary = {
  distance: 10_000,
  ridingTimeMillis: 4_800_000,
  averageSpeed: 20,
  maxSpeed: 40,
  averageCadence: null,
  maxCadence: null,
  averageHeartRate: null,
  maxHeartRate: null,
  averagePower: null,
  maxPower: null,
  normalizedPower: null,
  elevationGain: 0,
  calories: null,
  relativeEffort: null,
  tss: null,
  swolf: null,
};

describe("resolveAnalysisSummaryTiming", () => {
  it("uses server moving time when the displayed activity summary has none", () => {
    expect(resolveAnalysisSummaryTiming(summary, { movingTimeSec: 60, pauseTimeSec: 4_740 }))
      .toMatchObject({ movingTimeSec: 60, pauseTimeSec: 4_740 });
  });

  it("preserves provider summary timing over server-derived values", () => {
    expect(resolveAnalysisSummaryTiming(
      { ...summary, movingTimeSec: 120, pauseTimeSec: 4_680 },
      { movingTimeSec: 60, pauseTimeSec: 4_740 },
    )).toMatchObject({ movingTimeSec: 120, pauseTimeSec: 4_680 });
  });
});
