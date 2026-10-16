import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("consistency streak card placement", () => {
  it("keeps streak summaries in fitness without subscribing from the home dashboard", () => {
    expect(read("src/pages/DashboardPage.tsx")).not.toContain("useConsistencyStreak");
    expect(read("src/pages/DashboardPage.tsx")).not.toContain("ConsistencyStreakCard");
    expect(read("src/hooks/useFitnessModel.ts")).toContain("useConsistencyStreak");
    expect(read("src/pages/FitnessPage.tsx")).toContain("ConsistencyStreakCard");
  });

  it("keeps mobile fitness streaks without a home feed routine", () => {
    expect(read("src/components/mobile/MobileFeedPage.tsx")).not.toContain("consistencyStreak");
    const mobileFitness = read("src/components/mobile/MobileFitnessPage.tsx");
    expect(mobileFitness).toContain("consistencyStreak");
    expect(mobileFitness).toContain('data.discipline !== "tri" && consistencyStreak');
  });
});
