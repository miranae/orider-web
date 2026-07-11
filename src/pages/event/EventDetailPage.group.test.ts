import { describe, expect, it } from "vitest";
import { shouldShowHostGroupCard } from "./EventDetailPage";

describe("event host group card", () => {
  it("shows only the active event group's completed successful snapshot", () => {
    expect(shouldShowHostGroupCard("group-1", "group-1", false, false, false)).toBe(true);
    expect(shouldShowHostGroupCard("group-1", "group-1", true, false, false)).toBe(false);
    expect(shouldShowHostGroupCard("group-1", "group-old", false, false, false)).toBe(false);
    expect(shouldShowHostGroupCard("group-1", undefined, false, false, false)).toBe(false);
    expect(shouldShowHostGroupCard("group-1", "group-1", false, true, false)).toBe(false);
    expect(shouldShowHostGroupCard("group-1", "group-1", false, false, true)).toBe(false);
  });
});
