import { describe, expect, it } from "vitest";
import { isYearRecapSeason } from "./yearRecapSeason";

describe("isYearRecapSeason", () => {
  it("returns true in December", () => {
    expect(isYearRecapSeason(new Date("2026-12-01T00:00:00"))).toBe(true);
  });

  it("returns false outside December", () => {
    expect(isYearRecapSeason(new Date("2026-11-30T23:59:59"))).toBe(false);
    expect(isYearRecapSeason(new Date("2027-01-01T00:00:00"))).toBe(false);
  });
});
