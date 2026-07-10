import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("activity detail server insights", () => {
  it("surfaces server-computed metrics in activity detail and climb analysis", () => {
    const activityPage = readFileSync(join(process.cwd(), "src/pages/ActivityPage.tsx"), "utf8");
    const analysisTab = readFileSync(join(process.cwd(), "src/components/AnalysisTab.tsx"), "utf8");
    const metricsHook = readFileSync(join(process.cwd(), "src/hooks/useActivityMetrics.ts"), "utf8");

    expect(metricsHook).toContain("loadAxes?");
    expect(metricsHook).toContain("newPrs?");
    expect(activityPage).toContain("ServerActivityInsightsCard");
    expect(activityPage).toContain("metrics?.loadAxes");
    expect(activityPage).toContain("wPrimeMinJ");
    expect(activityPage).toContain("metrics?.newPrs");
    expect(activityPage).toContain("weather.temperature");
    expect(analysisTab).toContain("const climbRows = useMemo");
    expect(analysisTab).toContain("sm?.climbs");
    expect(analysisTab).toContain("c.wPerKg");
    expect(analysisTab).toContain("c.vam");
  });
});
