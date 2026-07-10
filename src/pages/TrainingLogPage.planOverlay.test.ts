import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("TrainingLogPage plan overlay", () => {
  it("loads active plan days and passes them into calendar day cells", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/TrainingLogPage.tsx"), "utf8");

    expect(source).toContain("PlanGhost");
    expect(source).toContain('where("status", "==", "active")');
    expect(source).toContain('collection(firestore, "goals", goalId, "plan")');
    expect(source).toContain("setPlanByMonth(next)");
    expect(source).toContain("plans={plans}");
    expect(source).toContain('border: `1px dashed ${color}`');
    expect(source).toContain("actualTSS >= plannedTSS * 0.8");
  });
});
