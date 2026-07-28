import { describe, expect, it } from "vitest";

import { sensorSeriesShareCompleteAxis } from "./AnalysisTab";

describe("AnalysisTab sensor axis", () => {
  it("allows complete HR and power series on the same explicit time axis", () => {
    expect(sensorSeriesShareCompleteAxis(
      { values: [180, 190, 200], time: [0, 1, 2], complete: true },
      { values: [140, 142, 144], time: [0, 1, 2], complete: true },
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
});
