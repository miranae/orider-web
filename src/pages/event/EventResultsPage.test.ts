import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { displayRankFor, shouldShowResultsGroupCta, type ResultEntry } from "./EventResultsPage";
import { isVerifiedEventFinisher } from "../../features/event/resultVerification";

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

describe("event result contract", () => {
  it("preserves v1 FINISHED ranking even without a verification flag", () => {
    expect(isVerifiedEventFinisher(undefined, "FINISHED", undefined, null, null)).toBe(true);
  });

  it("does not count six unverified v2 FINISHED participants", () => {
    const finished = Array.from({ length: 6 }, () =>
      isVerifiedEventFinisher(2, "FINISHED", false, 120_000, 100_000));
    expect(finished.filter(Boolean)).toHaveLength(0);
  });

  it("requires an explicit proof and a valid timestamp at or after the start", () => {
    expect(isVerifiedEventFinisher(2, "FINISHED", true, 120_000, 100_000)).toBe(true);
    expect(isVerifiedEventFinisher(2, "FINISHED", true, 90_000, 100_000)).toBe(false);
    expect(isVerifiedEventFinisher(2, "FINISHED", true, Number.NaN, 100_000)).toBe(false);
    expect(isVerifiedEventFinisher(2, "DNF", true, 120_000, 100_000)).toBe(false);
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
