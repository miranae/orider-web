import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile fitness action", () => {
  it("orders today's workout before core status, load, and sport analysis", () => {
    const source = read("src/components/mobile/MobileFitnessPage.tsx");
    const overview = source.slice(source.indexOf('{activeTab === "overview"'));
    const workoutIndex = overview.indexOf("<TodaysWorkoutCard />");
    const coreIndex = overview.indexOf("<BikeAbilityCompact");
    const loadIndex = overview.indexOf("<IntegratedLoadCard");
    const sportIndex = overview.indexOf("<SportPerformanceCard");
    const analysisIndex = overview.indexOf('{activeTab === "analysis"');

    expect(workoutIndex).toBeGreaterThan(-1);
    expect(overview).not.toContain('<TodaysWorkoutCard variant="compact" />');
    expect(coreIndex).toBeGreaterThan(-1);
    expect(loadIndex).toBeGreaterThan(-1);
    expect(overview).toContain('data.discipline === "tri" && data.combinedLoad');
    expect(sportIndex).toBeGreaterThan(-1);
    expect(workoutIndex).toBeLessThan(coreIndex);
    expect(coreIndex).toBeLessThan(loadIndex);
    expect(loadIndex).toBeLessThan(sportIndex);
    expect(workoutIndex).toBeLessThan(analysisIndex);
    expect(overview).not.toContain("{kpiItems.map");
    expect(overview).toContain("<BikeAbilityCompact");
  });

  it("uses the full AI coach on mobile home and keeps the plan card compact", () => {
    const mobileHome = read("src/components/mobile/MobileFeedPage.tsx");
    const plan = read("src/pages/PlanPage.tsx");

    expect(mobileHome).toContain("<TodaysWorkoutCard />");
    expect(mobileHome).not.toContain('<TodaysWorkoutCard variant="compact" />');
    expect(plan).toContain('<TodaysWorkoutCard variant="compact" />');
  });

  it("uses the full AI coach across desktop fitness, including integrated and empty states", () => {
    const fitness = read("src/pages/FitnessPage.tsx");
    const triFitness = read("src/pages/fitness/TriFitnessView.tsx");
    expect(fitness).toContain("<TodaysWorkoutCard />");
    expect(fitness).not.toContain('<TodaysWorkoutCard variant="compact" />');
    expect(triFitness).toContain("<TodaysWorkoutCard />");
  });

  it.each([
    ["ko", "운동 계획 열기"],
    ["en", "Open workout plan"],
  ])("defines a user-facing today.start label for %s", (locale, expected) => {
    const resource = JSON.parse(read(`src/i18n/resources/${locale}/training.json`)) as {
      today?: { start?: string };
    };

    expect(resource.today?.start).toBe(expected);
    expect(resource.today?.start).not.toBe("today.start");
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
