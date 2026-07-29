import { describe, expect, it } from "vitest";

import { selectWholeSessionSensorSeries } from "../../../components/AnalysisTab";
import { weightedAvgMax } from "../../../utils/advancedMetrics";
import {
  buildActivityAnalysisProjection,
  buildSampledData,
  deriveStreamSensorSummary,
  getAvailableOverlays,
} from "./activityDetailDerived";

describe("legacy heart-rate missing slots", () => {
  it.each([
    ["start", 0, 1],
    ["middle", 10, 2],
    ["end", 19, 1],
  ])("keeps an accepted %s gap out of every downstream HR value", (_case, gapIndex, runCount) => {
    const time = Array.from({ length: 20 }, (_, index) => index);
    const heartrate = Array.from({ length: 20 }, (_, index) => 140 + index);
    heartrate[gapIndex] = 0;
    const streams = { time, distance: time, heartrate };

    const projection = buildActivityAnalysisProjection(streams as never)!;
    const chart = buildSampledData(streams as never);

    expect(projection.streams.heartrate).toBeUndefined();
    expect(projection.heartRate?.values).toHaveLength(19);
    expect(projection.heartRate?.values).not.toContain(0);
    expect(projection.heartRate?.segmentStarts?.filter(Boolean)).toHaveLength(runCount);
    expect(chart[gapIndex]?.heartRate).toBeNull();
    expect(chart.filter((point) => point.heartRate === 0)).toHaveLength(0);
  });

  it("compacts accepted dense HR gaps without losing their original timing", () => {
    const time = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    const missingIndexes = new Set([0, 10, 19]);
    const heartrate = time.map((_, index) => missingIndexes.has(index) ? 0 : 140 + index);
    const streams = {
      time,
      distance: time.map((second) => second * 10),
      heartrate,
    };

    const summary = deriveStreamSensorSummary(streams as never)!;
    const projection = buildActivityAnalysisProjection(streams as never)!;
    const projectedHeartRate = projection.heartRate!;
    const selected = selectWholeSessionSensorSeries(
      projectedHeartRate,
      projection.streams.heartrate,
      projection.streams.time,
    );
    const chart = buildSampledData(streams as never);

    expect(summary).toMatchObject({
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
    });
    expect(projection.streams.heartrate).toBeUndefined();
    expect(projectedHeartRate.values).toHaveLength(17);
    expect(projectedHeartRate.values.every((value) => value > 0)).toBe(true);
    expect(projectedHeartRate.time).toEqual(time.filter((_, index) => !missingIndexes.has(index)));
    expect(projectedHeartRate.durationsSec).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 3,
      1, 1, 1, 1, 1, 1, 1, 1,
    ]);
    expect(projectedHeartRate.segmentStarts?.map((isStart, index) => isStart ? index : -1)
      .filter((index) => index >= 0)).toEqual([0, 9]);
    expect(projectedHeartRate.fullSessionDurationSec).toBe(23);
    expect(selected.values).not.toContain(0);
    expect(selected.segmentStarts).toEqual(projectedHeartRate.segmentStarts);
    expect(weightedAvgMax(
      selected.values,
      { durationsSec: selected.durationsSec, segmentStarts: selected.segmentStarts },
      { ignoreZero: true },
    ).avg).toBe(summary.averageHeartRate);
    expect(chart[0]?.heartRate).toBeNull();
    expect(chart[10]?.heartRate).toBeNull();
    expect(chart[19]?.heartRate).toBeNull();
    expect(chart.filter((point) => point.heartRate === 0)).toHaveLength(0);
    expect(chart.filter((point) => typeof point.heartRate === "number")).toHaveLength(17);
    expect(getAvailableOverlays(chart).map(({ key }) => key)).toContain("hr");
  });

  it("keeps an all-positive unclocked legacy channel without fabricating an analysis axis", () => {
    const heartrate = Array.from({ length: 20 }, (_, index) => 140 + index);
    const streams = {
      distance: Array.from({ length: 20 }, (_, index) => index),
      heartrate,
    };
    const projection = buildActivityAnalysisProjection(streams as never)!;

    expect(projection.streams.heartrate).toEqual(heartrate);
    expect(projection.streams.time).toBeUndefined();
    expect(projection.heartRate).toBeUndefined();
  });
});
