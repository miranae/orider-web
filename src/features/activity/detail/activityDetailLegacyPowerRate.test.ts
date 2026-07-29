import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  deriveStreamSensorSummary,
} from "./activityDetailDerived";

describe("legacy power summary-duration rate", () => {
  it("rejects power above the 4 Hz ceiling and keeps calculated power", () => {
    const streams = {
      watts: Array(600).fill(250),
      watts_calc: Array(60).fill(175),
    };

    expect(deriveStreamSensorSummary(streams as never, 60)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      powerSource: "watts_calc",
      averagePower: 175,
      maxPower: 175,
    });
    expect(buildActivityAnalysisProjection(streams as never, 60)?.streams).toMatchObject({
      watts: undefined,
      watts_calc: streams.watts_calc,
    });
  });

  it("accepts power at the 4 Hz ceiling", () => {
    const streams = { watts: Array(240).fill(200) };

    expect(deriveStreamSensorSummary(streams as never, 60)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      powerSource: "watts",
      averagePower: 200,
      maxPower: 200,
    });
    expect(deriveStreamSensorSummary({ watts: Array(241).fill(200) } as never, 60))
      .toMatchObject({ hasPowerStream: false, hasRejectedPowerStream: true, powerSource: null });
  });

  it("keeps power above 4 Hz when a matching route clock proves its axis", () => {
    const time = Array.from({ length: 600 }, (_, index) => index / 10);
    const streams = { time, watts: Array(600).fill(200) };
    const summary = deriveStreamSensorSummary(streams as never, 60);

    expect(summary).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      powerSource: "watts",
      maxPower: 200,
    });
    expect(summary?.averagePower).toBeCloseTo(200, 8);
    expect(buildActivityAnalysisProjection(streams as never, 60)?.streams.watts)
      .toEqual(streams.watts);
  });

  it("uses a longer route-clock duration for the ceiling across paused time", () => {
    const time = Array.from({ length: 120 }, (_, index) => index);
    const streams = { time, watts: Array(480).fill(200) };

    expect(deriveStreamSensorSummary(streams as never, 60)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      powerSource: "watts",
      maxPower: 200,
    });
  });
});
