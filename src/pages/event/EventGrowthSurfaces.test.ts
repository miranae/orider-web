import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(join(process.cwd(), "src/pages/event", name), "utf8");

describe("event growth contract surfaces", () => {
  it("shows the TTL-filtered viewer count on the organizer dashboard", () => {
    const source = read("EventDashboardPage.tsx");
    expect(source).toContain("countActiveViewers");
    expect(source).toContain('t("viewer.count", { count: viewerCount })');
  });

  it("shows app install links only to resolved signed-out live viewers", () => {
    const source = read("EventLivePage.tsx");
    expect(source).toContain("!authLoading && !user");
    expect(source).toContain("<AppInstallLinks");
    expect(source).toContain('t("liveView.guestCta.title")');
  });
});
