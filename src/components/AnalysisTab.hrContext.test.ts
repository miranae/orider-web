import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AnalysisTab legacy HR context", () => {
  it("guards legacy activity metrics without contextSnapshot", () => {
    const source = readFileSync(join(process.cwd(), "src/components/AnalysisTab.tsx"), "utf8");
    expect(source).toContain("sm?.contextSnapshot?.maxHr");
    expect(source).toContain("sm?.hrZoneBoundaries?.referenceBpm");
    expect(source).not.toContain("sm?.contextSnapshot.maxHr");
    expect(source).not.toContain("sm?.hrZoneBoundaries.referenceBpm");
  });
});
