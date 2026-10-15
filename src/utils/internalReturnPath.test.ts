import { describe, expect, it } from "vitest";
import { goalCreatedPath, sanitizeInternalReturnPath } from "./internalReturnPath";

describe("sanitizeInternalReturnPath", () => {
  it("preserves safe localized paths with search and hash", () => {
    expect(sanitizeInternalReturnPath("/ko/group/abc?tab=rides#today")).toBe("/ko/group/abc?tab=rides#today");
  });

  it("normalizes safe dot segments while preserving query and hash", () => {
    expect(sanitizeInternalReturnPath("/ko/athlete/../coach/plan?date=2026-12-01#calendar")).toBe("/ko/coach/plan?date=2026-12-01#calendar");
  });

  it.each(["//evil.test/x", "/%2F%2Fevil.test", "/\\evil", "https://evil.test/x", "/.//evil.com/x", "/ko/..//evil.com/x", "/ko//evil.com/x"])("rejects non-internal path %s", (path) => {
    expect(sanitizeInternalReturnPath(path)).toBe("/");
  });

  it.each([
    "/onboarding",
    "/ko/onboarding?returnTo=%2Fplan",
    "/friends?source=onboarding&returnTo=%2Fplan",
    "/en/goal-setup?returnTo=%2Fonboarding",
    "/ko/athlete/me/friends?source=onboarding&returnTo=%2Fko%2F",
    "/en/coach/goals?returnTo=%2Fonboarding",
  ])("rejects onboarding handoff loop target %s", (path) => {
    expect(sanitizeInternalReturnPath(path)).toBe("/");
  });
});

describe("goal completion handoff", () => {
  it.each(["bike", "run", "swim"] as const)("keeps %s when no return route is present", sport => {
    expect(goalCreatedPath(new URLSearchParams(), sport, "new goal")).toBe(`/coach/plan?sport=${sport}&goalId=new+goal`);
  });
  it("preserves localized safe query and hash, replacing the goal identity", () => {
    const params = new URLSearchParams({ returnTo: "/en/coach/plan?sport=run&date=2026-10-20&goalId=old#calendar" });
    expect(goalCreatedPath(params, "run", "new")).toBe("/en/coach/plan?sport=run&date=2026-10-20&goalId=new#calendar");
  });
  it.each(["//external.test", "/coach/goals?returnTo=%2Fcoach%2Fgoals"])("rejects unsafe or looping return route %s", returnTo => {
    expect(goalCreatedPath(new URLSearchParams({ returnTo }), "swim", "new")).toBe("/coach/plan?sport=swim&goalId=new");
  });
  it("uses the created sport even when the original plan return route selected another sport", () => {
    expect(goalCreatedPath(new URLSearchParams({ returnTo: "/ko/coach/plan?sport=bike" }), "run", "new")).toBe("/ko/coach/plan?sport=run&goalId=new");
  });
  it("ignores returnTo for onboarding", () => {
    expect(goalCreatedPath(new URLSearchParams({ source: "onboarding", returnTo: "/athlete/me" }), "run", "g")).toBe("/coach/plan?sport=run&goalId=g");
  });
});
