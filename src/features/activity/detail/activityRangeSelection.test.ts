import { describe, expect, it } from "vitest";
import { formatElapsedBoundary, parseElapsedBoundary, confirmedRouteElapsedAxis, elapsedRangeFromChartSelection, elapsedRangeRouteBounds } from "./activityRangeSelection";
describe("range selection location contract", () => {
  it("preserves leading offsets instead of rebasing the first observation", () => {
    const epoch = 1791504000000;
    const axis = confirmedRouteElapsedAxis({ time: [epoch + 20000, epoch + 21000, epoch + 22000], activityStartEpochMs: epoch,
      elapsedDurationSec: 30, movingDurationSec: 10 });
    expect(axis).toEqual([20, 21, 22]);
    expect(confirmedRouteElapsedAxis({ time: [epoch / 1000 + 20, epoch / 1000 + 21], activityStartEpochMs: epoch,
      elapsedDurationSec: 30, movingDurationSec: 10 })).toEqual([20, 21]);
  });
  it("rejects compact timer, missing epoch origin, sparse/non-monotonic/mixed axes and unproven millisecond units", () => {
    const base = { time: [0, 1, 2], elapsedDurationSec: 10, movingDurationSec: 2 };
    expect(confirmedRouteElapsedAxis(base)).toBeNull();
    expect(confirmedRouteElapsedAxis({ ...base, routeElapsedConfirmed: true })).toEqual([0, 1, 2]);
    for (const time of [[0, 2, 1], [0, 0, 1], [0, NaN, 1], [0, 1791504000000], [0, 1000, 2000], Object.assign(new Array<number>(3), { 0: 0, 2: 2 })]) {
      expect(confirmedRouteElapsedAxis({ ...base, time: time as number[], routeElapsedConfirmed: true })).toBeNull();
    }
    expect(confirmedRouteElapsedAxis({ ...base, time: [1791504000000, 1791504001000] })).toBeNull();
    expect(confirmedRouteElapsedAxis({ ...base, time: [0, 1000, 2000], relativeTimeUnit: "milliseconds", routeElapsedConfirmed: true })).toEqual([0, 1, 2]);
  });
  it("allows elapsed legacy clocks only when their observation crosses moving duration or no pauses exist", () => {
    expect(confirmedRouteElapsedAxis({ time: [0, 1, 4], elapsedDurationSec: 5, movingDurationSec: 3 })).toEqual([0, 1, 4]);
    expect(confirmedRouteElapsedAxis({ time: [0, 1, 2], elapsedDurationSec: 3, movingDurationSec: 3 })).toEqual([0, 1, 2]);
    expect(confirmedRouteElapsedAxis({ time: [0, 1, 2], elapsedDurationSec: 3, movingDurationSec: null })).toBeNull();
  });
  it("maps inclusive/exclusive boundaries and flags clipping without bridging gaps or extending coverage", () => {
    expect(elapsedRangeRouteBounds([0, 1, 2, 3], { startOffsetSec: 1, endOffsetSec: 2 }, 2))
      .toEqual({ startIndex: 1, endIndex: 2, clippedBoundary: false });
    expect(elapsedRangeRouteBounds([0, 1, 2, 3], { startOffsetSec: 0.5, endOffsetSec: 2.5 }, 2))
      .toEqual({ startIndex: 0, endIndex: 3, clippedBoundary: true });
    expect(elapsedRangeRouteBounds([0, 1, 20, 21], { startOffsetSec: 0.5, endOffsetSec: 20.5 }, 2)).toBeNull();
    expect(elapsedRangeRouteBounds([5, 6, 7], { startOffsetSec: 0, endOffsetSec: 6 }, 2)).toBeNull();
    expect(elapsedRangeRouteBounds([0, 1, 2], { startOffsetSec: 1, endOffsetSec: 3 }, 2)).toBeNull();
  });
  it("uses retained raw indices for downsampling, never distance or index-as-seconds assumptions", () => {
    const axis = [0, 1, 2, 10, 11, 12, 13];
    expect(elapsedRangeFromChartSelection(axis, [0, 2, 4, 6], [1, 3])).toEqual({ startOffsetSec: 2, endOffsetSec: 13 });
    expect(elapsedRangeFromChartSelection(axis, [0, 2, 2, 6], [1, 3])).toBeNull();
    expect(elapsedRangeFromChartSelection(axis, [0, 2, 4, 6], [1, 1])).toBeNull();
    expect(elapsedRangeFromChartSelection(axis, [0, 2, 99], [1, 2])).toBeNull();
  });
});

describe("elapsed boundary clock input", () => {
  it("preserves fractional endpoints and formats hours without an end-of-minute overflow", () => {
    for (const value of [0, 0.2, 0.02, 0.0002, 59.999, 60, 1200.2, 3600.02]) {
      expect(parseElapsedBoundary(formatElapsedBoundary(value))).toBeCloseTo(value, 6);
    }
    expect(formatElapsedBoundary(59.9999999)).toBe("1:00");
    expect(formatElapsedBoundary(0.2)).not.toBe(formatElapsedBoundary(0.02));
    for (const value of ["20", "1:60", "1:60:00", "-1:00", "0:00.1234567", "x:y", ""]) expect(parseElapsedBoundary(value)).toBeNull();
  });
  it("retains exact epoch millisecond boundaries at the full-duration endpoint", () => {
    const epoch = 1791375809874;
    expect(confirmedRouteElapsedAxis({ time: [epoch, epoch + 200, epoch + 1800000], activityStartEpochMs: epoch, elapsedDurationSec: 1800, movingDurationSec: 1800 })).toEqual([0, 0.2, 1800]);
  });
});
