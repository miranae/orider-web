import { describe, expect, it } from "vitest";

import {
  calculateKjPerHour,
  resolveAnalysisDurationSec,
  resolvePowerAnalysisDurationSec,
  selectWholeSessionSensorSeries,
  normalizeActivityStartTimeMs,
  sensorSeriesShareCompleteAxis,
  wholeSessionSeriesShareAxis,
} from "./AnalysisTab";
import { calculateDecoupling, calculateEF, calculateTRIMP, calculateWorkKj } from "../utils/advancedMetrics";
import { buildActivityAnalysisProjection } from "../features/activity/detail/activityDetailDerived";
import { calculateNP, calculateTSS } from "../utils/powerMetrics";
import { calculateHrZoneDistribution, calculatePowerZoneDistribution } from "../utils/zoneAnalysis";

describe("AnalysisTab sensor axis", () => {
  it("does not treat unclocked heart-rate sample count as elapsed seconds", () => {
    expect(resolveAnalysisDurationSec(0, undefined, 3_600, undefined, { userId: "rider" })).toBe(0);
  });

  it("keeps heart-rate duration available for the general activity duration", () => {
    expect(resolveAnalysisDurationSec(
      0,
      undefined,
      60,
      Array.from({ length: 60 }, (_, index) => index),
      { userId: "rider" },
    )).toBe(60);
  });

  it("does not treat a distance-axis count as duration for whole-activity rates", () => {
    const distanceOnly = resolveAnalysisDurationSec(
      60,
      Array.from({ length: 60 }, (_, index) => index),
      0,
      undefined,
      { userId: "rider", distance: Array(3_600).fill(0) },
    );
    expect(distanceOnly).toBe(60);
    expect(calculateKjPerHour(120, distanceOnly)).toBe(7_200);

    expect(resolveAnalysisDurationSec(
      60,
      Array.from({ length: 60 }, (_, index) => index),
      0,
      undefined,
      { userId: "rider" },
      { elapsedTimeMillis: 7_200_000 } as never,
    )).toBe(60);
  });

  it("uses riding duration for moving-sensor rates when elapsed time includes a pause", () => {
    expect(resolveAnalysisDurationSec(
      3_600,
      Array.from({ length: 3_600 }, (_, index) => index),
      0,
      undefined,
      { userId: "rider" },
      { ridingTimeMillis: 3_600_000, elapsedTimeMillis: 5_400_000 } as never,
    )).toBe(3_600);
  });

  it("uses only the trusted moving power clock for kJ/h across a paused route", () => {
    const watts = Array(3_600).fill(200);
    const powerTime = Array.from({ length: 3_600 }, (_, index) => index);
    const durationSec = resolvePowerAnalysisDurationSec({
      powerLength: watts.length,
      powerTime,
      trustedPowerDurationSec: 3_600,
    });

    expect(calculateWorkKj(watts, powerTime)).toBe(720);
    expect(durationSec).toBe(3_600);
    expect(calculateKjPerHour(720, durationSec)).toBe(720);
  });

  it("keeps legacy power riding time separate from a longer explicit HR pause clock", () => {
    const routeTime = Array.from({ length: 10_800 }, (_, index) => index * 0.5);
    const watts = Array(3_600).fill(200);
    const explicitTime = Array.from({ length: 5_400 }, (_, index) => index);
    const projection = buildActivityAnalysisProjection({
      time: routeTime,
      watts,
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: explicitTime,
        heartrate: Array(5_400).fill(150),
      },
    } as never, {
      legacyDurationSec: 3_600,
      explicitDurationSec: 5_400,
      activityStartTime: 1_700_000_000_000,
    })!;
    const power = selectWholeSessionSensorSeries(
      projection.power,
      projection.streams.watts,
      projection.streams.time,
      1_700_000_000_000,
      3_600,
    );
    const heartRate = selectWholeSessionSensorSeries(
      projection.heartRate,
      projection.streams.heartrate,
      projection.streams.time,
      1_700_000_000_000,
      5_400,
    );

    expect(heartRate.fullSessionDurationSec).toBe(5_400);
    expect(calculateKjPerHour(
      calculateWorkKj(power.values, power.time),
      resolvePowerAnalysisDurationSec({
        powerLength: power.values.length,
        powerTime: power.time,
        trustedPowerDurationSec: power.fullSessionDurationSec,
      }),
    )).toBe(720);
  });

  it("uses an explicit power clock instead of a shorter legacy heart-rate session", () => {
    const routeTime = Array.from({ length: 3_600 }, (_, index) => index);
    const explicitTime = Array.from({ length: 5_400 }, (_, index) => index);
    const projection = buildActivityAnalysisProjection({
      time: routeTime,
      heartrate: Array(3_600).fill(150),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: 1_700_000_000_000,
        time: explicitTime,
        watts: Array(5_400).fill(200),
      },
    } as never, {
      legacyDurationSec: 3_600,
      explicitDurationSec: 5_400,
      activityStartTime: 1_700_000_000_000,
    })!;
    const power = selectWholeSessionSensorSeries(
      projection.power,
      projection.streams.watts,
      projection.streams.time,
      1_700_000_000_000,
      5_400,
    );

    expect(projection.streams.heartrate).toHaveLength(3_600);
    expect(calculateKjPerHour(
      calculateWorkKj(power.values, power.time),
      resolvePowerAnalysisDurationSec({
        powerLength: power.values.length,
        powerTime: power.time,
        trustedPowerDurationSec: power.fullSessionDurationSec,
      }),
    )).toBe(720);
  });

  it("makes kJ/h unavailable when power has neither a clock nor trusted duration", () => {
    const durationSec = resolvePowerAnalysisDurationSec({ powerLength: 60, powerTime: undefined });
    expect(durationSec).toBe(0);
    expect(calculateKjPerHour(12, durationSec)).toBeNull();
  });

  it("allows complete HR and power series on the same explicit time axis", () => {
    expect(sensorSeriesShareCompleteAxis(
      { values: [180, 190, 200], time: [0, 1, 2], complete: true, timeOriginEpochMs: 1_700_000_000_000 },
      { values: [140, 142, 144], time: [0, 1, 2], complete: true, timeOriginEpochMs: 1_700_000_000_000 },
    )).toBe(true);
  });

  it.each([
    [
      { values: [180, 190], time: [0, 1], complete: true },
      { values: [140, 142], time: [1, 2], complete: true },
    ],
    [
      { values: [180, 190], time: [0, 1], complete: false },
      { values: [140, 142], time: [0, 1], complete: true },
    ],
    [
      { values: [180, 190], time: [0, 1], complete: true },
      { values: [140], time: [0], complete: true },
    ],
  ])("rejects misaligned, incomplete, or differently sized sensor axes", (power, heartRate) => {
    expect(sensorSeriesShareCompleteAxis(power, heartRate)).toBe(false);
  });

  it("uses origin when comparing two complete explicit axes", () => {
    expect(sensorSeriesShareCompleteAxis(
      { values: [180, 190], time: [0, 1], complete: true, timeOriginEpochMs: 1_700_000_000_000 },
      { values: [140, 142], time: [0, 1], complete: true, timeOriginEpochMs: 1_700_000_001_000 },
    )).toBe(false);
  });

  it("allows aligned explicit axes that passed whole-session coverage", () => {
    expect(sensorSeriesShareCompleteAxis(
      { values: [180, 200], time: [0, 2], complete: false, wholeSessionCoverageAccepted: true, timeOriginEpochMs: 1_700_000_000_000 },
      { values: [140, 145], time: [0, 2], complete: false, wholeSessionCoverageAccepted: true, timeOriginEpochMs: 1_700_000_000_000 },
    )).toBe(true);
  });

  it("does not fall back to top-level power for an incomplete explicit power run", () => {
    expect(selectWholeSessionSensorSeries(
      { values: [200, 210], time: [1, 2], complete: false },
      [300, 310, 320],
      [0, 1, 2],
    )).toEqual({ values: [], time: undefined, source: "explicit", timeOriginEpochMs: undefined });
  });

  it("does not fall back to top-level heart rate for an incomplete explicit HR run", () => {
    expect(selectWholeSessionSensorSeries(
      { values: [140, 142], time: [1, 2], complete: false },
      [150, 151, 152],
      [0, 1, 2],
    )).toEqual({ values: [], time: undefined, source: "explicit", timeOriginEpochMs: undefined });
  });

  it("keeps complete explicit series and the legacy path", () => {
    expect(selectWholeSessionSensorSeries(
      { values: [200, 210, 220], time: [0, 1, 2], complete: true },
      [300, 310, 320],
      [10, 11, 12],
    )).toEqual({
      values: [200, 210, 220],
      time: [0, 1, 2],
      source: "explicit",
      timeOriginEpochMs: undefined,
    });
    expect(selectWholeSessionSensorSeries(undefined, [300, 310, 320], [10, 11, 12]))
      .toEqual({
        values: [300, 310, 320],
        time: [10, 11, 12],
        source: "legacy",
        timeOriginEpochMs: undefined,
      });
  });

  it.each(["power", "heart rate", "cadence"])(
    "uses a sensor-native 1-second axis for 1 Hz legacy %s instead of a mismatched 2 Hz route clock",
    () => {
      const values = Array.from({ length: 3_600 }, () => 200);
      const routeTime = Array.from({ length: 7_200 }, (_, index) => 1_700_000_000_000 + index * 500);

      const selected = selectWholeSessionSensorSeries(
        undefined,
        values,
        routeTime,
        1_700_000_000_000,
        3_600,
      );

      expect(selected.time).toHaveLength(3_600);
      expect(selected.time?.[0]).toBe(0);
      expect(selected.time?.[3_599]).toBe(3_599);
      expect(selected.timeOriginEpochMs).toBe(1_700_000_000_000);
    },
  );

  it("keeps work, TSS, and power-zone duration on the 1 Hz sensor clock", () => {
    const watts = Array.from({ length: 3_600 }, () => 200);
    const selected = selectWholeSessionSensorSeries(
      undefined,
      watts,
      Array.from({ length: 7_200 }, (_, index) => 1_700_000_000_000 + index * 500),
      1_700_000_000_000,
      3_600,
    );

    expect(calculateWorkKj(watts, selected.time)).toBe(720);
    expect(calculateTSS(watts, 250, selected.time)).toBeCloseTo(64, 6);
    expect(calculatePowerZoneDistribution(watts, 250, selected.time)
      .reduce((seconds, zone) => seconds + zone.seconds, 0)).toBe(3_600);
  });

  it.each([1, 2, 4])(
    "integrates clockless legacy work, zones, TRIMP, and kJ/h exactly at %s Hz",
    (rateHz) => {
      const durationSec = 60;
      const watts = Array(durationSec * rateHz).fill(200);
      const heartRate = Array(durationSec * rateHz).fill(150);
      const power = selectWholeSessionSensorSeries(undefined, watts, undefined, undefined, durationSec);
      const hr = selectWholeSessionSensorSeries(undefined, heartRate, undefined, undefined, durationSec);
      const analysisDurationSec = resolvePowerAnalysisDurationSec({
        powerLength: power.values.length,
        powerTime: power.time,
      });

      expect(power.time).toHaveLength(durationSec * rateHz);
      expect(power.time?.[1]).toBe(1 / rateHz);
      expect(calculateWorkKj(watts, power.time)).toBeCloseTo(12, 10);
      expect(calculateNP(watts, power.time)).toBeCloseTo(200, 10);
      expect(calculateTSS(watts, 250, power.time)).toBeCloseTo(
        calculateTSS(Array(durationSec).fill(200), 250, Array.from({ length: durationSec }, (_, index) => index))!,
        10,
      );
      expect(calculatePowerZoneDistribution(watts, 250, power.time)
        .reduce((seconds, zone) => seconds + zone.seconds, 0)).toBeCloseTo(durationSec, 10);
      expect(calculateHrZoneDistribution(heartRate, 190, hr.time)
        .reduce((seconds, zone) => seconds + zone.seconds, 0)).toBeCloseTo(durationSec, 10);
      expect(calculateTRIMP(heartRate, 190, 60, "male", hr.time)).toBeCloseTo(
        calculateTRIMP(Array(durationSec).fill(150), 190, 60, "male", Array.from({ length: durationSec }, (_, index) => index))!,
        10,
      );
      expect(analysisDurationSec).toBeCloseTo(durationSec, 10);
      expect(calculateKjPerHour(12, analysisDurationSec)).toBeCloseTo(720, 10);
    },
  );

  it("integrates a short fractional trusted duration without a one-second tail", () => {
    const durationSec = 1.25;
    const watts = Array(5).fill(200);
    const selected = selectWholeSessionSensorSeries(undefined, watts, undefined, undefined, durationSec);

    expect(selected.time).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(calculateWorkKj(watts, selected.time)).toBeCloseTo(0.25, 10);
    expect(calculatePowerZoneDistribution(watts, 250, selected.time)
      .reduce((seconds, zone) => seconds + zone.seconds, 0)).toBeCloseTo(durationSec, 10);

    const subSecond = selectWholeSessionSensorSeries(undefined, [200, 200, 200], undefined, undefined, 0.75);
    expect(subSecond.time).toEqual([0, 0.25, 0.5]);
    expect(calculateWorkKj(subSecond.values, subSecond.time)).toBeCloseTo(0.15, 10);
  });

  it("keeps a compact 2 Hz legacy sensor on riding time across a longer paused route", () => {
    const watts = Array(7_200).fill(200);
    const selected = selectWholeSessionSensorSeries(
      undefined,
      watts,
      Array.from({ length: 10_800 }, (_, index) => index * 0.5),
      1_700_000_000_000,
      3_600,
    );

    expect(selected.time?.[1]).toBe(0.5);
    expect(selected.time?.at(-1)).toBe(3_599.5);
    expect(calculateWorkKj(watts, selected.time)).toBe(720);
    expect(resolvePowerAnalysisDurationSec({ powerLength: watts.length, powerTime: selected.time }))
      .toBe(3_600);
  });

  it.each([
    ["an implausible over-dense rate", Array(5).fill(200), 1],
    ["just above the 4 Hz ceiling", Array(241).fill(200), 60],
    ["insufficient duration coverage", Array(2).fill(200), 10],
    ["just below 95 percent coverage", Array(56).fill(200), 60],
    ["too few samples", [200], 0.5],
    ["no trusted duration", Array(4).fill(200), undefined],
  ])("fails clockless legacy timing closed for %s", (_case, values, durationSec) => {
    expect(selectWholeSessionSensorSeries(undefined, values, undefined, undefined, durationSec).time)
      .toBeUndefined();
  });

  it("accepts the 95 percent coverage boundary for a trusted duration", () => {
    expect(selectWholeSessionSensorSeries(
      undefined,
      Array(57).fill(200),
      undefined,
      undefined,
      60,
    ).time).toHaveLength(57);
  });

  it.each([
    ["epoch milliseconds", [1_700_000_000_000, 1_700_000_001_000, 1_700_000_002_000]],
    ["epoch seconds", [1_700_000_000, 1_700_000_001, 1_700_000_002]],
  ])("normalizes an aligned %s route axis for legacy sensors", (_case, routeTime) => {
    expect(selectWholeSessionSensorSeries(undefined, [200, 210, 220], routeTime)).toEqual({
      values: [200, 210, 220],
      time: [0, 1, 2],
      source: "legacy",
      timeOriginEpochMs: 1_700_000_000_000,
    });
  });

  it("rejects an equal-length route clock whose sampling duration conflicts with the activity", () => {
    const values = Array.from({ length: 3_600 }, () => 200);
    const halfSecondRouteTime = Array.from(
      { length: 3_600 },
      (_, index) => 1_700_000_000_000 + index * 500,
    );
    const selected = selectWholeSessionSensorSeries(
      undefined,
      values,
      halfSecondRouteTime,
      1_700_000_000_000,
      3_600,
    );

    expect(selected.time?.[0]).toBe(0);
    expect(selected.time?.[1]).toBe(1);
    expect(selected.time?.[3_599]).toBe(3_599);
  });

  it("keeps an aligned relative-seconds route axis", () => {
    expect(selectWholeSessionSensorSeries(undefined, [200, 210, 220], [10, 11, 12])).toEqual({
      values: [200, 210, 220],
      time: [10, 11, 12],
      source: "legacy",
      timeOriginEpochMs: undefined,
    });
  });

  it.each(["power", "heart rate", "cadence"])(
    "fails closed for time-based legacy %s analysis when no clock or 1 Hz duration provenance exists",
    () => {
      const selected = selectWholeSessionSensorSeries(undefined, [200, 210, 220], undefined);
      expect(selected.values).toEqual([200, 210, 220]);
      expect(selected.time).toBeUndefined();
    },
  );

  it("compares mixed explicit and epoch-millisecond legacy axes in the same canonical clock", () => {
    const explicitPower = selectWholeSessionSensorSeries(
      { values: [200, 210, 220], time: [0, 1, 2], complete: true, timeOriginEpochMs: 1_700_000_000_000 },
      undefined,
      undefined,
    );
    const legacyHeartRate = selectWholeSessionSensorSeries(
      undefined,
      [140, 142, 144],
      [1_700_000_000_000, 1_700_000_001_000, 1_700_000_002_000],
    );
    expect(wholeSessionSeriesShareAxis(explicitPower, legacyHeartRate)).toBe(true);
  });

  it.each([
    [
      "explicit power and legacy HR",
      selectWholeSessionSensorSeries(
        {
          values: [200, 210, 220], time: [0, 1, 2], complete: true,
          timeOriginEpochMs: 1_700_000_000_000,
        },
        [300, 310, 320],
        [10, 11, 12],
      ),
      selectWholeSessionSensorSeries(undefined, [140, 142, 144], [0, 1, 2], 1_700_000_000_000),
    ],
    [
      "legacy power and explicit HR",
      selectWholeSessionSensorSeries(undefined, [200, 210, 220], [0, 1, 2], 1_700_000_000_000),
      selectWholeSessionSensorSeries(
        {
          values: [140, 142, 144], time: [0, 1, 2], complete: true,
          timeOriginEpochMs: 1_700_000_000_000,
        },
        [150, 151, 152],
        [10, 11, 12],
      ),
    ],
  ])("allows aligned mixed-source axes: %s", (_case, power, heartRate) => {
    expect(wholeSessionSeriesShareAxis(power, heartRate)).toBe(true);
  });

  it.each([
    [
      "explicit power and legacy HR",
      selectWholeSessionSensorSeries(
        {
          values: [200, 210, 220], time: [0, 1, 2], complete: true,
          timeOriginEpochMs: 1_700_000_001_000,
        },
        [300, 310, 320],
        [10, 11, 12],
      ),
      selectWholeSessionSensorSeries(undefined, [140, 142, 144], [0, 1, 2], 1_700_000_000_000),
    ],
    [
      "legacy power and explicit HR",
      selectWholeSessionSensorSeries(undefined, [200, 210, 220], [0, 1, 2], 1_700_000_000_000),
      selectWholeSessionSensorSeries(
        {
          values: [140, 142, 144], time: [0, 1, 2], complete: true,
          timeOriginEpochMs: 1_700_000_001_000,
        },
        [150, 151, 152],
        [10, 11, 12],
      ),
    ],
  ])("rejects mismatched mixed-source axes: %s", (_case, power, heartRate) => {
    expect(wholeSessionSeriesShareAxis(power, heartRate)).toBe(false);
  });

  it("fails closed for mixed sources when either absolute origin is missing", () => {
    const explicitPower = selectWholeSessionSensorSeries(
      { values: [200, 210, 220], time: [0, 1, 2], complete: true },
      undefined,
      undefined,
    );
    const legacyHeartRate = selectWholeSessionSensorSeries(
      undefined,
      [140, 142, 144],
      [0, 1, 2],
      1_700_000_000_000,
    );
    expect(wholeSessionSeriesShareAxis(explicitPower, legacyHeartRate)).toBe(false);
  });

  it("keeps relative comparison for two legacy series", () => {
    const legacyPower = selectWholeSessionSensorSeries(undefined, [200, 210, 220], [0, 1, 2]);
    const legacyHeartRate = selectWholeSessionSensorSeries(undefined, [140, 142, 144], [0, 1, 2]);
    expect(wholeSessionSeriesShareAxis(legacyPower, legacyHeartRate)).toBe(true);
  });

  it.each([
    ["relative", (index: number) => index],
    ["epoch seconds", (index: number) => 1_700_000_000 + index],
    ["epoch milliseconds", (index: number) => 1_700_000_000_000 + index * 1000],
  ])("carries an aligned override origin into EF and decoupling on a %s route", (_case, at) => {
    const time = Array.from({ length: 600 }, (_, index) => at(index));
    const streams = {
      time,
      watts: Array.from({ length: 600 }, (_, index) => index < 300 ? 200 : 190),
      heartrate: Array.from({ length: 600 }, (_, index) => index < 300 ? 140 : 145),
    };
    const projection = buildActivityAnalysisProjection(streams as never, {
      legacyDurationSec: 600,
      explicitDurationSec: 600,
      activityStartTime: 1_700_000_000_000,
      powerOverride: { source: "virtualPowerOverride", time },
    })!;
    const power = selectWholeSessionSensorSeries(
      projection.power,
      projection.streams.watts,
      projection.streams.time,
      1_700_000_000_000,
      600,
    );
    const heartRate = selectWholeSessionSensorSeries(
      projection.heartRate,
      projection.streams.heartrate,
      projection.streams.time,
      1_700_000_000_000,
      600,
    );

    expect(wholeSessionSeriesShareAxis(power, heartRate)).toBe(true);
    expect(calculateEF(power.values, heartRate.values)).not.toBeNull();
    expect(calculateDecoupling(power.values, heartRate.values)).not.toBeNull();
  });

  it("aligns override power with explicit HR only when their absolute origins match", () => {
    const time = Array.from({ length: 600 }, (_, index) => index);
    const makeProjection = (heartRateOrigin: number) => buildActivityAnalysisProjection({
      time,
      watts: Array(600).fill(200),
      sensorStreamsV1: {
        version: 1,
        timeUnit: "relative_seconds",
        resolutionSeconds: 1,
        timeOriginEpochMs: heartRateOrigin,
        time,
        heartrate: Array(600).fill(145),
      },
    } as never, {
      legacyDurationSec: 600,
      explicitDurationSec: 600,
      activityStartTime: 1_700_000_000_000,
      powerOverride: { source: "virtualPowerOverride", time },
    })!;
    const aligned = makeProjection(1_700_000_000_000);
    const alignedPower = selectWholeSessionSensorSeries(aligned.power, undefined, undefined);
    const alignedHeartRate = selectWholeSessionSensorSeries(aligned.heartRate, undefined, undefined);
    expect(wholeSessionSeriesShareAxis(alignedPower, alignedHeartRate)).toBe(true);
    expect(calculateEF(alignedPower.values, alignedHeartRate.values)).not.toBeNull();
    expect(calculateDecoupling(alignedPower.values, alignedHeartRate.values)).not.toBeNull();

    const mismatched = makeProjection(1_700_000_002_000);
    const mismatchedPower = selectWholeSessionSensorSeries(mismatched.power, undefined, undefined);
    const mismatchedHeartRate = selectWholeSessionSensorSeries(mismatched.heartRate, undefined, undefined);
    expect(wholeSessionSeriesShareAxis(mismatchedPower, mismatchedHeartRate)).toBe(false);
  });

  it("fails mixed-source override analysis closed when a relative route has no origin", () => {
    const time = Array.from({ length: 600 }, (_, index) => index);
    const projection = buildActivityAnalysisProjection({
      time,
      watts: Array(600).fill(200),
      heartrate: Array(600).fill(145),
    } as never, {
      legacyDurationSec: 600,
      powerOverride: { source: "virtualPowerOverride", time },
    })!;

    expect(wholeSessionSeriesShareAxis(
      selectWholeSessionSensorSeries(projection.power, undefined, undefined),
      selectWholeSessionSensorSeries(undefined, projection.streams.heartrate, projection.streams.time),
    )).toBe(false);
  });

  it("normalizes activity start time seconds and milliseconds", () => {
    expect(normalizeActivityStartTimeMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(normalizeActivityStartTimeMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(normalizeActivityStartTimeMs(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
