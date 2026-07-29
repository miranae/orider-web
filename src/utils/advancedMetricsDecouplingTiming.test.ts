import { describe, expect, it } from "vitest";

import { calculateDecoupling } from "./advancedMetrics";

describe("calculateDecoupling time semantics", () => {
  it.each([1, 2, 4])("uses 600 elapsed seconds instead of sample count at %i Hz", (rateHz) => {
    const length = 600 * rateHz;
    const watts = Array(length).fill(200);
    const heartrate = Array.from(
      { length },
      (_, index) => index < 300 * rateHz ? 150 : 165,
    );
    const timing = { durationsSec: Array(length).fill(1 / rateHz) };

    expect(calculateDecoupling(watts, heartrate, timing)).toBeCloseTo(9.0909, 4);
  });

  it.each([1, 2, 4])("rejects an actual duration below 600 seconds at %i Hz", (rateHz) => {
    const length = 600 * rateHz - 1;
    expect(calculateDecoupling(
      Array(length).fill(200),
      Array(length).fill(150),
      { durationsSec: Array(length).fill(1 / rateHz) },
    )).toBeNull();
  });

  it("splits a midpoint-crossing irregular sample across both weighted halves", () => {
    const watts = Array(4).fill(200);
    const heartrate = [100, 200, 300, 400];
    const timing = { durationsSec: [100, 300, 200, 100] };

    // 350s midpoint splits the second sample into 250s before and 50s after.
    // avgHR halves are 1200/7 and 2200/7, with constant 200W NP in both halves.
    expect(calculateDecoupling(watts, heartrate, timing)).toBeCloseTo(45.4545, 4);
  });

  it("preserves segment boundaries instead of building 30-second NP windows across gaps", () => {
    const length = 60;
    const segmentStarts = Array.from({ length }, (_, index) => index % 2 === 0);

    expect(calculateDecoupling(
      Array(length).fill(200),
      Array(length).fill(150),
      { durationsSec: Array(length).fill(10), segmentStarts },
    )).toBeNull();
  });
});
