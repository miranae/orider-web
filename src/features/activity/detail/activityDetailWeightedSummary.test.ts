import { describe, expect, it } from "vitest";

import { weightedAvgMax } from "../../../utils/advancedMetrics";
import { sampleDurationsSec } from "../../../utils/sampleTime";
import {
  buildActivityAnalysisProjection,
  deriveStreamSensorSummary,
} from "./activityDetailDerived";
import { timeWeightedLegacySensorSummary } from "./legacySensorCoverage";

describe("legacy sensor time-weighted summaries", () => {
  it("weights irregular slots and keeps accepted legacy zero as measured coasting", () => {
    const time = Array.from({ length: 40 }, (_, index) => index < 2 ? index : index + 2);
    const heartrate = Array(40).fill(100);
    const cadence = Array(40).fill(60);
    const watts = Array(40).fill(100);
    heartrate[1] = 200;
    cadence[1] = 120;
    watts[1] = 200;
    watts[2] = 0;
    const streams = {
      time,
      distance: time.map((value) => value * 10),
      heartrate,
      cadence,
      watts,
    };

    const summary = deriveStreamSensorSummary(streams as never)!;
    expect(summary.averageHeartRate).toBeCloseTo(4_500 / 42, 8);
    expect(summary.averageCadence).toBeCloseTo(2_700 / 42, 8);
    expect(summary.averagePower).toBeCloseTo(4_400 / 42, 8);
    expect(summary.maxHeartRate).toBe(200);
    expect(summary.maxCadence).toBe(120);
    expect(summary.maxPower).toBe(200);

    const projection = buildActivityAnalysisProjection(streams as never)!;
    const heartRateDurations = sampleDurationsSec(heartrate.length, time);
    expect(heartRateDurations.slice(0, 4)).toEqual([1, 3, 1, 1]);
    expect(projection.power?.values).toHaveLength(40);
    expect(projection.power?.durationsSec?.slice(0, 4)).toEqual([1, 3, 1, 1]);
    expect(weightedAvgMax(
      heartrate,
      { durationsSec: heartRateDurations },
      { ignoreZero: true },
    ).avg).toBe(summary.averageHeartRate);
    expect(weightedAvgMax(
      projection.power?.values,
      { durationsSec: projection.power?.durationsSec },
    ).avg).toBe(summary.averagePower);
  });

  it("does not bridge missing intervals at the start, middle, or end", () => {
    const time = [0, 1, 2, 4, 5, 6];
    const result = timeWeightedLegacySensorSummary({
      values: [0, 100, 200, 0, 100, 0],
      routeTime: time,
    }, (value) => value > 0);

    // Retained slots own 1s, 2s, and 1s respectively. Missing slots own no weight.
    expect(result?.average).toBe(150);
    expect(result?.maximum).toBe(200);
  });

  it.each([2, 4])("preserves the ordinary mean on a uniform %i Hz inferred axis", (rateHz) => {
    const values = Array.from({ length: rateHz * 10 }, (_, index) => index % 2 === 0 ? 100 : 200);
    const result = timeWeightedLegacySensorSummary({ values, trustedDurationSec: 10 }, (value) => value > 0);
    expect(result?.average).toBe(150);
    expect(result?.maximum).toBe(200);
  });

  it.each([2, 4])("weights a 1 Hz sensor independently of a %i Hz route clock", (routeRateHz) => {
    const durationSec = 100;
    const values = Array.from({ length: durationSec }, (_, index) => index % 2 === 0 ? 100 : 200);
    const routeTime = Array.from(
      { length: durationSec * routeRateHz },
      (_, index) => index / routeRateHz,
    );
    const summary = deriveStreamSensorSummary({
      time: routeTime,
      distance: routeTime.map((time) => time * 10),
      heartrate: values,
      watts: values,
    } as never, durationSec)!;

    expect(summary.averageHeartRate).toBe(150);
    expect(summary.averagePower).toBe(150);
  });
});
