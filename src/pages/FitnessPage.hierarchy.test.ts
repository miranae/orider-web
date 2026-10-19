import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FitnessPage desktop hierarchy", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/FitnessPage.tsx"), "utf8");
  const modelSource = readFileSync(join(process.cwd(), "src/hooks/useFitnessModel.ts"), "utf8");
  it("uses the site shell and injects PMC into the coach hierarchy before secondary metrics", () => {
    expect(source).toContain('className="site-shell"');
    expect(source).not.toContain("maxWidth: 1120");
    expect(source).toContain("<FitnessCoachBriefing");
    expect(source).toContain('trendSlot={part === "condition" ? <section');
    expect(source.indexOf('trendSlot={part === "condition" ? <section')).toBeLessThan(source.indexOf('{part !== "condition" && bikeMetrics}'));
    expect(source).toContain('decisionSlot={part === "all" ? <TodayTrainingDecisionCard');
    expect(source).toContain("mobilePriority");
    expect(source).toContain("activityMarkers={activityImpacts.map");
    expect(source).toContain('discipline === "tri" || !hasCanonicalTimeseries');
    expect(source).not.toContain("{/* KPI 스트립 */}");
  });

  it("keeps the pending weekly explanation in the dated insight instead of repeating its standalone summary", () => {
    expect(source).toContain('const weekChangeSlot = part === "condition" && currentPoint && weeklyStats.insightReady !== false ? <FitnessWeeklyInsight loadSummaryOnly');
    expect(source).toContain('periodEvidenceSlot={<>{weekChangeSlot}{part === "condition" && currentPoint && <FitnessWeeklyInsight includeLoadSummary={false}');
    expect(source).toContain('asOf={weeklyStats.asOf} dateBasis={weeklyStats.dateBasis} ready={weeklyStats.insightReady}');
  });

  it("keeps the PMC history or its explanatory empty state visible when no current snapshot is available", () => {
    expect(source).toContain('discipline !== "tri" && !currentPoint && (');
    expect(source).not.toContain('!currentPoint && model.pmcHistoryPoints.length > 0');
    expect(source).toContain('!currentPoint && model.pmcHistoryPoints.length === 0');
  });

  it("separates the canonical FTP decision from restored PDC evidence", () => {
    expect(source).toContain("<BikeThresholdDecisionCard");
    expect(source).toContain("progressionPoints={ftpProgression}");
    expect(source).not.toContain("<BikeActionAccordion");
    expect(source).not.toContain('t("kpi.activeFtpLabel")');
    expect(source).not.toContain('t("ftpCard.pdcTteLabel")');
    expect(source).not.toContain("defaultEvidenceOpen");
    expect(source).toContain('"conclusion.performanceDetailToggle"');
    expect(source).toContain('t("vo2maxCard.pdcLabel")');
    expect(source).toContain('t("vo2maxCard.trendAriaValues"');
    expect(source).toContain("description={trendDescription}");
    // FTP 결정 수락은 useFitnessModel 로 추출됐다 — 페이지가 아니라 훅을 본다.
    expect(modelSource).toContain("await acceptBikeThresholdDecision(user.uid, bikeFtpDecision)");
    expect(modelSource).not.toContain("persistRiderMetrics");
    expect(source).not.toContain("persistRiderMetrics");
  });
});
