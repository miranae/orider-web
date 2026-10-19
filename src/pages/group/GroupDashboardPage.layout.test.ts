import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("GroupDashboardPage KPI layout", () => {

  it("renders group rules as React text without an HTML injection path", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/group/GroupDashboardPage.tsx"), "utf8");

    expect(source).toContain('{t("dashboard.rules.title")}');
    expect(source).toContain("{group.rules}");
    expect(source).toContain('whiteSpace: "pre-wrap"');
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
