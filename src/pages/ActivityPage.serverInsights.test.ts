import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("activity detail server insights", () => {
  it("keeps server metrics in analysis without a duplicate summary card", () => {
    const activityPage = readFileSync(join(process.cwd(), "src/pages/ActivityPage.tsx"), "utf8");
    const insightCards = readFileSync(join(process.cwd(), "src/features/activity/detail/ActivityInsightCards.tsx"), "utf8");
    const analysisTab = readFileSync(join(process.cwd(), "src/components/AnalysisTab.tsx"), "utf8");
    const metricsHook = readFileSync(join(process.cwd(), "src/hooks/useActivityMetrics.ts"), "utf8");

    expect(metricsHook).toContain("loadAxes?");
    expect(metricsHook).toContain("newPrs?");
    expect(activityPage).not.toContain("ServerActivityInsightsCard");
    expect(insightCards).not.toContain("Server insights");
    expect(activityPage).toContain("startTime={activity.startTime}");
    expect(analysisTab).toContain("const sm = serverMetrics.metrics");
    expect(analysisTab).toContain("<ServerMetricsBanner state={serverMetrics} />");
    expect(analysisTab).toContain("const climbRows = useMemo");
    expect(analysisTab).toContain("sm?.climbs");
    expect(analysisTab).toContain("c.wPerKg");
    expect(analysisTab).toContain("c.vam");
    expect(analysisTab).toContain("c.durationSec");
    expect(analysisTab).toContain("c.entrySec");
    expect(analysisTab).toContain("buildClimbTableRows(sm?.climbs, climbs, {");
  });
});
