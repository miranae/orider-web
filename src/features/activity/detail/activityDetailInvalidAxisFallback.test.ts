import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  selectActivityHeartRateStream,
  selectActivityPowerStream,
} from "./activityDetailDerived";

describe("invalid V1 sensor-axis fallback", () => {
  it("keeps a malformed V1 axis fail-closed when no trustworthy legacy channel exists", () => {
    const streams = {
      distance: [0, 10, 20],
      time: [0, 1, 2],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 2, 1],
        heartrate: [140, 141, 142],
        watts: [200, 210, 220],
      },
    };

    expect(selectActivityPowerStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "invalid_axis" },
    });
    expect(selectActivityHeartRateStream(streams as never)).toMatchObject({
      source: null,
      rejection: { source: "sensorStreamsV1", reason: "invalid_axis" },
    });
    expect(buildActivityAnalysisProjection(streams as never)).toMatchObject({
      streams: { heartrate: undefined, watts: undefined, watts_calc: undefined },
      heartRate: undefined,
      power: undefined,
    });
  });
});
