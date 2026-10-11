import { describe, expect, it } from "vitest";
import type { PeriodRunningEvidence } from "@shared/types/training-analysis-periods";
import { observedMedianDifference, observedRunEffortLeaders } from "./observedRunEffortLeaders";
const entry = (activityId: string, elapsedSec = 1200, startTime = 100) => ({ activityId, elapsedSec, startTime, metricsRevision: "revision", distanceRecords: [{ distance: "5km" as const, elapsedSec }], paceCurve: null });
const evidence = (activities: PeriodRunningEvidence["activities"]): PeriodRunningEvidence => ({ version: 1, scope: "observed_representatives", timingBasis: "elapsed_including_stops", activities });
describe("observedRunEffortLeaders", () => {
  it("orders explicit efforts by elapsed, newest date, fixed ID without mutating input", () => {
    const input = evidence([entry("z", 1200, 200), entry("a", 1200, 200), entry("fast", 1100), entry("old", 1200, 100)]);
    const snapshot = structuredClone(input);
    expect(observedRunEffortLeaders(input, "5km").map(record => record.activityId)).toEqual(["fast", "a", "z"]);
    expect(input).toEqual(snapshot);
    expect(observedRunEffortLeaders(input, "5km")[0]).toMatchObject({ metricsRevision: "revision", elapsedSec: 1100, startTime: 100 });
  });
  it.each([0, 1, 2, 3, 4])("returns at most three of %s sources", count => {
    expect(observedRunEffortLeaders(evidence(Array.from({ length: count }, (_, i) => entry(String(i)))), "5km")).toHaveLength(Math.min(count, 3));
  });
  it("preserves missing distance and rejects invalid timings, revisions and duplicate sources", () => {
    expect(observedRunEffortLeaders(undefined, "5km")).toEqual([]);
    expect(observedRunEffortLeaders(evidence([entry("a")]), "full")).toEqual([]);
    const input = evidence([entry("invalid", NaN), entry("negative", -1), entry("zero", 0), { ...entry("no-revision"), metricsRevision: "" }, entry("same", 1200), entry("same", 1100)]);
    expect(observedRunEffortLeaders(input, "5km").map(record => record.activityId)).toEqual(["same"]);
  });
  it("caps representatives before sorting and does not substitute another timing basis", () => {
    const input = evidence([...Array.from({ length: 200 }, (_, i) => entry(String(i))), entry("outside-cap", 1)]);
    expect(observedRunEffortLeaders(input, "5km").some(record => record.activityId === "outside-cap")).toBe(false);
    expect(observedRunEffortLeaders({ ...input, timingBasis: "moving" } as unknown as PeriodRunningEvidence, "5km")).toEqual([]);
  });
});

describe("observed median sample difference", () => {
  const sample = { key: 300, median: 300.5, count: 8, basis: "run_metrics_pace_curve", timingBasis: "elapsed", unit: "sec_per_km" };
  it("preserves fractional seconds and converts pace differences to seconds per mile", () => {
    const previous = { ...sample, median: 301, count: 6 };
    expect(observedMedianDifference(sample, previous)).toEqual({ deltaSeconds: -.5, previousCount: 6, currentCount: 8 });
    expect(observedMedianDifference(sample, previous, true)?.deltaSeconds).toBeCloseTo(-.804672, 6);
    const distance = { ...sample, key: "5km", basis: "elapsed_including_stops", timingBasis: "elapsed_including_stops", unit: "seconds" };
    expect(observedMedianDifference(distance, { ...distance, median: 301 }, true)?.deltaSeconds).toBe(-.5);
  });
  it.each([{ key: 60 }, { basis: "speed_curve_kmh_converted" }, { unit: "seconds" }, { timingBasis: "moving" }, { count: 0 }, { count: 201 }, { count: 1.5 }, { median: NaN }, { median: 0 }])("withholds non-comparable samples %j", invalid => {
    expect(observedMedianDifference(sample, { ...sample, ...invalid })).toBeNull();
  });
  it("does not fill missing sample statistics", () => {
    expect(observedMedianDifference(undefined, sample)).toBeNull();
    expect(observedMedianDifference(sample, undefined)).toBeNull();
  });
});
