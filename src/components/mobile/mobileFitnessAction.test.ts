import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile fitness action", () => {
  it("orders workout, consistency, and KPI cards at the top of the overview", () => {
    const source = read("src/components/mobile/MobileFitnessPage.tsx");
    const overview = source.slice(source.indexOf('{tab === "overview"'));
    const workoutIndex = overview.indexOf('<TodaysWorkoutCard variant="compact" />');
    const consistencyIndex = overview.indexOf('<ConsistencyStreakCard summary={consistencyStreak} compact />');
    const metricsIndex = overview.indexOf("{kpiItems.map");
    const analysisIndex = overview.indexOf('{tab === "analysis"');

    expect(workoutIndex).toBeGreaterThan(-1);
    expect(consistencyIndex).toBeGreaterThan(-1);
    expect(metricsIndex).toBeGreaterThan(-1);
    expect(workoutIndex).toBeLessThan(consistencyIndex);
    expect(consistencyIndex).toBeLessThan(metricsIndex);
    expect(workoutIndex).toBeLessThan(analysisIndex);
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
});
