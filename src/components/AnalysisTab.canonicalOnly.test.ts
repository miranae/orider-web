import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("activity analysis canonical-only boundary", () => {
  it("does not recompute physiology or replace historical context in the browser", () => {
    const source = readFileSync("src/components/AnalysisTab.tsx", "utf8");
    for (const forbidden of ["estimateRecoveryHours", "useFitnessTimeseries", "profile?.ftp", "profile?.weightKg", "streams.ftp", "computeActivityMetrics", "calculateNormalizedPower"]) expect(source).not.toContain(forbidden);
    expect(source).toContain("const recovery = isOwner ? overviewRecovery : null");
    expect(readFileSync("src/components/MetabolismCard.tsx", "utf8")).not.toContain("relativeFatOxidation");
  });
  it("includes visibility and source metadata in the overview request identity", () => {
    const source = readFileSync("src/hooks/useActivityAnalysisModel.ts", "utf8");
    for (const field of ["activity?.visibility", "activity?.isVirtualPower", "activity?.contentRevision", "serverMetrics.status", "overviewMetrics?.metricsRevision", "overviewMetrics?.etag"]) expect(source).toContain(field);
  });
});
