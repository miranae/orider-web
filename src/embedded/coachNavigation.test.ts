import { describe, expect, it } from "vitest";
import { embeddedCoachDestination } from "./coachNavigation";

describe("authorized coach navigation", () => {
  it.each(["ko", "en"])("keeps %s coach destinations inside the existing app session", lang => {
    expect(embeddedCoachDestination(`/${lang}/embed/fitness`, `/${lang}/coach/plan?sport=run&date=2026-10-29#plan-load-comparison`))
      .toBe(`/${lang}/embed/fitness?sport=run&date=2026-10-29&page=plan#plan-load-comparison`);
    expect(embeddedCoachDestination(`/${lang}/embed/plan`, "/coach/analysis?sport=bike&range=90"))
      .toBe(`/${lang}/embed/plan?sport=bike&range=90&page=analysis`);
  });
  it("keeps the goal return path and creation parameters", () => {
    const destination = embeddedCoachDestination("/ko/embed/plan", "/goal-setup?sport=run&new=1&returnTo=%2Fcoach%2Fplan%3Fsport%3Drun");
    const params = new URL(destination!, "https://local.invalid").searchParams;
    expect(params.get("page")).toBe("goals");
    expect(params.get("returnTo")).toBe("/coach/plan?sport=run");
  });
  it("leaves ordinary web, native activity and external destinations to their existing owners", () => {
    expect(embeddedCoachDestination("/ko/coach/plan", "/coach/analysis")).toBeNull();
    expect(embeddedCoachDestination("/ko/embed/plan", "/activity/owner-record")).toBeNull();
    expect(embeddedCoachDestination("/ko/embed/plan", "https://other.invalid/coach/analysis")).toBeNull();
  });
});
