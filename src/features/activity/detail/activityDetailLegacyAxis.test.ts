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

  it("accepts route-aligned sensors when elapsed time includes a large pause", () => {
    const length = 4_844;
    const pauseAfter = 2_000;
    const pauseDurationSec = 1_585;
    const streams = {
      time: Array.from(
        { length },
        (_, index) => index + (index > pauseAfter ? pauseDurationSec : 0),
      ),
      distance: Array.from({ length }, (_, index) => index * 5),
      watts: Array(length).fill(200),
      heartrate: Array(length).fill(150),
      cadence: Array(length).fill(85),
    };

    const summary = deriveStreamSensorSummary(streams as never, 4_834);
    expect(summary).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
      hasCadenceStream: true,
      hasRejectedCadenceStream: false,
    });
    expect(summary?.averagePower).toBeCloseTo(200);
    expect(summary?.averageHeartRate).toBeCloseTo(150);
    expect(summary?.averageCadence).toBeCloseTo(85);
    expect(buildActivityAnalysisProjection(streams as never, 4_834)?.streams).toMatchObject({
      watts: streams.watts,
      heartrate: streams.heartrate,
      cadence: streams.cadence,
    });
  });

  it("rejects an irregular aligned axis that only mimics the moving duration by its median step", () => {
    const deltas = [
      ...Array(49).fill(1),
      ...Array(49).fill(3),
      1_000,
    ];
    const time = deltas.reduce<number[]>(
      (samples, delta) => [...samples, samples[samples.length - 1]! + delta],
      [0],
    );
    const streams = {
      time,
      distance: time.map((_, index) => index * 5),
      watts: Array(time.length).fill(200),
      heartrate: Array(time.length).fill(150),
    };

    expect(deriveStreamSensorSummary(streams as never, 300)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never, 300)?.streams).toMatchObject({
      watts: undefined,
      heartrate: undefined,
    });
  });

  it("accepts a stable fractional-rate epoch axis with multiple pause gaps", () => {
    const length = 200;
    const originEpochMs = 1_700_000_000_000;
    const pauseIndexes = new Set([50, 100, 150]);
    const time = Array.from({ length }, (_, index) => index).reduce<number[]>(
      (samples, index) => index === 0
        ? [originEpochMs]
        : [
            ...samples,
            samples[samples.length - 1]! + (pauseIndexes.has(index) ? 300_500 : 500),
          ],
      [],
    );
    const streams = {
      time,
      distance: time.map((_, index) => index * 2),
      watts: Array(length).fill(210),
      heartrate: Array(length).fill(145),
    };

    expect(deriveStreamSensorSummary(streams as never, 100)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
    });
    expect(deriveStreamSensorSummary(streams as never, 105)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
    });
    expect(buildActivityAnalysisProjection(streams as never, 100)?.streams).toMatchObject({
      watts: streams.watts,
      heartrate: streams.heartrate,
    });
  });

  it("does not compound pause-gap removal with duration tolerance", () => {
    const length = 100;
    const pauseIndexes = new Set([20, 40, 60, 80]);
    const time = Array.from({ length }, (_, index) => index).reduce<number[]>(
      (samples, index) => index === 0
        ? [0]
        : [
            ...samples,
            samples[samples.length - 1]! + (pauseIndexes.has(index) ? 101 : 1),
          ],
      [],
    );
    const streams = {
      time,
      distance: time.map((_, index) => index * 5),
      watts: Array(length).fill(200),
      heartrate: Array(length).fill(150),
    };

    expect(deriveStreamSensorSummary(streams as never, 94.9)).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
      hasHeartRateStream: false,
      hasRejectedHeartRateStream: true,
    });
    expect(buildActivityAnalysisProjection(streams as never, 94.9)?.streams).toMatchObject({
      watts: undefined,
      heartrate: undefined,
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
