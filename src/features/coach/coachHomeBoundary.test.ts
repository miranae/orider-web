import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI Coach P0 home-only boundary", () => {
  it("mounts the launcher only in desktop and mobile home surfaces", () => {
    const dashboard = readFileSync("src/pages/DashboardPage.tsx", "utf8");
    const mobileHome = readFileSync("src/components/mobile/MobileFeedPage.tsx", "utf8");
    expect(dashboard).toContain("<CoachQuestionLauncher");
    expect(mobileHome).toContain("<CoachQuestionLauncher");
  });

  it.each([
    "src/pages/PlanPage.tsx",
    "src/components/mobile/MobileFitnessPage.tsx",
    "src/pages/fitness/TriFitnessView.tsx",
    "src/components/training/TodaysWorkoutCard.tsx",
  ])("does not leak the launcher into %s", (path) => {
    expect(readFileSync(path, "utf8")).not.toContain("CoachQuestionLauncher");
  });

  it("keeps the mobile composer visible without changing the desktop dock", () => {
    const css = readFileSync("src/features/coach/coach-question.css", "utf8");
    expect(css).toMatch(/\.coach-sheet__dock\s*{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/s);
    expect(css).toMatch(/\.coach-sheet__dock\s*{[^}]*env\(safe-area-inset-bottom\)/s);
    expect(css).toMatch(/@media \(min-width:\s*768px\)[\s\S]*\.coach-sheet__dock\s*{\s*position:\s*static;/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
