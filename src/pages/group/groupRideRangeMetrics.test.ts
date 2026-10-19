import { expect, it } from "vitest";
import type { ActivityStreams } from "@shared/types";
import { observedRideRange } from "./groupRideRangeMetrics";
const stream = (data: Partial<ActivityStreams>) => data as ActivityStreams;
it("weights unequal intervals and clips boundaries even when no sample lies inside the window", () => {
  const input = stream({ watts: [100, 200, 999] });
  const result = observedRideRange(input, [0, 1000, 3000], { axis: "time", start: 0, end: 3000 });
  expect(result.metrics.power.average).toBeCloseTo(500 / 3);
  const clipped = observedRideRange(input, [0, 1000, 3000], { axis: "time", start: 1200, end: 1800 });
  expect(clipped.metrics.power.average).toBe(200);
  expect(clipped.metrics.power.measuredSec).toBeCloseTo(0.6);
});
it("omits gaps and channel-specific missing values, preserves zero power/speed and never extends the last sample", () => {
  const result = observedRideRange(stream({ watts: [0, 100, 200, 300, 999], heartrate: [0, 120, 140, 150, 199], velocity_smooth: [0, 2, NaN, 3, 9] }), [0, 1000, 2000, 100000, 101000], { axis: "time", start: 0, end: 110000 });
  expect(result.metrics.power.average).toBeCloseTo(400 / 3);
  expect(result.metrics.power.measuredSec).toBe(3);
  expect(result.metrics.hr.measuredSec).toBe(2);
  expect(result.metrics.speed.average).toBe(6);
  expect(result.metrics.power.fraction).toBeCloseTo(3 / 110);
  expect(result.partialRange).toBe(true);
});
it("maps each record's distance window to its own clock including stops and excludes the end boundary", () => {
  const result = observedRideRange(stream({ distance: [0, 100, 100, 200], watts: [100, 200, 300, 999] }), [0, 1000, 2000, 3000], { axis: "distance", start: 50, end: 150 });
  expect(result.durationSec).toBe(2);
  expect(result.metrics.power.average).toBe(200);
  const endStop = observedRideRange(stream({ distance: [0, 100, 100, 200], watts: [100, 200, 300, 999] }), [0, 1000, 2000, 3000], { axis: "distance", start: 0, end: 100 });
  expect(endStop.durationSec).toBe(1);
  expect(endStop.metrics.power.average).toBe(100);
});
it("does not fabricate weights for missing clocks, nonmonotonic distances or invalid timestamps", () => {
  expect(observedRideRange(stream({ watts: [100, 200] }), null, { axis: "distance", start: 0, end: 100 }).reason).toBe("clock");
  expect(observedRideRange(stream({ distance: [100, 0] }), [0, 1000], { axis: "distance", start: 0, end: 100 }).reason).toBe("distance");
  expect(observedRideRange(stream({ watts: [100, 200] }), [0, NaN], { axis: "time", start: 0, end: 1000 }).reason).toBe("clock");
});
it("marks distance coverage unknown when the requested distance exceeds that record", () => {
  const result = observedRideRange(stream({ distance: [0, 100], watts: [100, 999] }), [0, 1000], { axis: "distance", start: 50, end: 200 });
  expect(result.partialRange).toBe(true);
  expect(result.metrics.power.measuredSec).toBe(0.5);
  expect(result.metrics.power.fraction).toBeNull();
});
