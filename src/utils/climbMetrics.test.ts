import { describe, expect, it } from "vitest";
import { buildClimbTableRows } from "./climbMetrics";

const fallback = [{
  startKm: 2,
  endKm: 3,
  lengthKm: 1,
  elevationGain: 70,
  avgGrade: 7,
  vam: 840,
  durationSec: 300,
}];

describe("buildClimbTableRows", () => {
  it("uses server ClimbMetric values as the authoritative source", () => {
    expect(buildClimbTableRows([{
      startKm: 5,
      endKm: 7,
      lengthKm: 2,
      elevationGainM: 160,
      avgGrade: 8,
      category: "Cat2",
      durationSec: 600,
      vam: 960,
      avgPower: 280,
      wPerKg: 4.2,
      normalizedPower: 292,
      climbScore: 1600,
    }], fallback)).toEqual([{
      startKm: 5,
      lengthKm: 2,
      elevationGain: 160,
      avgGrade: 8,
      category: "Cat2",
      durationSec: 600,
      vam: 960,
      avgPower: 280,
      wPerKg: 4.2,
    }]);
  });

  it("treats an empty server array as an authoritative no-climbs result", () => {
    expect(buildClimbTableRows([], fallback)).toEqual([]);
  });

  it("falls back to client detection when the server field is missing", () => {
    const expected = [{ ...fallback[0], category: null, avgPower: null, wPerKg: null }];
    expect(buildClimbTableRows(undefined, fallback)).toEqual(expected);
  });

  it("preserves valid server rows and drops only malformed rows from a mixed array", () => {
    const rows = buildClimbTableRows([
      { startKm: "bad" },
      {
        startKm: 5, lengthKm: 2, elevationGainM: 160, avgGrade: 8,
        category: null, durationSec: 600, vam: 960, avgPower: 0, wPerKg: 0,
      },
    ], fallback);
    expect(rows).toEqual([{
      startKm: 5, lengthKm: 2, elevationGain: 160, avgGrade: 8,
      category: null, durationSec: 600, vam: 960, avgPower: 0, wPerKg: 0,
    }]);
  });

  it("renders optional invalid server metrics as unavailable without discarding the climb", () => {
    const [row] = buildClimbTableRows([{
      startKm: 5,
      lengthKm: 2,
      elevationGainM: 160,
      avgGrade: 8,
      category: "unexpected",
      durationSec: 0,
      vam: Number.NaN,
      avgPower: -1,
      wPerKg: null,
    }], fallback);
    expect(row).toMatchObject({ category: null, durationSec: null, vam: null, avgPower: null, wPerKg: null });
  });

  it("uses the backend category thresholds only for client fallback rows", () => {
    const rows = buildClimbTableRows(undefined, [
      { ...fallback[0], lengthKm: 1, avgGrade: 8 },
      { ...fallback[0], lengthKm: 2, avgGrade: 8 },
      { ...fallback[0], lengthKm: 4, avgGrade: 8 },
      { ...fallback[0], lengthKm: 8, avgGrade: 8 },
      { ...fallback[0], lengthKm: 10, avgGrade: 8 },
    ]);
    expect(rows.map((row) => row.category)).toEqual(["Cat4", "Cat3", "Cat2", "Cat1", "HC"]);
  });
});
