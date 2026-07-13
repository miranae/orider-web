import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile fitness snapshot contract", () => {
  const source = fs.readFileSync(path.resolve("src/components/mobile/MobileFitnessPage.tsx"), "utf8");

  it("uses PDC summary values and exposes a text status plus accessible pointer label", () => {
    expect(source).toContain("pdc?.vo2maxEst");
    expect(source).toContain("abilityPercentile");
    expect(source).toContain('role="img"');
    expect(source).toContain("aria-label={label}");
    expect(source).toContain("row.status");
  });

  it("does not evaluate missing load data as a zero score", () => {
    expect(source).toContain("data.hasLoadData ?");
    expect(source).toContain('value: data.hasLoadData ? `CTL');
    expect(source).toContain('t("mobileFitness.snapshot.insufficient")');
  });
});
