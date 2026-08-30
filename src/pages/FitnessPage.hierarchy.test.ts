import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FitnessPage desktop hierarchy", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/FitnessPage.tsx"), "utf8");
  const modelSource = readFileSync(join(process.cwd(), "src/hooks/useFitnessModel.ts"), "utf8");
  it("uses the site shell and puts the coach briefing before PMC and deep metrics", () => {
    expect(source).toContain('className="site-shell"');
    expect(source).not.toContain("maxWidth: 1120");
    expect(source).toContain("<FitnessCoachBriefing");
    expect(source.indexOf("<FitnessCoachBriefing")).toBeLessThan(source.indexOf("{/* PMC 차트 */}"));
    expect(source.indexOf("{/* PMC 차트 */}")).toBeLessThan(source.indexOf('t("conclusion.trainingDetailToggle")'));
    expect(source.indexOf("{/* PMC 차트 */}")).toBeLessThan(source.indexOf("{/* 상세 분석 —"));
    expect(source).toContain("activityMarkers={activityImpacts.map");
    expect(source).toContain('discipline === "tri" || !hasCanonicalTimeseries');
    expect(source).not.toContain("{/* KPI 스트립 */}");
  });

  it("separates the canonical FTP decision from restored PDC evidence", () => {
    expect(source).toContain("<BikeThresholdDecisionCard");
    expect(source).toContain("progressionPoints={ftpProgression}");
    expect(source).not.toContain("<BikeActionAccordion");
    expect(source).not.toContain('t("kpi.activeFtpLabel")');
    expect(source).not.toContain('t("ftpCard.pdcTteLabel")');
    expect(source).not.toContain("defaultEvidenceOpen");
    expect(source).toContain('t("conclusion.performanceDetailToggle")');
    expect(source).toContain('t("vo2maxCard.pdcLabel")');
    expect(source).toContain('t("vo2maxCard.trendAriaValues"');
    expect(source).toContain("<desc>{trendDescription}</desc>");
    // FTP 결정 수락은 useFitnessModel 로 추출됐다 — 페이지가 아니라 훅을 본다.
    expect(modelSource).toContain("await acceptBikeThresholdDecision(user.uid, bikeFtpDecision)");
    expect(modelSource).not.toContain("persistRiderMetrics");
    expect(source).not.toContain("persistRiderMetrics");
  });
});
