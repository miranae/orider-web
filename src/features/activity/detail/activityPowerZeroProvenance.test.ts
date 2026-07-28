import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  deriveStreamSensorSummary,
} from "./activityDetailDerived";

const time = Array.from({ length: 20 }, (_, index) => index);
const zeroAndPower = [...Array(12).fill(0), ...Array(8).fill(200)];

describe("activity power zero provenance", () => {
  it("treats top-level legacy zero watts as missing sentinels", () => {
    const streams = { time, watts: zeroAndPower };
    const summary = deriveStreamSensorSummary(streams as never)!;
    const projection = buildActivityAnalysisProjection(streams as never)!;

    expect(summary).toMatchObject({
      powerSource: "watts",
      averagePower: 200,
      maxPower: 200,
    });
    expect(projection.power).toMatchObject({
      values: Array(8).fill(200),
      wholeSessionCoverageAccepted: true,
    });
  });

  it("preserves the same zero watts as measured coasting in SensorStreamsV1", () => {
    const activityStartTime = 1_700_000_000_000;
    const streams = {
      time,
      watts: Array(20).fill(300),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: activityStartTime,
        time,
        watts: zeroAndPower,
      },
    };
    const context = {
      activityStartTime,
      explicitDurationSec: 20,
      legacyDurationSec: 20,
    };
    const summary = deriveStreamSensorSummary(streams as never, context)!;
    const projection = buildActivityAnalysisProjection(streams as never, context)!;

    expect(summary).toMatchObject({
      powerSource: "sensorStreamsV1",
      averagePower: 80,
      maxPower: 200,
    });
    expect(projection.power).toMatchObject({
      values: zeroAndPower,
      complete: true,
    });
  });
});
