import { describe, expect, it } from "vitest";
import { displayRankForCategory, OVERALL_CATEGORY, podiumForCategory } from "./eventResultsRanking";

const entry = (id: string, rank: number, overallRank: number) => ({
  userId: id,
  status: "FINISHED",
  rank,
  overallRank,
});

describe("event results ranking", () => {
  it("overall podium uses overallRank instead of category rank", () => {
    const results = [
      entry("a1", 1, 1),
      entry("a2", 2, 2),
      entry("b1", 1, 3),
      entry("c1", 1, 4),
    ];

    expect(podiumForCategory(results, OVERALL_CATEGORY).map((r) => r.userId))
      .toEqual(["a1", "a2", "b1"]);
    expect(podiumForCategory(results, OVERALL_CATEGORY).map((r) => displayRankForCategory(r, OVERALL_CATEGORY)))
      .toEqual([1, 2, 3]);
  });

  it("category podium still uses category rank", () => {
    const results = [
      entry("a1", 1, 1),
      entry("a2", 2, 2),
      entry("a3", 3, 4),
      entry("a4", 4, 5),
    ];

    expect(podiumForCategory(results, "elite").map((r) => r.userId))
      .toEqual(["a1", "a2", "a3"]);
  });

  it("does not include unfinished results", () => {
    const results = [
      entry("a1", 1, 1),
      { userId: "dnf", status: "DNF", rank: 2, overallRank: 2 },
      entry("a2", 2, 3),
    ];

    expect(podiumForCategory(results, OVERALL_CATEGORY).map((r) => r.userId))
      .toEqual(["a1", "a2"]);
  });
});
