import { describe, expect, it } from "vitest";

import {
  calculateKjPerHour,
  resolveAnalysisDurationSec,
  selectWholeSessionSensorSeries,
  normalizeActivityStartTimeMs,
  sensorSeriesShareCompleteAxis,
  wholeSessionSeriesShareAxis,
} from "./AnalysisTab";

describe("AnalysisTab sensor axis", () => {
  it("uses route and summary duration for whole-activity rates", () => {
    const distanceOnly = resolveAnalysisDurationSec(
      60,
      Array.from({ length: 60 }, (_, index) => index),
      0,
      undefined,
      { userId: "rider", distance: Array(3_600).fill(0) },
    );
    expect(distanceOnly).toBe(3_600);
    expect(calculateKjPerHour(120, distanceOnly)).toBe(120);

    expect(resolveAnalysisDurationSec(
      60,
      Array.from({ length: 60 }, (_, index) => index),
      0,
      undefined,
      { userId: "rider" },
      { elapsedTimeMillis: 7_200_000 } as never,
    )).toBe(7_200);
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
