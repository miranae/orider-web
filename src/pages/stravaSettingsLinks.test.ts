import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceFiles = [
  "src/pages/FitnessPage.tsx",
  "src/pages/DashboardPage.tsx",
];

describe("Strava empty-state settings links", () => {
  it("targets the real connections settings section", () => {
    for (const file of sourceFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source).not.toContain("/settings#integrations");
      expect(source).toContain('href: "/settings?section=connections"');
    }
  });
});
