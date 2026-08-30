import { describe, expect, it } from "vitest";

import {
  profileAnnotationPlacement,
  profileGradeBand,
  selectProminentProfilePeaks,
} from "./profileLandmarks";

describe("selectProminentProfilePeaks", () => {
  const profile = [
    { distance: 0, elevation: 100 },
    { distance: 10_000, elevation: 500 },
    { distance: 20_000, elevation: 120 },
    { distance: 30_000, elevation: 760 },
    { distance: 40_000, elevation: 200 },
    { distance: 50_000, elevation: 620 },
    { distance: 60_000, elevation: 150 },
  ];

  it("returns deterministic local peaks in course order", () => {
    const first = selectProminentProfilePeaks(profile);
    const second = selectProminentProfilePeaks(profile);

    expect(first).toEqual(second);
    expect(first.map((peak) => peak.distance)).toEqual([10_000, 30_000, 50_000]);
    expect(first.map((peak) => peak.index)).toEqual([1, 3, 5]);
  });

  it("honors the limit by prominence without inventing endpoint peaks", () => {
    expect(selectProminentProfilePeaks(profile, 2).map((peak) => peak.distance)).toEqual([30_000, 50_000]);
    expect(selectProminentProfilePeaks([
      { distance: 0, elevation: 500 },
      { distance: 10_000, elevation: 300 },
      { distance: 20_000, elevation: 100 },
    ])).toEqual([]);
  });

  it("drops invalid and duplicate-distance samples while preserving source indexes", () => {
    const peaks = selectProminentProfilePeaks([
      { distance: 0, elevation: 0 },
      { distance: 10, elevation: Number.NaN },
      { distance: 20, elevation: 100 },
      { distance: 20, elevation: 200 },
      { distance: 30, elevation: 0 },
    ]);
    expect(peaks).toEqual([{ index: 2, distance: 20, elevation: 100, prominence: 0 }]);
  });
});

describe("profileGradeBand", () => {
  it("classifies profile segments using the shared 3 and 7 percent thresholds", () => {
    const start = { distance: 0, elevation: 0 };
    expect(profileGradeBand(start, { distance: 1_000, elevation: 20 })).toBe("flat");
    expect(profileGradeBand(start, { distance: 1_000, elevation: 50 })).toBe("rolling");
    expect(profileGradeBand(start, { distance: 1_000, elevation: 80 })).toBe("steep");
  });
});

describe("profileAnnotationPlacement", () => {
  it("assigns five landmarks to rows 1&4 / 2&5 / 3", () => {
    expect([0, 1, 2, 3, 4].map((index) => profileAnnotationPlacement(index, 0.5).row))
      .toEqual([0, 1, 2, 0, 1]);
  });

  it("keeps 8rem cards inside the narrowest desktop rail", () => {
    const railWidth = 660;
    const cardWidth = 128;
    for (const ratio of [0.02, 0.1, 0.11, 0.5, 0.89, 0.9, 0.98]) {
      const placement = profileAnnotationPlacement(0, ratio);
      const left = ratio * railWidth + (placement.translatePercent / 100) * cardWidth;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + cardWidth).toBeLessThanOrEqual(railWidth);
    }
  });

  it("centers the target course first high point at the connected threshold", () => {
    const firstHighPointRatio = 13.1 / 122.9;
    expect(profileAnnotationPlacement(0, firstHighPointRatio)).toMatchObject({
      edge: "center",
      connectorPath: "M64 0 L64 100",
    });
  });

  it("bends edge connectors from the card center to the actual peak x", () => {
    expect(profileAnnotationPlacement(0, 0.05)).toMatchObject({
      edge: "left",
      connectorPath: "M64 0 L0 100",
    });
    expect(profileAnnotationPlacement(0, 0.5)).toMatchObject({
      edge: "center",
      connectorPath: "M64 0 L64 100",
    });
    expect(profileAnnotationPlacement(0, 0.95)).toMatchObject({
      edge: "right",
      connectorPath: "M64 0 L128 100",
    });
  });
});
