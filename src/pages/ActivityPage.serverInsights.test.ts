import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("activity detail server insights", () => {
  it("consumes provenance-filtered server metrics without client physiology recomputation", () => {
    const analysisTab = readFileSync(join(process.cwd(), "src/components/AnalysisTab.tsx"), "utf8");
    const analysisModel = readFileSync(join(process.cwd(), "src/hooks/useActivityAnalysisModel.ts"), "utf8");
    expect(analysisModel).toContain("startTime: activity.startTime");
    expect(analysisTab).toContain("filterInvalidatedServerMetrics(serverMetrics.metrics");
    // 센서 provenance가 무효화되면 배너도 필터된 projection 을 받고 서버 파생값을 되살리지 않는다.
    expect(analysisTab).toContain("state={visibleServerMetrics}");
    expect(analysisTab).toContain("suppressPowerMetrics={suppressServerPowerMetrics");
    expect(analysisTab).toContain("suppressHeartRateMetrics={suppressServerHeartRateMetrics");
    expect(analysisTab).not.toContain("calculateNP(");
    expect(analysisTab).not.toContain("calculateTSS(");
    expect(analysisTab).not.toContain("calculateHrZoneDistribution(");
  });
});
