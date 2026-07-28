import { describe, expect, it } from "vitest";

import { filterServerMetricsForSensorCandidates } from "./AnalysisTab";

const metrics = {
  sufferScore: 81,
  quadrant: { q1Pct: 25, q2Pct: 25, q3Pct: 25, q4Pct: 25 },
  cyclingMetrics: { longestZ4PlusSec: 420, cadenceStdDev: 7 },
  zoneKj: { z1: 1, z2: 2, z3: 3, z4: 4, z5: 5, z6: 6, z7: 7 },
  lrBalance: { avg: 51, asymmetryPct: 2 },
  cyclingDynamics: {
    source: "records",
    sampleCount: 10,
    validSampleCount: 9,
    coverage: 0.9,
    balance: { leftAvgPct: 49, rightAvgPct: 51, asymmetryPct: 2 },
  },
  climbs: [{
    startKm: 2,
    endKm: 3,
    lengthKm: 1,
    elevationGainM: 70,
    avgGrade: 7,
    category: "Cat4",
    vam: 840,
    durationSec: 300,
    avgPower: 250,
    wPerKg: 3.6,
    normalizedPower: 270,
    climbScore: 7_000,
  }],
} as const;

const noCandidates = { power: false, heartRate: false, cadence: false };

describe("AnalysisTab server metric provenance", () => {
  it.each(["accepted", "rejected"])(
    "removes server power fields but preserves climb geometry for %s power",
    () => {
      const filtered = filterServerMetricsForSensorCandidates(metrics as never, {
        ...noCandidates,
        power: true,
      })!;

      expect(filtered.quadrant).toBeNull();
      expect(filtered.cyclingMetrics).toMatchObject({ longestZ4PlusSec: null, cadenceStdDev: 7 });
      expect(filtered.zoneKj).toBeUndefined();
      expect(filtered.lrBalance).toBeUndefined();
      expect(filtered.climbs[0]).toMatchObject({
        startKm: 2,
        lengthKm: 1,
        elevationGainM: 70,
        avgGrade: 7,
        durationSec: 300,
        vam: 840,
        avgPower: null,
        wPerKg: null,
        normalizedPower: null,
      });
    },
  );

  it.each(["accepted", "rejected"])("removes suffer score for %s heart rate", () => {
    const filtered = filterServerMetricsForSensorCandidates(metrics as never, {
      ...noCandidates,
      heartRate: true,
    })!;

    expect(filtered.sufferScore).toBeNull();
    expect(filtered.quadrant).toEqual(metrics.quadrant);
  });

  it.each(["accepted", "rejected"])(
    "removes cadence-dependent server metrics for %s cadence",
    () => {
      const filtered = filterServerMetricsForSensorCandidates(metrics as never, {
        ...noCandidates,
        cadence: true,
      })!;

      expect(filtered.cyclingMetrics).toMatchObject({ longestZ4PlusSec: 420, cadenceStdDev: null });
      expect(filtered.quadrant).toBeNull();
      expect(filtered.cyclingDynamics).toEqual(metrics.cyclingDynamics);
    },
  );

  it("keeps server metrics when no stream sensor candidate exists", () => {
    const filtered = filterServerMetricsForSensorCandidates(metrics as never, noCandidates)!;

    expect(filtered).toMatchObject(metrics);
  });
});
