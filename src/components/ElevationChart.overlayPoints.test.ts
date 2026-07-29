import { describe, expect, it } from "vitest";

import { buildFiniteOverlayPoints } from "./ElevationChart";

describe("ElevationChart overlay points", () => {
  it("filters points whose distance is missing or non-finite", () => {
    expect(buildFiniteOverlayPoints(
      [100, 200, 300, 400],
      [0, undefined, Number.NaN, 3],
    )).toEqual([
      { x: 0, y: 100 },
      { x: 3, y: 400 },
    ]);
  });

  it("filters non-finite overlay values", () => {
    expect(buildFiniteOverlayPoints(
      [100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0],
      [0, 1, 2, 3, 4],
    )).toEqual([
      { x: 0, y: 100 },
      { x: 4, y: 0 },
    ]);
  });

  it("preserves null gaps and finite zero values when distance is finite", () => {
    expect(buildFiniteOverlayPoints([null, 0], [0, 1])).toEqual([
      { x: 0, y: null },
      { x: 1, y: 0 },
    ]);
  });
});
