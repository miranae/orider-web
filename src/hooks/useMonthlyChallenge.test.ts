import { describe, expect, it } from "vitest";
import { kstMonthWindow, monthlyChallengeParticipationWrite, monthlyChallengeProgress } from "./useMonthlyChallenge";

describe("personal monthly challenge", () => {
  it("uses Korea month boundaries and stable YYYY-MM ids", () => {
    const beforeMidnight = kstMonthWindow(Date.parse("2026-06-30T14:59:59Z"));
    const afterMidnight = kstMonthWindow(Date.parse("2026-06-30T15:00:00Z"));
    expect(beforeMidnight.monthKey).toBe("2026-06");
    expect(afterMidnight).toMatchObject({
      monthKey: "2026-07",
      startMs: Date.parse("2026-06-30T15:00:00Z"),
      endMs: Date.parse("2026-07-31T15:00:00Z"),
    });
  });

  it("normalizes progress without exceeding the progressbar range", () => {
    expect(monthlyChallengeProgress(125_000, 500)).toEqual({
      distanceKm: 125, percent: 25, remainingKm: 375, completed: false,
    });
    expect(monthlyChallengeProgress(1_200_000, 1000)).toEqual({
      distanceKm: 1200, percent: 100, remainingKm: 0, completed: true,
    });
    expect(monthlyChallengeProgress(Number.NaN, 300).distanceKm).toBe(0);
  });

  it("persists only the rules-approved tier and numeric join time", () => {
    expect(monthlyChallengeParticipationWrite(500, 1234)).toEqual({ tierKm: 500, joinedAt: 1234 });
    expect(Object.keys(monthlyChallengeParticipationWrite(1000, 1)).sort()).toEqual(["joinedAt", "tierKm"]);
  });
});
