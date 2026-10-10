import { describe, expect, it } from "vitest";
import type { PdcDoc } from "@shared/types/pdc";
import parity from "../../coach/__fixtures__/rider-insight-parity.json";
import { personalBenchmark } from "./personalBenchmarkPresentation";
import type { MetricsLike } from "./metricsPresentation";
const reference = (): PdcDoc => ({ ...structuredClone(parity.persistedPdc), version: 6, status: "final", asOf: 1791504000000,
  coverage: { state: "complete", candidateActivityCount: 12, includedActivityCount: 12, excludedActivityCount: 0,
    excludedActivityIds: [], excludedActivityIdsTruncated: false, excludedReasonCounts: {}, carriedForwardDurationCount: 0 } }) as PdcDoc;
const current: MetricsLike = { discipline: "bike", isVirtualPower: false, inputCoverage: "complete", mmp: { "1m": 350, "5m": 280, "30m": 200 } };
describe("personalBenchmark", () => {
  it("compares canonical shared durations in seconds, without interpolation or model samples", () => {
    const pdc = reference(); pdc.mmpAll["30m"] = undefined;
    const result = personalBenchmark(current, pdc);
    expect(result.reason).toBe("ready");
    expect(result.points.map(point => point.seconds)).toEqual([60, 300]);
    expect(result.points[1]).toMatchObject({ watts: 280, referenceWatts: pdc.mmpAll["5m"]!.value,
      activityId: pdc.mmpAll["5m"]!.activityId, date: pdc.mmpAll["5m"]!.date });
    expect(result.asOf).toBe(pdc.asOf);
  });
  it.each([{ isVirtualPower: true }, { isVirtualPower: undefined }, { discipline: "run" }, { inputCoverage: "pending" },
    { inputCoverage: "partial_terminal" }, { inputCoverage: undefined }, { inputPending: true }])("withholds incompatible or unconfirmed current inputs %j", patch => {
    expect(personalBenchmark({ ...current, ...patch } as MetricsLike, reference()).reason).toBe("currentUnavailable");
  });
  it.each([{ version: 5 }, { status: "partial" }, { coverage: { state: "partial" } }, { asOf: undefined },
    { provenance: { power: "unknown", excludesVirtualPower: false } }, { discipline: "run" }])("requires confirmed complete reference provenance %j", patch => {
    expect(personalBenchmark(current, { ...reference(), ...patch } as PdcDoc).reason).toBe("referenceUnproven");
  });
  it("omits invalid and unknown-source durations without replacing them with zeros", () => {
    const pdc = reference();
    pdc.mmpAll["1m"]!.source = "unknown";
    const result = personalBenchmark({ ...current, mmp: { "1m": 350, "5m": NaN, "10m": 0 } }, pdc);
    expect(result).toEqual({ reason: "noCommonDurations", points: [] });
  });
  it("does not require public cohort eligibility for a valid private measured reference", () => {
    const pdc = reference();
    pdc.mmpAll["5m"]!.cohortEligible = false;
    pdc.provenance.byDuration["5m"]!.cohortEligible = false;
    expect(personalBenchmark(current, pdc).points.some(point => point.seconds === 300)).toBe(true);
  });
  it("rejects per-duration provenance mismatches", () => {
    const pdc = reference(); pdc.provenance.byDuration["5m"]!.source = "unknown";
    expect(personalBenchmark({ ...current, mmp: { "5m": 280 } }, pdc).reason).toBe("noCommonDurations");
  });
});
