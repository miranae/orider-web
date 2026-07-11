import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile architecture r4", () => {
  it("keeps groups discoverable through the shared five-hub mobile navigation", () => {
    const tabBar = read("src/components/mobile/MobileTabBar.tsx");
    const hubs = read("src/config/navHubs.ts");

    expect(tabBar).toContain("HUBS.map");
    expect(hubs).toContain('key: "community"');
    expect(hubs).toContain('{ labelKey: "nav.groups", to: "/groups" }');
  });

  it("treats coarse pointer landscape phones as mobile", () => {
    const hook = read("src/hooks/useMobile.ts");

    expect(hook).toContain("(pointer: coarse)");
    expect(hook).toContain("matchesMobile");
  });

  it("wraps wide event tables and collapses result optional columns on mobile", () => {
    const detail = read("src/pages/event/EventDetailPage.tsx");
    const results = read("src/pages/event/EventResultsPage.tsx");

    expect(detail).toContain('overflowX: "auto"');
    expect(detail).toContain("minWidth: 560");
    expect(results).toContain("event-results-optional");
    expect(results).toContain("event-results-table");
  });

  it("provides mobile-safe post editing and table picker pointer preview", () => {
    const post = read("src/pages/CreatePostPage.tsx");

    expect(post).toContain("plainTextToHtml");
    expect(post).toContain("mobilePlainText");
    expect(post).toContain("<textarea");
    expect(post).toContain("onPointerEnter");
    expect(post).toContain("onPointerDown");
    expect(post).toContain("contentEditable={!isMobile}");
  });

  it("keeps mobile plan derived state in a shared view model", () => {
    const plan = read("src/pages/PlanPage.tsx");

    expect(plan).toContain("mobilePlanViewModel");
    expect(plan).not.toContain("const mobileWeek = weeks[mobileWeekIdx]");
  });
});
