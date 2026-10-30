import { describe, expect, it } from "vitest";
import { estimateHrFuelSplit } from "./hrFuelSplit";
const bounds = [0, 120, 140, 160, 180].map((minBpm, i) => ({ zone: i + 1, minBpm, maxBpmExclusive: [120, 140, 160, 180, 201][i] }));
describe("explicit HR fuel model assumptions", () => {
  it("allocates the supplied actual-weight energy and calculates grams without changing total calories", () => {
    expect(estimateHrFuelSplit(600, 3600, 200, [0, 3600, 0, 0, 0], bounds)).toEqual({
      totalKcal: 600, fatKcal: 330, carbKcal: 270, fatPct: 55, carbPct: 45, fatGrams: 36.7, carbGrams: 67.5, basis: "heart_rate_zones" });
  });
  it("uses more carbohydrate at higher intensity and conserves energy for mixed zones", () => {
    const easy = estimateHrFuelSplit(999, 3600, 200, [3600, 0, 0, 0, 0], bounds)!;
    const hard = estimateHrFuelSplit(999, 3600, 200, [0, 0, 0, 0, 3600], bounds)!;
    expect(hard.carbPct).toBeGreaterThan(easy.carbPct);
    for (const result of [easy, hard, estimateHrFuelSplit(999, 3600, 200, [500, 1000, 1000, 1000, 100], bounds)!]) {
      expect(result.fatKcal + result.carbKcal).toBe(result.totalKcal);
      expect(result.fatPct + result.carbPct).toBe(100);
    }
  });
  it("caps the representative midpoint at maximum heart rate", () => {
    const extended = bounds.map(row => ({ ...row })); extended[4]!.maxBpmExclusive = 240;
    expect(estimateHrFuelSplit(600, 3600, 200, [0, 0, 0, 0, 3600], extended)).toMatchObject({ fatKcal: 0, carbKcal: 600 });
  });
  it("rejects absent, incomplete, overcounted or malformed evidence", () => {
    for (const seconds of [undefined, [], [0, 2000, 0, 0, 0], [0, 5000, 0, 0, 0], [NaN, 3600, 0, 0, 0]])
      expect(estimateHrFuelSplit(600, 3600, 200, seconds, bounds)).toBeUndefined();
    expect(estimateHrFuelSplit(600, 3600, 0, [0, 3600, 0, 0, 0], bounds)).toBeUndefined();
    expect(estimateHrFuelSplit(600, 3600, 200, [0, 3600, 0, 0, 0], [{}, ...bounds.slice(1)])).toBeUndefined();
  });
});
