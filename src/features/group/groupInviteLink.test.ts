import { describe, expect, it } from "vitest";
import { buildGroupInvitePath, buildGroupInviteUrl, normalizeGroupInviteCode } from "./groupInviteLink";

describe("groupInviteLink", () => {
  it("normalizes invite codes for deep links", () => {
    expect(normalizeGroupInviteCode(" abcd1234 ")).toBe("ABCD1234");
  });

  it("builds localized group join links", () => {
    expect(buildGroupInvitePath("abcd1234", "ko-KR")).toBe("/ko/group/join/ABCD1234");
    expect(buildGroupInviteUrl("xy z", "en-US", "https://orider.example")).toBe("https://orider.example/en/group/join/XY%20Z");
  });
});
