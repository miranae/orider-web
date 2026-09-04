import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("activity detail server insights", () => {
  it("keeps server metrics in analysis without a duplicate summary card", () => {
    const activityPage = readFileSync(join(process.cwd(), "src/pages/ActivityPage.tsx"), "utf8");
    const insightCards = readFileSync(join(process.cwd(), "src/features/activity/detail/ActivityInsightCards.tsx"), "utf8");
    const analysisTab = readFileSync(join(process.cwd(), "src/components/AnalysisTab.tsx"), "utf8");
    const analysisModel = readFileSync(join(process.cwd(), "src/hooks/useActivityAnalysisModel.ts"), "utf8");
    const metricsHook = readFileSync(join(process.cwd(), "src/hooks/useActivityMetrics.ts"), "utf8");

    expect(metricsHook).toContain("loadAxes?");
    expect(metricsHook).toContain("newPrs?");
    expect(activityPage).not.toContain("ServerActivityInsightsCard");
    expect(insightCards).not.toContain("Server insights");
    expect(activityPage).toContain("<AnalysisTab {...analysisTabProps} />");
    expect(analysisModel).toContain("startTime: activity.startTime");
    expect(analysisTab).toContain("filterServerMetricsForSensorCandidates(serverMetrics.metrics");
    // 분석 탭은 서버 정본을 그린다 — 스트림 후보로 서버 값을 억제하는 분기가 없다 (#2437).
    expect(analysisTab).toContain("suppressPowerMetrics={false}");
    expect(analysisTab).toContain("suppressHeartRateMetrics={false}");
    expect(analysisTab).not.toContain("calculateNP(");
    expect(analysisTab).not.toContain("calculateTSS(");
    expect(analysisTab).not.toContain("calculateHrZoneDistribution(");
    expect(analysisTab).toContain("const climbRows = useMemo");
    expect(analysisTab).toContain("sm?.climbs");
    expect(analysisTab).toContain("c.wPerKg");
    expect(analysisTab).toContain("c.vam");
    expect(analysisTab).toContain("c.durationSec");
    expect(analysisTab).toContain("c.entrySec");
    expect(analysisTab).toContain("buildClimbTableRows(sm?.climbs, [], {");
  });
});
