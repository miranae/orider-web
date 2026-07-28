import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  buildActivitySensorSelectionContext,
  buildSampledData,
  getAvailableOverlays,
} from "./activityDetailDerived";

describe("activity detail chart clocks", () => {
  it("aligns 1 Hz legacy sensors across a trusted 2 Hz route clock", () => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 3_600_000,
      elapsedTimeMillis: 3_600_000,
    } as never, 1_700_000_000_000);
    const streams = {
      distance: Array.from({ length: 7_200 }, (_, index) => index),
      time: Array.from({ length: 7_200 }, (_, index) => index * 0.5),
      watts: Array.from({ length: 3_600 }, (_, index) => 100 + index),
      heartrate: Array.from({ length: 3_600 }, (_, index) => 1_000 + index),
      cadence: Array.from({ length: 3_600 }, (_, index) => 2_000 + index),
    };

    const sampled = buildSampledData(streams as never, context);
    expect(sampled.find((point) => point.distance === 0)).toMatchObject({
      power: 100, heartRate: 1_000, cadence: 2_000,
    });
    expect(sampled.find((point) => point.distance === 3_600)).toMatchObject({
      power: 1_900, heartRate: 2_800, cadence: 3_800,
    });
    expect(sampled.find((point) => point.power === 3_699)).toMatchObject({
      distance: 7_198, heartRate: 4_599, cadence: 5_599,
    });
  });

  it.each([
    ["epoch milliseconds", 1_700_000_000_000, 500],
    ["fractional epoch seconds", 1_700_000_000, 0.5],
  ])("aligns 1 Hz legacy sensors across a trusted 2 Hz %s clock", (_case, origin, step) => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 4_000,
      elapsedTimeMillis: 4_000,
    } as never, 1_700_000_000_000);
    const streams = {
      distance: Array.from({ length: 8 }, (_, index) => index),
      time: Array.from({ length: 8 }, (_, index) => origin + index * step),
      watts: [100, 200, 300, 400],
    };

    expect(buildSampledData(streams as never, context).map((point) => point.power))
      .toEqual([100, 100, 200, 200, 300, 300, 400, 400]);
  });

  it("maps explicit V1 by its trusted origin without filling nulls or the uncovered tail", () => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 3_500,
      elapsedTimeMillis: 3_500,
    } as never, 1_700_000_000_000);
    const streams = {
      distance: Array.from({ length: 7 }, (_, index) => index * 0.5),
      time: Array.from({ length: 7 }, (_, index) => index * 0.5),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, null, 160],
        watts: [200, null, 300],
      },
    };

    expect(buildSampledData(streams as never, context).map(({ heartRate, power }) => [heartRate, power]))
      .toEqual([[140, 200], [140, 200], [0, 0], [0, 0], [160, 300], [160, 300], [0, 0]]);
  });

  it("fails explicit chart alignment closed when a relative route has no absolute origin", () => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 3_000,
      elapsedTimeMillis: 3_000,
    } as never);
    const streams = {
      distance: [0, 5, 10],
      time: [0, 1, 2],
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: [0, 1, 2],
        heartrate: [140, 150, 160],
        watts: [200, 210, 220],
      },
    };

    expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
      .not.toEqual(expect.arrayContaining(["power", "hr"]));
  });

  it.each([
    ["a cafe pause", 5_400],
    ["a mismatched route duration", 4_000],
  ])("fails closed instead of stretching legacy sensors across %s", (_case, routeDurationSec) => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 3_600_000,
      elapsedTimeMillis: routeDurationSec * 1000,
    } as never, 1_700_000_000_000);
    const streams = {
      distance: Array.from({ length: routeDurationSec * 2 }, (_, index) => index),
      time: Array.from({ length: routeDurationSec * 2 }, (_, index) => index * 0.5),
      watts: Array(3_600).fill(200),
      heartrate: Array(3_600).fill(150),
      cadence: Array(3_600).fill(85),
    };

    expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
      .not.toEqual(expect.arrayContaining(["power", "hr", "cadence"]));
  });

  it("preserves a finite increasing fractional relative route clock", () => {
    const streams = { distance: [0, 5, 10], time: [0, 0.5, 1], watts: [200, 210, 220] };
    expect(buildActivityAnalysisProjection(streams as never)?.streams.time).toEqual([0, 0.5, 1]);
  });

  it.each([
    [0, 0.5, 0.5],
    [0, 1, 0.5],
    [0, Number.NaN, 1],
  ])("drops an invalid fractional route clock from analysis projection: %j", (...time) => {
    expect(buildActivityAnalysisProjection({ distance: [0, 5, 10], time } as never)?.streams.time)
      .toBeUndefined();
  });
});
