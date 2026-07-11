import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { displayRankFor, shouldShowResultsGroupCta, type ResultEntry } from "./EventResultsPage";

function entry(rank: number, overallRank: number): ResultEntry {
  return {
    userId: `u-${rank}-${overallRank}`,
    displayName: "Rider",
    bibNumber: null,
    category: "A",
    rank,
    overallRank,
    finishTime: 1,
    status: "FINISHED",
  };
}

describe("EventResultsPage podium rank", () => {
  it("uses overallRank for overall podium", () => {
    expect(displayRankFor(entry(4, 3), "__overall__")).toBe(3);
  });

  it("uses category rank for category podium", () => {
    expect(displayRankFor(entry(1, 3), "B")).toBe(1);
  });
});

describe("EventResultsPage group CTA", () => {
  it("shows only the active event group's completed successful snapshot", () => {
    expect(shouldShowResultsGroupCta("group-1", "group-1", false, false, false)).toBe(true);
    expect(shouldShowResultsGroupCta("group-1", "group-1", true, false, false)).toBe(false);
    expect(shouldShowResultsGroupCta("group-1", "group-old", false, false, false)).toBe(false);
    expect(shouldShowResultsGroupCta("group-1", undefined, false, false, false)).toBe(false);
    expect(shouldShowResultsGroupCta("group-1", "group-1", false, true, false)).toBe(false);
    expect(shouldShowResultsGroupCta("group-1", "group-1", false, false, true)).toBe(false);
  });

  it("observes host group snapshot failures", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/event/EventResultsPage.tsx"), "utf8");
    expect(source).toContain('logClientError("EventResultsPage.loadHostGroup", groupError');
  });
});
