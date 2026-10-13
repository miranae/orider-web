import { expect, it } from "vitest";
import { historyCandidate, historyCompute, historyComputed } from "../../../services/stagePowerDurationHistory.testFixture";
import { reducePowerHistory } from "./stagePowerHistoryReducer";
it("keeps W and W/kg winners independent and separates unknown origins", () => {
  const a = historyComputed(historyCandidate("a"), 300, 100), b = historyComputed(historyCandidate("b"), 280, 50), c = historyComputed({ ...historyCandidate("c"), sourcePowerOrigin: "stored_native_watts_unverified" }, 1000, 25);
  const periods = reducePowerHistory([historyCompute([a, b]), historyCompute([c])]);
  expect(periods[0]!.origins[0]!.winner?.activityId).toBe("a"); expect(periods[0]!.origins[0]!.weightNormalized.winner?.activityId).toBe("b");
  expect(periods[0]!.origins[1]!.winner?.activityId).toBe("c"); expect(periods[0]!.origins[0]!.computedPhysicalCandidateCount).toBe(2);
});
it("deduplicates only explicit identities across pages without rounded watts deciding the winner", () => {
  const a = historyComputed(historyCandidate("z"), Number.MAX_SAFE_INTEGER, 80), b = historyComputed(historyCandidate("a"), Number.MAX_SAFE_INTEGER, 80);
  b.comparison!.energyWattMilliseconds = (BigInt(a.comparison!.energyWattMilliseconds) - 1n).toString();
  const output = reducePowerHistory([historyCompute([b]), historyCompute([a]), historyCompute([a])]);
  expect(output[0]!.origins[0]!.winner?.activityId).toBe("z"); expect(output[0]!.origins[0]!.inspectedActivityCount).toBe(2);
  a.physicalIdentity.localSessionId = "one"; b.physicalIdentity.localSessionId = "one";
  expect(reducePowerHistory([historyCompute([a, b])])[0]!.origins[0]!.physicalCandidateCount).toBe(1);
});
it("treats zero as available, missing weight as unavailable and rejects mixed snapshots", () => {
  const a = historyComputed(historyCandidate("a"), 0, null), page = historyCompute([a]);
  const row = reducePowerHistory([page])[0]!.origins[0]!; expect(row.winner?.result?.maxAveragePowerW).toBe(0); expect(row.weightNormalized.winner).toBeNull();
  const changed = structuredClone(page); changed.session.requestBinding = "b".repeat(64);
  expect(() => reducePowerHistory([page, changed])).toThrow("history_context_changed");
  const raced = structuredClone(page); raced.candidates[0]!.candidateBinding = "b".repeat(64);
  expect(() => reducePowerHistory([page, raced])).toThrow("history_source_changed");
});
it("matches the actual compiled backend exact reducer oracle including origin and snapshot-weight winners", async () => {
  const { default: actual } = await import("../../../services/stagePowerDurationHistory.actual.fixture.json");
  for (const item of [actual.separateOriginsAndWeight, actual.missingWeight]) {
    const response = item.response as unknown as Parameters<typeof reducePowerHistory>[0][number];
    expect(reducePowerHistory([response])).toEqual(item.reduced.periods);
  }
});
