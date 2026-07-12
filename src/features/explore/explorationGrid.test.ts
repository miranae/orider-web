import { describe, expect, it } from "vitest";
import { aggregateExplorationGrid, computeMaxSquare, tileToLngLatBounds } from "./explorationGrid";

describe("computeMaxSquare", () => {
  it("returns size 0 for an empty stream", () => {
    expect(computeMaxSquare([])).toEqual({ size: 0, anchor: null });
  });

  it("counts a single tile as a 1x1 square", () => {
    expect(computeMaxSquare([{ x: 5, y: 5 }])).toEqual({ size: 1, anchor: { x: 5, y: 5 } });
  });

  it("dedups repeated visits of the same tile", () => {
    const result = computeMaxSquare([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }]);
    expect(result.size).toBe(1);
  });

  it("finds a 2x2 block among scattered tiles", () => {
    const cells = [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 },
      { x: 10, y: 10 }, // unrelated outlier
    ];
    expect(computeMaxSquare(cells)).toEqual({ size: 2, anchor: { x: 0, y: 0 } });
  });

  it("finds the larger of two disjoint square blocks", () => {
    const block3: { x: number; y: number }[] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) block3.push({ x, y });
    const block2 = [{ x: 20, y: 20 }, { x: 21, y: 20 }, { x: 20, y: 21 }, { x: 21, y: 21 }];
    const result = computeMaxSquare([...block2, ...block3]);
    expect(result.size).toBe(3);
    expect(result.anchor).toEqual({ x: 0, y: 0 });
  });

  it("does not count an L-shape (missing corner) as a full square", () => {
    // 2x2 minus the bottom-right corner — no full square larger than 1x1.
    const cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(computeMaxSquare(cells).size).toBe(1);
  });
});

describe("aggregateExplorationGrid", () => {
  it("returns zero tiles and maxSquare for an empty activity list", () => {
    const result = aggregateExplorationGrid([]);
    expect(result).toEqual({ tiles: [], tileCount: 0, maxSquare: 0 });
  });

  it("counts a tile visited by two different activities once", () => {
    const result = aggregateExplorationGrid([
      { thumbnailTrack: "37.5000,127.0000;37.5001,127.0001" },
      { thumbnailTrack: "37.5000,127.0000;37.5001,127.0001" },
    ]);
    expect(result.tileCount).toBeGreaterThan(0);
  });

  it("produces tiles that yield a positive maxSquare for a boxy grid track", () => {
    // A short back-and-forth loop tends to revisit and fill in a small block of z14 tiles.
    const result = aggregateExplorationGrid([
      { thumbnailTrack: "37.500,127.000;37.510,127.000;37.510,127.010;37.500,127.010;37.500,127.000" },
    ]);
    expect(result.tileCount).toBeGreaterThan(0);
    expect(result.maxSquare).toBeGreaterThanOrEqual(1);
  });

  it("crosses tile boundaries without gaps for a long sparse segment", () => {
    const result = aggregateExplorationGrid([{ thumbnailTrack: "37.5,100;37.5,101" }]);
    expect(result.tileCount).toBeGreaterThan(1);
  });
});

describe("tileToLngLatBounds", () => {
  it("returns a west < east, south < north rectangle", () => {
    const bounds = tileToLngLatBounds(100, 100, 14);
    expect(bounds.west).toBeLessThan(bounds.east);
    expect(bounds.south).toBeLessThan(bounds.north);
  });

  it("covers the whole world at zoom 0", () => {
    const bounds = tileToLngLatBounds(0, 0, 0);
    expect(bounds.west).toBeCloseTo(-180, 5);
    expect(bounds.east).toBeCloseTo(180, 5);
    expect(bounds.north).toBeGreaterThan(85);
    expect(bounds.south).toBeLessThan(-85);
  });
});
