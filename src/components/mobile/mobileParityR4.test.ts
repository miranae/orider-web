import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile parity r4", () => {
  it("keeps mobile feed filter, search, and date controls reachable", () => {
    const mobileFeed = read("src/components/mobile/MobileFeedPage.tsx");
    const dashboard = read("src/pages/DashboardPage.tsx");

    expect(mobileFeed).toContain("feedScope");
    expect(mobileFeed).toContain("searchQuery");
    expect(mobileFeed).toContain("datePreset");
    expect(mobileFeed).toContain('aria-label={t("feed.filter.label")}');
    expect(mobileFeed).toContain('gridTemplateColumns: "repeat(2, minmax(0, 1fr))"');
    expect(mobileFeed).not.toContain('role="tablist"');
    expect(mobileFeed).not.toContain("WeekBars");
    expect(mobileFeed).not.toContain("recentWeeks");
    expect(dashboard).toContain("const sportFiltered = useMemo");
    expect(dashboard).toContain("<MobileFeedPage\n        activities={activities}");
    expect(dashboard).not.toContain("recentWeeks={weeklyStats.map");
    expect(dashboard).toContain("friendIds={[...friendIds]}");
  });

  it("keeps mobile plan context and core controls reachable", () => {
    const mobilePlan = read("src/components/mobile/MobilePlanPage.tsx");
    const planPage = read("src/pages/PlanPage.tsx");

    expect(mobilePlan).toContain("goalTitle");
    expect(mobilePlan).toContain("onIcsExport");
    expect(mobilePlan).toContain("onReroll");
    expect(mobilePlan).toContain("onAbandon");
    expect(planPage).toContain("exportPlanIcs");
    expect(planPage).toContain("rerollPlan");
  });

  it("keeps mobile log month-scoped activity paging and monthly totals", () => {
    const mobileLog = read("src/components/mobile/MobileLogPage.tsx");

    expect(mobileLog).toContain("loading?: boolean");
    expect(mobileLog).toContain("MobileLogSkeleton");
    expect(mobileLog).toContain("activityLimit");
    expect(mobileLog).toContain("const recentActs = [...monthActs]");
    expect(mobileLog).toContain("monthTotals");
  });

  it("keeps dead mobile-only summaries and non-persistent notification controls out of the settings hub", () => {
    const settings = read("src/components/mobile/MobileSettingsPage.tsx");

    expect(() => read("src/components/mobile/WeeklySummaryCard.tsx")).toThrow();
    expect(settings).not.toContain("useState");
    expect(settings).not.toContain("role=\"switch\"");
    expect(settings).not.toContain("notifications.preparing");
    expect(settings).toContain("NAV_GROUPS.map");
  });

  it("does not hard-cap mobile fitness PMC to 60 days or recent activities to 5", () => {
    const fitness = read("src/pages/FitnessPage.tsx");

    expect(fitness).toContain("const pmcHistory = rangeData.fitness.map");
    expect(fitness).toContain(".slice(0, 10)");
    expect(fitness).not.toContain("rangeData.fitness.slice(-60)");
    expect(fitness).not.toContain(".slice(0, 5)");
  });
});
