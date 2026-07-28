import { describe, expect, it } from "vitest";

import {
  inferUniformSampleTimeAxis,
  maxWeightedAverage,
  sampleDurationsSec,
} from "./sampleTime";

describe("maxWeightedAverage", () => {
  it.each([1, 2, 4])("uses the same exact window on a %i Hz stream", (rateHz) => {
    const durations = Array(6 * rateHz).fill(1 / rateHz);
    const values = durations.map((_, index) => index < 3 * rateHz ? 300 : 100);

    expect(maxWeightedAverage(values, durations, 3)).toBeCloseTo(300, 10);
  });

  it("does not report a sub-three-second spike as the three-second maximum", () => {
    const values = [800, ...Array(11).fill(100)];
    const durations = Array(values.length).fill(0.25);

    expect(maxWeightedAverage(values, durations, 3)).toBeCloseTo(475 / 3, 10);
  });

  it("splits an irregular boundary sample to measure exactly three seconds", () => {
    expect(maxWeightedAverage([1_000, 0], [2, 2], 3)).toBeCloseTo(2_000 / 3, 10);
  });

  it("checks windows whose optimum ends inside an irregular boundary sample", () => {
    expect(maxWeightedAverage([0, 1_000], [2, 2], 3)).toBeCloseTo(2_000 / 3, 10);
  });

  it("accepts a duration that equals the window within accumulation precision", () => {
    const time = inferUniformSampleTimeAxis(10, 3)!;
    const durations = sampleDurationsSec(10, time);

    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBeLessThan(3);
    expect(maxWeightedAverage(Array(10).fill(200), durations, 3)).toBeCloseTo(200, 10);
  });

  it("never joins samples across a segment boundary", () => {
    expect(maxWeightedAverage(
      [1_000, 1_000, 100, 100, 100],
      [1, 1, 1, 1, 1],
      3,
      [true, false, true, false, false],
    )).toBe(100);
  });
});
