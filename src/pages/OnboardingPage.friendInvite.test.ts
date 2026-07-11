import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("onboarding friend invite handoff", () => {
  const source = readFileSync(join(process.cwd(), "src/pages/OnboardingPage.tsx"), "utf8");

  it("keeps the persisted enum unchanged and completes before navigating", () => {
    expect(source).not.toContain('type Step = "discipline" | "strava" | "goal" | "social"');
    expect(source).toContain('await updateDoc(userRef, { onboardingStep: "done" });');
    expect(source).toContain('await finishOnboarding(`/friends?source=onboarding&returnTo=');
  });

  it("keeps existing goal setup and skip completion paths", () => {
    expect(source).toContain('finishOnboarding(`/goal-setup?returnTo=');
    expect(source).toContain("await finishOnboarding();");
  });
});
