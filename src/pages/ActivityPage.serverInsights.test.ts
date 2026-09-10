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

    // 훅은 shared 타입을 미러링만 한다 — 서버 필드를 다시 선언하면 두 곳에서 갈린다 (#2437).
    expect(metricsHook).toContain("newPrs?");
    expect(metricsHook).not.toContain("loadAxes?");
    expect(metricsHook).not.toContain("workoutTypeConfidence?");
    // 헤더가 약속한 stale 상태가 실제로 존재해야 한다 (#885).
    expect(metricsHook).toContain('status: "stale"');
    expect(activityPage).not.toContain("ServerActivityInsightsCard");
    expect(insightCards).not.toContain("Server insights");
    expect(activityPage).toContain("<AnalysisTab {...analysisTabProps} />");
    expect(analysisModel).toContain("startTime: activity.startTime");
    expect(analysisTab).toContain("filterServerMetricsForSensorCandidates(serverMetrics.metrics");
    // 현재 센서 후보가 있으면 배너도 필터된 projection 을 받고 서버 파생값을 되살리지 않는다.
    expect(analysisTab).toContain("state={visibleServerMetrics}");
    expect(analysisTab).toContain("suppressPowerMetrics={hasStreamPowerCandidate");
    expect(analysisTab).toContain("suppressHeartRateMetrics={hasStreamHeartRateCandidate");
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
