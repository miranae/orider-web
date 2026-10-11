import { describe, expect, it } from "vitest";
import { runningPeriodFixture } from "../services/trainingAnalysisPeriods.fixture";
import { historyRow, historyPage } from "../services/trainingAnalysisHistory.fixture";
import { annualRunHistory, annualDistanceLeaders } from "../features/activity/detail/annualRunHistory";
import { expandedPeriodFixture } from "./expandedRunDistances.fixture";
import { expandedAnnualCoverage, validExpandedDistanceAnalysis, validExpandedDistanceRecords } from "./expandedRunDistances";
describe("expanded distance opt-in evidence", () => {
  it("validates all14 exact targets, source attribution, N and medians without changing old5", () => {
    const period = runningPeriodFixture().periods[0]!, data = expandedPeriodFixture(period);
    expect(validExpandedDistanceAnalysis(data, period)).toBe(true);
    const old = JSON.stringify(period.running!.bestDistances);
    expect(data.distances.find(row => row.distance === "half_mile")!.distanceM).toBe(804.672);
    expect(JSON.stringify(period.running!.bestDistances)).toBe(old);
  });
  it.each(["duplicate", "hole", "meters", "N", "median", "foreign", "revision", "truncated", "count"])("rejects inconsistent %s", fault => {
    const period = runningPeriodFixture().periods[0]!, data = expandedPeriodFixture(period), row = data.distances[0]!;
    if (fault === "duplicate") data.distances[1]!.distance = "400m";
    if (fault === "hole") data.distances.pop();
    if (fault === "meters") data.distances[1]!.distanceM = 800;
    if (fault === "N") row.observedEffortActivityCount++;
    if (fault === "median") row.medianTimeSeconds = 91;
    if (fault === "foreign") row.sources[0]!.sourceActivityId = "foreign";
    if (fault === "revision") row.sources[0]!.metricsRevision = "opaque";
    if (fault === "truncated") row.truncated = true;
    if (fault === "count") row.unavailableActivityCount++;
    expect(validExpandedDistanceAnalysis(data, period)).toBe(false);
  });
  it("distinguishes v2 short/no-effort from legacy unsupported and unavailable", () => {
    const base = { version: 1, targetsVersion: 2, timingBasis: "elapsed_including_stops", state: "observed", points: [{ distance: "400m", elapsedSec: 90 }] };
    expect(validExpandedDistanceRecords(base, true)).toBe(true);
    expect(validExpandedDistanceRecords(base, false)).toBe(false);
    expect(validExpandedDistanceRecords({ ...base, points: [{ distance: "400m", elapsedSec: 90.5 }] }, true)).toBe(false);
    for (const state of ["no_observed_efforts", "legacy_unsupported", "unavailable"]) expect(validExpandedDistanceRecords({ ...base, state, points: [] }, true)).toBe(true);
  });
  it("counts support only after existing physical representative dedup and preserves legacy leaders", () => {
    const a = historyRow("a"), b = historyRow("b", 1), c = historyRow("c", 2);
    a.representativeInput.localSessionId = b.representativeInput.localSessionId = "same";
    a.expandedDistanceRecords = { version: 1, targetsVersion: 2, timingBasis: "elapsed_including_stops", state: "observed", points: [{ distance: "400m", elapsedSec: 90 }] };
    b.expandedDistanceRecords = { ...a.expandedDistanceRecords, state: "no_observed_efforts", points: [] };
    const result = annualRunHistory([historyPage([a, b, c])]);
    expect(result.representatives).toHaveLength(2);
    const coverage = expandedAnnualCoverage(result.representatives, "400m");
    expect(coverage.candidate).toBe(2); expect(coverage.unsupported).toBe(1);
    expect(coverage.supported).toBe(1); expect(coverage.observed + coverage.noObserved).toBe(1);
    expect(annualDistanceLeaders([a], "5km")[0]!.elapsedSec).toBe(1200);
    expect(annualDistanceLeaders([a], "400m")[0]!.elapsedSec).toBe(90);
  });
});

it("uses existing global representatives across5000 candidates before expanded coverage/top10", () => {
  const rows = Array.from({ length: 5000 }, (_, index) => {
    const row = historyRow(`row-${String(index).padStart(4, "0")}`, index);
    row.representativeInput.localSessionId = `physical-${Math.floor(index / 2)}`;
    row.expandedDistanceRecords = { version: 1, targetsVersion: 2, timingBasis: "elapsed_including_stops", state: "observed", points: [{ distance: "400m", elapsedSec: 90 + index }] };
    return row;
  });
  const summary = annualRunHistory([historyPage(rows)]);
  expect(summary.representatives).toHaveLength(2500);
  expect(expandedAnnualCoverage(summary.representatives, "400m")).toEqual({ candidate: 2500, supported: 2500, observed: 2500, noObserved: 0, unsupported: 0, unavailable: 0 });
  expect(annualDistanceLeaders(summary.representatives, "400m")).toHaveLength(10);
});

it.each(["empty", "valid-hole", "inherited", "null", "nonfinite"])("rejects real sparse or invalid expanded points: %s", fault => {
  const points: Array<{ distance: "400m"; elapsedSec: number }> = fault === "empty" ? Array(1) : [{ distance: "400m", elapsedSec: 90 }];
  if (fault === "valid-hole") points.length = 2;
  if (fault === "inherited") { delete points[0]; Object.setPrototypeOf(points, Object.assign(Object.create(Array.prototype), { 0: { distance: "400m", elapsedSec: 90 } })); }
  if (fault === "null") points[0] = null as unknown as typeof points[number];
  if (fault === "nonfinite") points[0]!.elapsedSec = Infinity;
  expect(validExpandedDistanceRecords({ version: 1, targetsVersion: 2, timingBasis: "elapsed_including_stops", state: "observed", points }, true)).toBe(false);
});
it.each(["hole", "inherited", "null"])("rejects all14 distance array slot violations: %s", fault => {
  const period = runningPeriodFixture().periods[0]!, data = expandedPeriodFixture(period), last = data.distances[13]!;
  if (fault === "null") data.distances[13] = null as unknown as typeof last;
  else { delete data.distances[13]; if (fault === "inherited") Object.setPrototypeOf(data.distances, Object.assign(Object.create(Array.prototype), { 13: last })); }
  expect(validExpandedDistanceAnalysis(data, period)).toBe(false);
});
it.each(["hole", "inherited", "null", "nonfinite"])("rejects3 sources with two valid records and an invalid slot: %s", fault => {
  const period = runningPeriodFixture().periods[0]!;
  period.activities = ["a", "b", "c"].map(activityId => ({ ...period.activities[0]!, activityId }));
  period.coverage.representativeActivityCount = 3;
  const data = expandedPeriodFixture(period), sources = data.distances[0]!.sources, last = sources[2]!;
  if (fault === "null") sources[2] = null as unknown as typeof last;
  else if (fault === "nonfinite") sources[2]!.elapsedSec = NaN;
  else { delete sources[2]; if (fault === "inherited") Object.setPrototypeOf(sources, Object.assign(Object.create(Array.prototype), { 2: last })); }
  expect(validExpandedDistanceAnalysis(data, period)).toBe(false);
});
