import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("activity analysis canonical-only boundary", () => {
  it("does not recompute physiology or replace historical context in the browser", () => {
    const source = readFileSync("src/components/AnalysisTab.tsx", "utf8");
    for (const forbidden of ["estimateRecoveryHours", "useFitnessTimeseries", "profile?.ftp", "profile?.weightKg", "streams.ftp", "computeActivityMetrics", "calculateNormalizedPower"]) expect(source).not.toContain(forbidden);
    expect(source).toContain("const recovery = isOwner ? overviewRecovery : null");
    expect(readFileSync("src/components/MetabolismCard.tsx", "utf8")).not.toContain("relativeFatOxidation");
  });
  it("mounts the same evidence panel outside stream gates in page and embed", () => {
    for (const path of ["src/pages/ActivityPage.tsx", "src/embedded/surfaces/ActivityAnalysisSurface.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("<ActivityOverviewEvidence overview=");
      expect(source.indexOf("<ActivityOverviewEvidence overview=")).toBeLessThan(source.indexOf("<AnalysisTab {..."));
    }
  });
  it("includes privacy and source metadata in the overview request identity", () => {
    const source = readFileSync("src/hooks/useActivityAnalysisModel.ts", "utf8");
    for (const field of ["overviewActivity?.hidePower", "overviewActivity?.hideHr", "activity?.isVirtualPower", "activity?.contentRevision", "serverMetrics.status", "overviewMetrics?.metricsRevision", "overviewMetrics?.etag"]) expect(source).toContain(field);
  });
});
