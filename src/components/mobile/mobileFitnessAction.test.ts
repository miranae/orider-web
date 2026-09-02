import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile fitness action", () => {
  it("removes today's workout from mobile fitness and keeps core sections ordered", () => {
    const source = read("src/components/mobile/MobileFitnessPage.tsx");
    const overview = source.slice(source.indexOf('{activeTab === "overview"'));
    const coreIndex = overview.indexOf("<BikePerformanceSummaryCard");
    const loadIndex = overview.indexOf("<IntegratedLoadCard");
    const sportIndex = overview.indexOf("<SportPerformanceCard");
    const analysisIndex = overview.indexOf('{activeTab === "analysis"');

    expect(overview).not.toContain("TodaysWorkoutCard");
    expect(coreIndex).toBeGreaterThan(-1);
    expect(loadIndex).toBeGreaterThan(-1);
    expect(overview).toContain('data.discipline === "tri" && data.combinedLoad');
    expect(sportIndex).toBeGreaterThan(-1);
    expect(coreIndex).toBeLessThan(loadIndex);
    expect(loadIndex).toBeLessThan(sportIndex);
    expect(analysisIndex).toBeGreaterThan(sportIndex);
    expect(overview).not.toContain("{kpiItems.map");
    expect(overview).toContain("<BikePerformanceSummaryCard");
  });

  it("keeps mobile Home activity-focused and limits Plan to adjustment review", () => {
    const mobileHome = read("src/components/mobile/MobileFeedPage.tsx");
    const plan = read("src/pages/PlanPage.tsx");

    expect(mobileHome).not.toContain("TodayTrainingDecisionCard");
    expect(mobileHome).not.toContain("TodaysWorkoutCard");
    expect(plan).toContain('<TodayTrainingDecisionCard user={user} discipline={discipline} surface="plan" />');
    expect(plan).not.toContain("TodaysWorkoutCard");
  });

  it("removes today's workout from desktop fitness", () => {
    const fitness = read("src/pages/FitnessPage.tsx");
    const triFitness = read("src/pages/fitness/TriFitnessView.tsx");
    expect(fitness).not.toContain("TodaysWorkoutCard");
    expect(fitness).not.toContain("TodayConclusion");
    expect(fitness).toContain("<TodayTrainingDecisionCard");
    expect(triFitness).not.toContain("TodaysWorkoutCard");
  });

  it("uses shrink-safe grid tracks for the integrated mobile summary", () => {
    const integrated = read("src/components/mobile/IntegratedLoadCard.tsx");
    expect(integrated).toContain('gridTemplateColumns: "minmax(0, 1.35fr) repeat(2, minmax(0, 1fr))"');
    expect(integrated).toContain('gridTemplateColumns: "repeat(3, minmax(0, 1fr))"');
    expect(integrated).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
    expect(integrated).not.toContain("minWidth: 320");
    expect(integrated).not.toContain("minWidth: 390");
  });

  it("keeps integrated snapshot and mobile PMC history as separate roles", () => {
    const mobileFitness = read("src/components/mobile/MobileFitnessPage.tsx");
    const integrated = read("src/components/mobile/IntegratedLoadCard.tsx");
    expect(mobileFitness).toContain("IntegratedLoadCard는 현재 snapshot/기여도/포커스, PMC는 시간 추이만 담당한다.");
    expect(mobileFitness).toContain('const trendSectionTitle = sectionState.trend === "ready"');
    expect(mobileFitness).toContain("<SectionCard title={trendSectionTitle} sub={pmcSub} accentColor={pmcCtlColor}>");
    expect(integrated).not.toContain("PmcMiniChart");
    expect(integrated).not.toContain("TripleStackPMC");
  });

  it.each([
    ["ko", "오늘 계획 보기"],
    ["en", "View today's plan"],
  ])("defines a user-facing today.viewTodayPlan label for %s", (locale, expected) => {
    const resource = JSON.parse(read(`src/i18n/resources/${locale}/training.json`)) as {
      today?: { viewTodayPlan?: string };
    };

    expect(resource.today?.viewTodayPlan).toBe(expected);
    expect(resource.today?.viewTodayPlan).not.toBe("today.viewTodayPlan");
  });

  it("renders mobile PMC typography as fixed-size HTML overlays outside the SVG", () => {
    const source = read("src/components/mobile/MobileFitnessPage.tsx");
    const chart = source.slice(source.indexOf("function PmcMiniChart"), source.indexOf("function WeeklyTssBars"));
    const svg = chart.slice(chart.indexOf("<svg"), chart.indexOf("</svg>"));

    expect(chart).toContain('aspectRatio: `${W} / ${H}`');
    expect(chart).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(chart).not.toContain('preserveAspectRatio="none"');
    expect(svg).not.toContain("<text");
    expect(chart).toContain("data-pmc-axis-labels");
    expect(chart).toContain("data-pmc-tooltip");
    expect(chart).toContain('fontSize: "var(--fs-xs)"');
    expect(chart).toContain('left: `${(l.x / W) * 100}%`');
    expect(chart).toContain('role="img"');
    expect(chart).toContain("aria-label={ariaLabel}");
    expect(chart).toContain('vectorEffect="non-scaling-stroke"');
    expect(chart).toContain("PMC_FUTURE_OPACITY");
  });

  it("renders semantic PMC line samples instead of indistinguishable color blocks", () => {
    const source = read("src/components/mobile/MobileFitnessPage.tsx");
    const legend = source.slice(source.indexOf("function PmcLegendSample"), source.indexOf("function WeeklyTssBars"));
    const chart = source.slice(source.indexOf("function PmcMiniChart"), source.indexOf("function PmcLegendSample"));
    const tooltip = chart.slice(chart.indexOf("data-pmc-tooltip"));

    expect(legend).toContain("data-pmc-legend-sample");
    expect(legend).toContain("strokeDasharray={dasharray}");
    expect(source).toContain("PMC_LINE_PALETTE.atl.dasharray");
    expect(source).toContain("PMC_LINE_PALETTE.tsb.dasharray");
    expect(tooltip).toContain('data-pmc-tooltip-metric="CTL"');
    expect(tooltip).toContain('data-pmc-tooltip-metric="ATL"');
    expect(tooltip).toContain('data-pmc-tooltip-metric="TSB"');
    expect(tooltip).toContain("PMC_LINE_PALETTE.atl.dasharray");
    expect(tooltip).toContain("PMC_LINE_PALETTE.tsb.dasharray");
    expect(tooltip).toContain("<PmcLegendSample");
    expect(tooltip).toContain("{ctlLabel}");
    expect(source).toContain("ctlLabel={pmcCtlLabel}");
    expect(source).toContain("/>{pmcCtlLabel}");
    expect(source).not.toContain('background: "var(--rose)" }} />ATL');
  });

  it("uses semantic violet only for integrated weekly load and preserves discipline colors", () => {
    const source = read("src/components/mobile/MobileFitnessPage.tsx");
    const colorSetup = source.slice(source.indexOf("const ringColor"), source.indexOf("const pmcTitle"));
    const overview = source.slice(source.indexOf('{activeTab === "overview"'), source.indexOf('{activeTab === "analysis"'));

    expect(colorSetup).toContain('const weeklyLoadColor = data.discipline === "tri" ? PMC_LINE_PALETTE.ctl.color : ringColor;');
    expect(overview).toContain('<WeeklyTssBars values={data.weeklyTSS} color={weeklyLoadColor} t={t} />');
    expect(overview).not.toContain('<WeeklyTssBars values={data.weeklyTSS} color={pmcCtlColor}');
    expect(source).toContain('<PowerCurveMini points={data.powerCurve} color={ringColor}');
  });

  it("renders the mobile power curve with separate copy and fixed-size HTML axis labels", () => {
    const source = read("src/components/mobile/MobileFitnessPage.tsx");
    const chart = source.slice(source.indexOf("function PowerCurveMini"), source.indexOf("function SectionCard"));
    const svg = chart.slice(chart.indexOf("<svg"), chart.indexOf("</svg>"));

    expect(source).toContain("data-power-curve-copy");
    expect(source).toContain("data-power-curve-visual");
    expect(chart).toContain("data-power-curve-chart");
    expect(chart).toContain('aspectRatio: `${W} / ${H}`');
    expect(chart).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(chart).not.toContain('preserveAspectRatio="none"');
    expect(svg).not.toContain("<text");
    expect(chart).toContain("data-power-curve-axis-labels");
    expect(chart).toContain('fontSize: "var(--fs-xs)"');
    expect(chart).toContain('3600: "1h"');
    expect(chart).toContain("baselineY");
    expect(chart).toContain('role="img"');
    expect(chart).toContain("aria-label={ariaLabel}");
    expect(chart).toContain('maxWidth: "100%"');
    expect(chart).toContain('leftPct >= 95 ? "translateX(-100%)"');
    expect(chart).toContain("const W = 340, H = 150");
    expect(source).toContain('data-power-curve-copy style={{ marginBottom: "var(--space-2)" }}');
    expect(source).toContain('style={{ margin: "0 -16px", overflow: "hidden" }}');
    expect(source).not.toContain('margin: "0 -16px -12px"');
    expect(source).not.toContain('data-power-curve-visual\n                style={{ margin: "0 -16px -12px", padding:');
  });

  it("keeps weekly load bars static and omits the duplicated recent activity section", () => {
    const mobileFitness = read("src/components/mobile/MobileFitnessPage.tsx");
    const fitnessPage = read("src/pages/FitnessPage.tsx");
    const weeklyBars = mobileFitness.slice(
      mobileFitness.indexOf("function WeeklyTssBars"),
      mobileFitness.indexOf("function PowerCurveMini"),
    );

    expect(weeklyBars).not.toContain("<button");
    expect(weeklyBars).not.toContain("onClick");
    expect(weeklyBars).not.toContain("selectedIdx");
    expect(weeklyBars).not.toContain("title=");
    expect(weeklyBars).not.toContain("aria-label");
    expect(weeklyBars).toContain("const isCurrentWeek = i === values.length - 1");
    expect(mobileFitness).not.toContain("recentActivities");
    expect(fitnessPage).not.toContain("recentActivities");
  });
});
