import { describe, expect, it } from "vitest";
import { buildRunPacePeriods, buildSwimPacePeriods } from "./fitnessCurveDocuments";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const document = (discipline: "run" | "swim", entries: unknown[]) => ({
  version: 1, discipline, windowDays: 56, maxEntries: 256,
  entries, generation: 2, updatedAt: NOW, truncated: false,
});

describe("fitnessCurveDocuments", () => {
  it("includes exact 28/56-day lower boundaries and selects sorted minimum running paces", () => {
    const point = (durationSec: number, paceSecPerKm: number) => ({ durationSec, paceSecPerKm });
    const entry = (startTime: number, curve: unknown[]) => ({ activityId: "activity", startTime, curve });
    const periods = buildRunPacePeriods(document("run", [
      entry(NOW, [point(300, 310), point(60, 250)]),
      entry(NOW - 28 * DAY, [point(300, 300.1234)]),
      entry(NOW - 28 * DAY - 1, [point(300, 330)]),
      entry(NOW - 56 * DAY, [point(60, 280)]),
      entry(NOW - 56 * DAY - 1, [point(60, 1)]),
    ]), NOW);
    expect(periods).toEqual({
      recent28: [point(60, 250), point(300, 300.1234)],
      prev28: [point(60, 280), point(300, 330)],
    });
  });

  it("aggregates swimming coordinates and discards invalid samples without default points", () => {
    const periods = buildSwimPacePeriods(document("swim", [
      { startTime: NOW, curve: [
        { distanceM: 400, paceSecPer100m: 95 },
        { distanceM: 100, paceSecPer100m: 90 },
        { distanceM: 400, paceSecPer100m: 93.25 },
        { distanceM: NaN, paceSecPer100m: 90 },
        { distanceM: 200, paceSecPer100m: Infinity },
        { distanceM: -50, paceSecPer100m: 90 },
        { distanceM: 200, paceSecPer100m: 0 },
        null,
      ] },
      { startTime: NaN, curve: [{ distanceM: 100, paceSecPer100m: 1 }] },
    ]), NOW);
    expect(periods).toEqual({ recent28: [
      { distanceM: 100, paceSecPer100m: 90 },
      { distanceM: 400, paceSecPer100m: 93.25 },
    ], prev28: [] });
    expect(buildSwimPacePeriods(document("swim", []), NOW)).toEqual({ recent28: [], prev28: [] });
  });

  it("rejects incompatible contracts while permitting added server fields", () => {
    expect(() => buildRunPacePeriods(document("swim", []), NOW)).toThrow("Invalid fitness curve contract");
    expect(() => buildRunPacePeriods({ ...document("run", []), version: 2 }, NOW)).toThrow();
    expect(buildRunPacePeriods({ ...document("run", []), futureField: true }, NOW)).toEqual({ recent28: [], prev28: [] });
  });
});
