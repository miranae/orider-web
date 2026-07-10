import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readPageSource(fileName: string) {
  return readFileSync(join(process.cwd(), "src/pages", fileName), "utf8");
}

describe("weekly calendar overflow", () => {
  it("keeps PlanPage week cells scrollable instead of compressing seven day columns", () => {
    const source = readPageSource("PlanPage.tsx");

    expect(source).toContain("PLAN_WEEK_GRID_COLUMNS = '80px repeat(7, minmax(72px, 1fr)) 100px'");
    expect(source).toContain("overflowX: 'auto'");
    expect(source).not.toContain("80px repeat(7, 1fr) 100px");
  });

  it("keeps TrainingLogPage month cells scrollable instead of compressing seven day columns", () => {
    const source = readPageSource("TrainingLogPage.tsx");

    expect(source).toContain('LOG_WEEK_GRID_COLUMNS = "repeat(7, minmax(72px, 1fr)) 60px"');
    expect(source).toContain('overflowX: "auto"');
    expect(source).not.toContain("repeat(7, 1fr) 60px");
  });
});
