import { describe, expect, it } from "vitest";

import {
  buildActivityAnalysisProjection,
  deriveStreamSensorSummary,
} from "./activityDetailDerived";

describe("activity detail legacy route-axis selection", () => {
  it("accepts finite route-aligned sensors despite a moving and elapsed duration mismatch", () => {
    const length = 5_400;
    const streams = {
      time: Array.from({ length }, (_, index) => index),
      distance: Array.from({ length }, (_, index) => index * 5),
      watts: Array(length).fill(200),
      heartrate: Array(length).fill(150),
      cadence: Array(length).fill(85),
    };

    expect(deriveStreamSensorSummary(streams as never, 3_600)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
      hasCadenceStream: true,
      hasRejectedCadenceStream: false,
    });
    expect(buildActivityAnalysisProjection(streams as never, 3_600)).toMatchObject({
      streams: { watts: streams.watts, heartrate: streams.heartrate, cadence: streams.cadence },
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

  it("accepts adaptively thinned Strava sensors across irregular pauses", () => {
    const deltaCounts = new Map([
      [8, 775], [5, 159], [2, 152], [7, 147], [3, 144],
      [4, 129], [1, 122], [6, 121], [9, 23], [12, 4],
      [94, 58], [35, 1], [3_058, 1],
    ]);
    const deltas = [...deltaCounts].flatMap(([delta, count]) => Array(count).fill(delta));
    const time = deltas.reduce<number[]>(
      (samples, delta) => [...samples, samples[samples.length - 1]! + delta],
      [0],
    );
    const streams = {
      time,
      distance: time.map((_, index) => index * 37),
      watts: Array(time.length).fill(200),
      heartrate: Array(time.length).fill(150),
      cadence: Array(time.length).fill(85),
    };

    expect(time).toHaveLength(1_837);
    expect(time.at(-1)).toBe(18_924);
    expect(deriveStreamSensorSummary(streams as never, 10_481)).toMatchObject({
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
      hasCadenceStream: true,
      hasRejectedCadenceStream: false,
    });
    expect(buildActivityAnalysisProjection(streams as never, 10_481)?.streams).toMatchObject({
      watts: streams.watts,
      heartrate: streams.heartrate,
      cadence: streams.cadence,
    });
  });

  it("accepts an irregular but monotonic aligned axis", () => {
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
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
    });
    expect(buildActivityAnalysisProjection(streams as never, 300)?.streams).toMatchObject({
      watts: streams.watts,
      heartrate: streams.heartrate,
    });
  });

  it.each([
    ["gross length mismatch", [0, 1, 2], [200]],
    ["time reversal", [0, 2, 1], [200, 210, 220]],
    ["non-finite measurement", [0, 1, 2], [200, Number.NaN, 220]],
    ["negative measurement", [0, 1, 2], [200, -1, 220]],
  ])("still rejects clear legacy corruption: %s", (_case, time, watts) => {
    const summary = deriveStreamSensorSummary({ time, watts } as never, 3);

    expect(summary).toMatchObject({
      hasPowerStream: false,
      hasRejectedPowerStream: true,
    });
    expect(buildActivityAnalysisProjection({ time, watts } as never, 3)?.streams.watts)
      .toBeUndefined();
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

  it("does not reject aligned pause gaps because of duration tolerance", () => {
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
      hasPowerStream: true,
      hasRejectedPowerStream: false,
      hasHeartRateStream: true,
      hasRejectedHeartRateStream: false,
    });
    expect(buildActivityAnalysisProjection(streams as never, 94.9)?.streams).toMatchObject({
      watts: streams.watts,
      heartrate: streams.heartrate,
    });
  });

  it.each([
    [100, 95, true],
    [100, 94.999, true],
    [95, 100, true],
    [95, 100.001, true],
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
