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

  it("uses the same trusted uniform axis for a 4 Hz sensor on a 2 Hz chart", () => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 2_000,
      elapsedTimeMillis: 2_000,
    } as never, 1_700_000_000_000);
    const streams = {
      distance: [0, 1, 2, 3],
      time: [0, 0.5, 1, 1.5],
      watts: [100, 101, 102, 103, 104, 105, 106, 107],
    };

    expect(buildSampledData(streams as never, context).map(({ power }) => power))
      .toEqual([100, 102, 104, 106]);
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
      ridingTimeMillis: 20_500,
      elapsedTimeMillis: 20_500,
    } as never, 1_700_000_000_000);
    const streams = {
      distance: Array.from({ length: 41 }, (_, index) => index * 0.5),
      time: Array.from({ length: 41 }, (_, index) => index * 0.5),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: Array.from({ length: 20 }, (_, index) => index),
        heartrate: [140, null, ...Array(18).fill(160)],
        watts: [200, null, ...Array(18).fill(300)],
      },
    };

    const chart = buildSampledData(streams as never, context).map(({ heartRate, power }) => [heartRate, power]);
    expect(chart.slice(0, 6)).toEqual([[140, 200], [140, 200], [null, null], [null, null], [160, 300], [160, 300]]);
    expect(chart.at(-1)).toEqual([null, null]);
  });

  it("retains a missing explicit slot when chart downsampling would otherwise skip it", () => {
    const axis = Array.from({ length: 600 }, (_, index) => index);
    const watts: Array<number | null> = Array(600).fill(200);
    watts[101] = null;
    const sampled = buildSampledData({
      distance: axis,
      time: axis,
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: axis,
        watts,
      },
    } as never, {
      legacyDurationSec: 600,
      explicitDurationSec: 600,
      activityStartTime: 1_700_000_000_000,
    });

    expect(sampled.find(({ distance }) => distance === 101)?.power).toBeNull();
    expect(sampled.find(({ distance }) => distance === 100)?.power).toBe(200);
    expect(sampled.find(({ distance }) => distance === 102)?.power).toBe(200);
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

  it.each([
    ["relative", [0, 2, 4, 6]],
    ["epoch seconds", [1_700_000_000, 1_700_000_002, 1_700_000_004, 1_700_000_006]],
    ["epoch milliseconds", [1_700_000_000_000, 1_700_000_002_000, 1_700_000_004_000, 1_700_000_006_000]],
  ])("does not trust equal legacy and route lengths on a mismatched %s clock", (_case, time) => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 4_000,
      elapsedTimeMillis: 8_000,
    } as never, 1_700_000_000_000);
    const streams = {
      distance: [0, 1, 2, 3],
      time,
      watts: [100, 200, 300, 400],
      heartrate: [140, 150, 160, 170],
      cadence: [80, 81, 82, 83],
    };

    expect(getAvailableOverlays(buildSampledData(streams as never, context)).map(({ key }) => key))
      .not.toEqual(expect.arrayContaining(["power", "hr", "cadence"]));
  });

  it.each([
    ["relative", [0, 1, 2, 3]],
    ["epoch seconds", [1_700_000_000, 1_700_000_001, 1_700_000_002, 1_700_000_003]],
    ["epoch milliseconds", [1_700_000_000_000, 1_700_000_001_000, 1_700_000_002_000, 1_700_000_003_000]],
  ])("keeps truly aligned equal-length legacy data on a %s clock", (_case, time) => {
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 4_000,
      elapsedTimeMillis: 4_000,
    } as never, 1_700_000_000_000);
    const streams = { distance: [0, 1, 2, 3], time, watts: [100, 200, 300, 400] };

    expect(buildSampledData(streams as never, context).map(({ power }) => power))
      .toEqual([100, 200, 300, 400]);
  });

  it.each([
    ["seconds", 5_000],
    ["minutes", 120_000],
  ])("keeps exact route-index legacy channels when the first GPS fix is delayed by %s", (_case, delayMs) => {
    const activityStartMs = 1_700_000_000_000;
    const routeStartSec = (activityStartMs + delayMs) / 1000;
    const context = buildActivitySensorSelectionContext({
      ridingTimeMillis: 10_000,
      elapsedTimeMillis: 10_000,
    } as never, activityStartMs);
    const streams = {
      distance: Array.from({ length: 10 }, (_, index) => index),
      time: Array.from({ length: 10 }, (_, index) => routeStartSec + index),
      watts: [100, 0, 300, 400, 500, 600, 700, 800, 900, 1_000],
      heartrate: [140, 0, 142, 143, 144, 145, 146, 147, 148, 149],
      cadence: [80, 0, 82, 83, 84, 85, 86, 87, 88, 89],
    };

    const sampled = buildSampledData(streams as never, context);
    expect(getAvailableOverlays(sampled).map(({ key }) => key))
      .toEqual(expect.arrayContaining(["power", "hr", "cadence"]));
    expect(sampled[0]).toMatchObject({ power: 100, heartRate: 140, cadence: 80 });
    expect(sampled[1]).toMatchObject({ power: 0, heartRate: null, cadence: 0 });
    expect(sampled[9]).toMatchObject({ power: 1_000, heartRate: 149, cadence: 89 });
  });

  it("fails legacy chart alignment closed when channel and route lengths differ", () => {
    const streams = {
      distance: [0, 1, 2, 3],
      time: [1_700_000_005, 1_700_000_006, 1_700_000_007, 1_700_000_008],
      watts: [100, 200, 300],
      heartrate: [140, 150, 160],
      cadence: [80, 81, 82],
    };

    const overlays = getAvailableOverlays(buildSampledData(streams as never, {
      legacyDurationSec: 4,
      activityStartTime: 1_700_000_000_000,
    })).map(({ key }) => key);
    expect(overlays.filter((key) => ["power", "hr", "cadence"].includes(key))).toEqual([]);
  });

  it("fails exact-length legacy chart alignment closed for a mixed-unit route clock", () => {
    const streams = {
      distance: [0, 1, 2, 3],
      time: [0, 1, 2, 1_700_000_003],
      watts: [100, 200, 300, 400],
      heartrate: [140, 150, 160, 170],
      cadence: [80, 81, 82, 83],
    };

    const overlays = getAvailableOverlays(buildSampledData(streams as never, {
      legacyDurationSec: 4,
      activityStartTime: 1_700_000_000_000,
    })).map(({ key }) => key);
    expect(overlays.filter((key) => ["power", "hr", "cadence"].includes(key))).toEqual([]);
  });

  it.each([
    ["missing", undefined],
    ["decreasing", [0, 2, 1, 3]],
  ])("fails equal-length legacy chart alignment closed for a %s route clock", (_case, time) => {
    const streams = { distance: [0, 1, 2, 3], time, watts: [100, 200, 300, 400] };
    expect(getAvailableOverlays(buildSampledData(streams as never, {
      legacyDurationSec: 4,
      activityStartTime: 1_700_000_000_000,
    })).map(({ key }) => key)).not.toContain("power");
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
