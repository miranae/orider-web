import { describe, expect, it } from "vitest";
import { parseCohortDistributions } from "./useCohortPercentiles";

const validDistribution = {
  basis: "vo2max_ml_kg_min",
  domain: [20, 95],
  approximateSampleSize: 120,
  bins: [
    { from: 20, to: 40, densityLevel: 2 },
    { from: 40, to: 95, densityLevel: 5 },
  ],
  privacy: { minimumCellSize: 5, exactCountsPublished: false, method: "adjacent_merge_relative_density_v1" },
  computedAt: 1_752_451_200_000,
};

describe("parseCohortDistributions", () => {
  it("accepts only the optional v2 distribution keys and preserves approximate sample size", () => {
    expect(parseCohortDistributions({ vo2max: validDistribution, unknown: validDistribution })).toEqual({ vo2max: validDistribution });
  });

  it.each([
    { ...validDistribution, bins: [{ from: 21, to: 95, densityLevel: 2 }] },
    { ...validDistribution, bins: [{ from: 20, to: 40, densityLevel: 2 }, { from: 41, to: 95, densityLevel: 5 }] },
    { ...validDistribution, bins: [{ from: 20, to: 94, densityLevel: 2 }] },
    { ...validDistribution, bins: [{ from: 20, to: 95, densityLevel: 6 }] },
    { ...validDistribution, privacy: { minimumCellSize: 5, exactCountsPublished: true, method: "raw" } },
  ])("rejects incomplete, invalid-density, or exact-count-publishing shapes", (distribution) => {
    expect(parseCohortDistributions({ vo2max: distribution })).toBeUndefined();
  });

  it.each([
    { ...validDistribution, basis: "coggan_score_v1" },
    { ...validDistribution, domain: [20, 100] },
    { ...validDistribution, approximateSampleSize: 19 },
    { ...validDistribution, approximateSampleSize: 125 },
    { ...validDistribution, privacy: { ...validDistribution.privacy, method: "merge_adjacent" } },
    { ...validDistribution, computedAt: undefined },
  ])("rejects a VO2max distribution that misses its exact backend contract", (distribution) => {
    expect(parseCohortDistributions({ vo2max: distribution })).toBeUndefined();
  });

  it("validates ability distributions against the Coggan score contract", () => {
    const ability = {
      ...validDistribution,
      basis: "coggan_score_v1",
      domain: [0, 100],
      bins: [{ from: 0, to: 100, densityLevel: 3 }],
    };
    expect(parseCohortDistributions({ overallAbility: ability })).toEqual({ overallAbility: ability });
    expect(parseCohortDistributions({ overallAbility: { ...ability, domain: [0, 99] } })).toBeUndefined();
    expect(parseCohortDistributions({ overallAbility: { ...ability, basis: "vo2max_ml_kg_min" } })).toBeUndefined();
  });
});
