import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile fitness decision hierarchy", () => {
  const source = fs.readFileSync(path.resolve("src/components/mobile/MobileFitnessPage.tsx"), "utf8");

  it("keeps one canonical active FTP while restoring the evidence-rich bike snapshot", () => {
    expect(source).toContain("function BikeAbilityCompact");
    expect(source).toContain("abilityPercentile");
    expect(source).toContain("thresholdDecision?.activeFtpW");
    expect(source).toContain("W/kg");
    expect(source).toContain("vo2PdcSource");
    expect(source).toContain("vo2FormulaSource");
    expect(source).toContain("CTL ${data.ctl.toFixed(1)} · ATL");
    expect(source).toContain("<FtpProgressionCard");
    expect(source).toContain("currentFtpW={activeFtp}");
  });

  it("keeps the integrated load summary and moves load-focus evidence into details", () => {
    const load = fs.readFileSync(path.resolve("src/components/mobile/IntegratedLoadCard.tsx"), "utf8");
    expect(load).toContain("<details");
    expect(load).toContain('minHeight: 44');
    expect(load).toContain('mobileFitness.integrated.detailsToggle');
  });
});
