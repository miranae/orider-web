import { describe, expect, it } from "vitest";
import { computeBestPace } from "./CriticalPaceCurve";

describe("computeBestPace", () => {
  it("finds the best rolling window with a single pass per stream", () => {
    const velocity = [...Array(30).fill(2), ...Array(30).fill(4)];
    expect(computeBestPace([velocity], 30)).toBeCloseTo(250);
  });

  it("returns null when no stream can cover the duration", () => {
    expect(computeBestPace([[3, 3, 3]], 30)).toBeNull();
  });
});

