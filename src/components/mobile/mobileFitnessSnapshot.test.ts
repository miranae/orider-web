import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile fitness decision hierarchy", () => {
  const source = fs.readFileSync(path.resolve("src/components/mobile/BikePerformanceSummaryCard.tsx"), "utf8");

  it("keeps one canonical FTP hero and a dedicated performance hierarchy", () => {
    expect(source).toContain("function BikePerformanceSummaryCard");
    expect(source).toContain("decision?.activeFtpW");
    expect(source).toContain("W/kg");
    expect(source).toContain("<AbilityScoreScale");
    expect(source).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
    expect(source).toContain("vo2PdcSource");
    expect(source).toContain("vo2FormulaSource");
    expect(source).toContain("<FtpProgressionCard");
    expect(source).toContain("currentFtpW={activeFtp}");
    expect(source).not.toContain("CTL");
    expect(source).not.toContain("ATL");
    expect(source).not.toContain("TSB");
    expect(source).not.toContain("SnapshotBand");
    const hero = source.indexOf('variant="dataHero"');
    const rider = source.indexOf("<Chip");
    const grid = source.indexOf("metrics.map");
    const trend = source.indexOf("<FtpProgressionCard");
    const candidate = source.indexOf("<BikeFtpDecisionActionPanel");
    const evidence = source.indexOf("aria-expanded={evidenceOpen}");
    expect(hero).toBeLessThan(rider);
    expect(rider).toBeLessThan(grid);
    expect(grid).toBeLessThan(trend);
    expect(trend).toBeLessThan(candidate);
    expect(candidate).toBeLessThan(evidence);
  });

  it("keeps the integrated load summary and moves load-focus evidence into details", () => {
    const load = fs.readFileSync(path.resolve("src/components/mobile/IntegratedLoadCard.tsx"), "utf8");
    expect(load).toContain("<details");
    expect(load).toContain('minHeight: 44');
    expect(load).toContain('mobileFitness.integrated.detailsToggle');
  });
});
