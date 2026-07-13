import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile fitness decision hierarchy", () => {
  const source = fs.readFileSync(path.resolve("src/components/mobile/MobileFitnessPage.tsx"), "utf8");

  it("shows a compact active FTP and cycling ability without the duplicate snapshot", () => {
    expect(source).toContain("function BikeAbilityCompact");
    expect(source).toContain("abilityPercentile");
    expect(source).toContain("thresholdDecision?.activeFtpW");
    expect(source).not.toContain("function FitnessSnapshot");
    expect(source).not.toContain("const kpiItems");
    expect(source).not.toContain("<FtpProgressionCard");
  });

  it("keeps the integrated load summary and moves load-focus evidence into details", () => {
    const load = fs.readFileSync(path.resolve("src/components/mobile/IntegratedLoadCard.tsx"), "utf8");
    expect(load).toContain("<details");
    expect(load).toContain('minHeight: 44');
    expect(load).toContain('mobileFitness.integrated.detailsToggle');
  });
});
