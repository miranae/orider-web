import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  deriveStreamSensorSummary,
} from "./activityDetailDerived";

describe("activity detail legacy route-axis selection", () => {
  it("rejects route-aligned sensors when route duration exceeds riding duration tolerance", () => {
    const length = 5_400;
    const streams = {
      time: Array.from({ length }, (_, index) => index),
      distance: Array.from({ length }, (_, index) => index * 5),
      watts: Array(length).fill(200),
      heartrate: Array(length).fill(150),
      cadence: Array(length).fill(85),
    };

    expect(deriveStreamSensorSummary(streams as never, 3_600)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
      hasCadenceStream: false,
      hasRejectedCadenceStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never, 3_600)).toMatchObject({
      streams: { watts: undefined, heartrate: undefined, cadence: undefined },
      power: undefined,
      heartRate: undefined,
    });
  });

  it.each([
    [100, 95, true],
    [100, 94.999, false],
    [95, 100, true],
    [95, 100.001, false],
  ])(
    "applies symmetric duration coverage for short rides: summary %ss, route %ss",
    (summaryDurationSec, routeDurationSec, accepted) => {
      const length = 60;
      const stepSec = routeDurationSec / length;
      const streams = {
        time: Array.from({ length }, (_, index) => index * stepSec),
        watts: Array(length).fill(200),
      };

      expect(deriveStreamSensorSummary(streams as never, summaryDurationSec)).toMatchObject({
        hasPowerStream: accepted,
        hasRejectedPowerStream: !accepted,
      });
    },
  );
});
