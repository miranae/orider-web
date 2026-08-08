import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  selectActivityHeartRateStream,
  selectActivityPowerStream,
} from "./activityDetailDerived";

const ORIGIN_EPOCH_MS = 1_700_000_000_000;

/**
 * The uploader thins sensor samples to fit the inline stream budget, and auto-pause
 * or a sensor dropout removes slots on its own. Both leave a V1 axis whose retained
 * seconds are exact but no longer contiguous.
 */
function sparseStreams(axis: readonly number[], routeLength = axis[axis.length - 1]! + 1) {
  return {
    distance: Array.from({ length: routeLength }, (_, index) => index * 10),
    time: Array.from({ length: routeLength }, (_, index) => index),
    sensorStreamsV1: {
      version: 1,
      timeUnit: "relative_seconds",
      resolutionSeconds: 1,
      timeOriginEpochMs: ORIGIN_EPOCH_MS,
      time: [...axis],
      heartrate: axis.map(() => 140),
      watts: axis.map(() => 200),
    },
  };
}

describe("sparse V1 sensor axis", () => {
  it("accepts an axis with missing seconds while the retained slots describe the span", () => {
    const streams = sparseStreams([0, 1, 2, 4, 5, 6, 8, 9]);

    const power = selectActivityPowerStream(streams as never);
    expect(power.source).toBe("sensorStreamsV1");
    expect(power.rejection).toBeUndefined();
    expect(power.finiteValues).toHaveLength(8);

    const heartRate = selectActivityHeartRateStream(streams as never);
    expect(heartRate.source).toBe("sensorStreamsV1");
    expect(heartRate.rejection).toBeUndefined();
  });

  it("keeps the gap seconds in the analysis span instead of counting retained slots", () => {
    const projection = buildActivityAnalysisProjection(sparseStreams([0, 1, 2, 4, 5, 6, 8, 9]) as never);

    expect(projection?.power).toMatchObject({
      time: [0, 1, 2, 4, 5, 6, 8, 9],
      fullSessionDurationSec: 10,
    });
    expect(projection?.heartRate).toMatchObject({ fullSessionDurationSec: 10 });
  });

  it("reports a contiguous axis span unchanged", () => {
    const projection = buildActivityAnalysisProjection(sparseStreams([0, 1, 2, 3, 4]) as never);

    expect(projection?.power).toMatchObject({ fullSessionDurationSec: 5 });
  });

  it("rejects an axis whose retained seconds no longer cover the span", () => {
    const streams = sparseStreams([0, 5, 10, 15], 20);

    expect(selectActivityPowerStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "sparse_axis", axisLength: 4, channelLength: 4 },
    });
    expect(selectActivityHeartRateStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "sparse_axis" },
    });
  });

  it("still rejects a descending axis as malformed", () => {
    const streams = sparseStreams([0, 2, 1, 4], 5);

    expect(selectActivityPowerStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "invalid_axis" },
    });
  });

  it("still rejects a repeated timestamp as malformed", () => {
    const streams = sparseStreams([0, 1, 1, 2], 4);

    expect(selectActivityPowerStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "invalid_axis" },
    });
  });
});
