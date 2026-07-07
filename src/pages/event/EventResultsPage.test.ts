import { describe, expect, it } from "vitest";
import { displayRankFor, type ResultEntry } from "./EventResultsPage";

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

