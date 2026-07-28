import { describe, expect, it } from "vitest";

import {
  calculateKjPerHour,
  resolveAnalysisDurationSec,
  selectWholeSessionSensorSeries,
  normalizeActivityStartTimeMs,
  sensorSeriesShareCompleteAxis,
  wholeSessionSeriesShareAxis,
} from "./AnalysisTab";
import { calculateWorkKj } from "../utils/advancedMetrics";
import { calculateTSS } from "../utils/powerMetrics";
import { calculatePowerZoneDistribution } from "../utils/zoneAnalysis";

describe("AnalysisTab sensor axis", () => {
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
    const durationSec = resolveAnalysisDurationSec(
      watts.length,
      powerTime,
      5_400,
      Array.from({ length: 5_400 }, (_, index) => index),
      {
        userId: "rider",
        time: Array.from({ length: 10_800 }, (_, index) => index * 0.5),
      },
      { ridingTimeMillis: 3_600_000, elapsedTimeMillis: 5_400_000 } as never,
    );

    expect(calculateWorkKj(watts, powerTime)).toBe(720);
    expect(durationSec).toBe(3_600);
    expect(calculateKjPerHour(720, durationSec)).toBe(720);
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

  it("normalizes activity start time seconds and milliseconds", () => {
    expect(normalizeActivityStartTimeMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(normalizeActivityStartTimeMs(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(normalizeActivityStartTimeMs(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
