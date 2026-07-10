import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("GroupDashboardPage KPI layout", () => {
  it("uses responsive KPI columns instead of a fixed five-column grid", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/group/GroupDashboardPage.tsx"), "utf8");

    expect(source).toContain("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5");
    expect(source).not.toContain('gridTemplateColumns: "repeat(5, 1fr)"');
  });
});
