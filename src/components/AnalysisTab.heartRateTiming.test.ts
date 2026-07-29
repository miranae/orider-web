import { describe, expect, it } from "vitest";

import { buildActivityAnalysisProjection, deriveStreamSensorSummary } from "../features/activity/detail/activityDetailDerived";
import { calculateTRIMP, weightedAvgMax } from "../utils/advancedMetrics";
import { calculateHrZoneDistribution } from "../utils/zoneAnalysis";
import {
  selectWholeSessionSensorSeries,
  wholeSessionSampleTiming,
} from "./AnalysisTab";

describe("AnalysisTab heart-rate timing", () => {
  it("derives irregular legacy durations for average, zones, and TRIMP", () => {
    const time = Array.from({ length: 40 }, (_, index) => index < 2 ? index : index + 2);
    const heartrate = Array(40).fill(100);
    heartrate[1] = 200;
    const streams = { time, heartrate };
    const summary = deriveStreamSensorSummary(streams as never)!;
    const projection = buildActivityAnalysisProjection(streams as never)!;
    const selected = selectWholeSessionSensorSeries(
      projection.heartRate,
      projection.streams.heartrate,
      projection.streams.time,
    );
    const timing = wholeSessionSampleTiming(selected);

    expect(timing.durationsSec?.slice(0, 4)).toEqual([1, 3, 1, 1]);
    expect(weightedAvgMax(selected.values, timing, { ignoreZero: true }).avg)
      .toBe(summary.averageHeartRate);
    expect(calculateHrZoneDistribution(selected.values, 210, selected.time, timing)
      .reduce((seconds, zone) => seconds + zone.seconds, 0)).toBe(42);
    expect(calculateTRIMP(selected.values, 210, 60, "male", selected.time, timing))
      .toBe(calculateTRIMP(heartrate, 210, 60, "male", time));
  });
});
