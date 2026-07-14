import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("consistency streak card placement", () => {
  it("wires the streak summary into dashboard and fitness surfaces", () => {
    expect(read("src/pages/DashboardPage.tsx")).toContain("useConsistencyStreak");
    expect(read("src/pages/DashboardPage.tsx")).toContain("ConsistencyStreakCard");
    expect(read("src/pages/FitnessPage.tsx")).toContain("useConsistencyStreak");
    expect(read("src/pages/FitnessPage.tsx")).toContain("ConsistencyStreakCard");
  });

  it("passes the streak summary through mobile dashboard and fitness pages", () => {
    expect(read("src/components/mobile/MobileFeedPage.tsx")).toContain("consistencyStreak");
    const mobileFitness = read("src/components/mobile/MobileFitnessPage.tsx");
    expect(mobileFitness).toContain("consistencyStreak");
    expect(mobileFitness).toContain('data.discipline !== "tri" && consistencyStreak');
  });
});
