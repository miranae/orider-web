import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("GroupDashboardPage KPI layout", () => {
  it("uses responsive KPI columns instead of a fixed five-column grid", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/group/GroupDashboardPage.tsx"), "utf8");

    expect(source).toContain("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5");
    expect(source).not.toContain('gridTemplateColumns: "repeat(5, 1fr)"');
  });

  it("renders group rules as React text without an HTML injection path", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/group/GroupDashboardPage.tsx"), "utf8");

    expect(source).toContain('{t("dashboard.rules.title")}');
    expect(source).toContain("{group.rules}");
    expect(source).toContain('whiteSpace: "pre-wrap"');
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("shows the composer only to active members and routes RSVP actions by registration state", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/group/GroupDashboardPage.tsx"), "utf8");

    expect(source).toContain("currentMemberRole !== null &&");
    expect(source).toContain('e.myRsvp ? `/event/${e.id}` : `/event/${e.id}/register`');
    expect(source).toContain('dashboard.eventAction.manageRsvp');
    expect(source).toContain('dashboard.eventAction.rsvp');
  });
});
