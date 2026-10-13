import { expect, it } from "vitest";
import { coveredFixture } from "../../../services/stageCyclingDistanceCoveredRankings.fixture";
import { cyclingDistanceCoveredRankings } from "./cyclingDistanceCoveredRankings";
it("deduplicates observed progress, removes an excluded group without resurrecting its twin, restores only on fresh response", () => {
  const before = cyclingDistanceCoveredRankings(coveredFixture(), "10km", 5);
  expect(before.winner?.activityId).toBe("native"); expect(before.nextBest?.activityId).toBe("other"); expect(before.observations).toHaveLength(2);
  const excluded = cyclingDistanceCoveredRankings(coveredFixture("10km"), "10km", 10);
  expect(excluded.winner?.activityId).toBe("other"); expect(excluded.nextBest).toBeNull(); expect(excluded.observations).toHaveLength(1);
  expect(cyclingDistanceCoveredRankings(coveredFixture("10km"), "20km", 5).winner?.activityId).toBe("native");
  expect(cyclingDistanceCoveredRankings(coveredFixture(), "10km", 10).winner?.activityId).toBe("native");
});

it("keeps missing and excluded observations out of progress without substituting a twin", () => {
  const response = coveredFixture("10km");
  for (const row of response.rows) {
    const e = row.efforts.find(e => e.target === "10km")!;
    if (row.activityId === "other") { e.originalElapsedSec = null; e.effectiveElapsedSec = null; e.basis = "unavailable"; e.effortSourceActivityId = null; }
  }
  const target = response.targets.find(t => t.target === "10km")!;
  target.top10 = []; target.winner = null; target.nextBest = null;
  expect(cyclingDistanceCoveredRankings(response, "10km", 5).observations).toEqual([]);
});
