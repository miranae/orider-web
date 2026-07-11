import { describe, expect, it } from "vitest";
import { sanitizeInternalReturnPath } from "./internalReturnPath";

describe("sanitizeInternalReturnPath", () => {
  it("preserves safe localized paths with search and hash", () => {
    expect(sanitizeInternalReturnPath("/ko/group/abc?tab=rides#today")).toBe("/ko/group/abc?tab=rides#today");
  });

  it.each(["//evil.test/x", "/%2F%2Fevil.test", "/\\evil", "https://evil.test/x"])("rejects non-internal path %s", (path) => {
    expect(sanitizeInternalReturnPath(path)).toBe("/");
  });

  it.each([
    "/onboarding",
    "/ko/onboarding?returnTo=%2Fplan",
    "/friends?source=onboarding&returnTo=%2Fplan",
    "/en/goal-setup?returnTo=%2Fonboarding",
  ])("rejects onboarding handoff loop target %s", (path) => {
    expect(sanitizeInternalReturnPath(path)).toBe("/");
  });
});
