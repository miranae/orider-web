import { describe, expect, it } from "vitest";

import { calculateThreeSecondPowerMax } from "./powerStats";

describe("calculateThreeSecondPowerMax", () => {
  it.each([1, 2, 4])("returns the same maximum for equivalent %i Hz power", (rateHz) => {
    const length = 6 * rateHz;
    const time = Array.from({ length }, (_, index) => index / rateHz);
    const watts = time.map((second) => second < 3 ? 300 : 100);

    expect(calculateThreeSecondPowerMax(watts, time)).toBeCloseTo(300, 10);
  });

  it("returns no instantaneous fallback when every measured run is shorter than three seconds", () => {
    expect(calculateThreeSecondPowerMax(
      [900, 900],
      [0, 2],
      { durationsSec: [2, 2], segmentStarts: [true, true] },
    )).toBeNull();
  });
});
