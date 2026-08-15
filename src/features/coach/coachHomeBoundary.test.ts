import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI Coach entry-surface boundary", () => {
  it("keeps the launcher on the Coach entry page and removes it from home", () => {
    const dashboard = readFileSync("src/pages/DashboardPage.tsx", "utf8");
    const mobileHome = readFileSync("src/components/mobile/MobileFeedPage.tsx", "utf8");
    const coachPage = readFileSync("src/pages/CoachHistoryPage.tsx", "utf8");
    expect(dashboard).not.toContain("CoachQuestionLauncher");
    expect(mobileHome).not.toContain("CoachQuestionLauncher");
    expect(coachPage).toContain("<CoachQuestionLauncher");
  });

  it.each([
    "src/pages/PlanPage.tsx",
    "src/components/mobile/MobileFitnessPage.tsx",
    "src/pages/fitness/TriFitnessView.tsx",
    "src/components/training/TodaysWorkoutCard.tsx",
  ])("does not leak the launcher into %s", (path) => {
    expect(readFileSync(path, "utf8")).not.toContain("CoachQuestionLauncher");
  });

  it("keeps the composer dock visible while only the sheet content scrolls", () => {
    const css = readFileSync("src/features/coach/coach-question.css", "utf8");
    expect(css).toMatch(/\.coach-sheet__panel\s*{[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.coach-sheet__content\s*{[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/\.coach-sheet__dock\s*{[^}]*flex-shrink:\s*0;/s);
    expect(css).toMatch(/\.coach-sheet__dock\s*{[^}]*env\(safe-area-inset-bottom\)/s);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps coach content clear of sticky actions and mobile navigation", () => {
    const consent = readFileSync("src/features/coach/coach-consent.css", "utf8");
    const history = readFileSync("src/features/coach/coach-history.css", "utf8");
    const launcher = readFileSync("src/features/coach/coach-question.css", "utf8");
    expect(consent).toMatch(/\.coach-consent-sheet__body\s*{[^}]*padding-block-end:\s*calc\(var\(--space-8\) \+ var\(--space-8\)\)/s);
    expect(history).toMatch(/\.coach-history-page\s*{[^}]*padding-block-end:/s);
    expect(history).toMatch(/\.coach-thread-composer\s*{[^}]*inset-block-end:[^}]*safe-area-inset-bottom/s);
    expect(history).toMatch(/\.coach-thread-turns\s*{[^}]*padding-block-end:\s*calc\(var\(--space-8\) \* 3\)/s);
    expect(history).toMatch(/\.coach-history-page\.has-selection \.coach-history-page__header\s*{[^}]*display:\s*none/);
    expect(history).toMatch(/\.coach-thread-composer__meta > :last-child\s*{[^}]*white-space:\s*nowrap/);
    expect(launcher).toMatch(/\.coach-sheet__suggestion-copy \.ds-text--body-small\s*{[^}]*-webkit-line-clamp:\s*2;/s);
  });
});
