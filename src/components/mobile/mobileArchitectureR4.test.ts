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

    expect(tabBar).toContain("PRIMARY_HUBS.map");
    expect(hubs).toContain('key: "club"');
    expect(hubs).toContain('labelKey: "nav.clubs"');
    expect(hubs).toContain('to: "/clubs"');
  });

  it("treats coarse pointer landscape phones as mobile", () => {
    const hook = read("src/hooks/useMobile.ts");

    expect(hook).toContain("(pointer: coarse)");
    expect(hook).toContain("matchesMobile");
  });

  it("keeps wide event tables scrollable without hiding result columns on mobile", () => {
    const detail = read("src/pages/event/EventDetailPage.tsx");
    const results = read("src/pages/event/EventResultsPage.tsx");
    const linkedPagesCss = read("src/features/event/detail/event-linked-pages.css");

    expect(detail).toContain('overflowX: "auto"');
    expect(detail).toContain("minWidth: 560");
    const scrollRegion = results.match(/<div\b[^>]*className="event-results-table-scroll"[^>]*>/)?.[0];
    expect(scrollRegion).toBeDefined();
    expect(scrollRegion).toContain('role="region"');
    expect(scrollRegion).toContain('aria-label={t("label.allResults")}');
    expect(scrollRegion).toContain('aria-describedby="event-results-scroll-hint"');
    expect(scrollRegion).toContain("tabIndex={0}");
    expect(scrollRegion).toContain('overflowX: "auto"');
    expect(results).toMatch(/<table\b[^>]*className="event-results-table"[^>]*minWidth: 760/);
    expect(results).not.toContain("event-results-optional");
    expect(linkedPagesCss).toContain(".event-results-table-scroll:focus-visible");
    expect(linkedPagesCss).not.toMatch(/\.event-results-(?:optional|table)\b[^}]*display:\s*none/);
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
