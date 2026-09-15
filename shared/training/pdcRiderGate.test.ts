import { describe, expect, it } from "vitest";
import parity from "../../src/features/coach/__fixtures__/rider-insight-parity.json";
import { parsePersistedPdc } from "../../src/services/pdcContract";
import type { PdcDoc } from "../types/pdc";
import { hasCanonicalPdcV5Source, hasDefinitiveRiderProfile } from "./pdcRiderGate";

describe("canonical PDC rider profile gate", () => {
  it("accepts canonical final v6 rider evidence and rejects partial lifecycle or cohort-ineligible power", () => {
    const value = structuredClone(parity.persistedPdc) as any;
    value.version = 6; value.status = "final"; value.inputDigest = "a".repeat(64);
    value.asOf = value.computedAt;
    value.coverage = { state: "complete", candidateActivityCount: value.activityCount,
      includedActivityCount: value.activityCount, excludedActivityCount: 0,
      excludedActivityIds: [], excludedActivityIdsTruncated: false, excludedReasonCounts: {},
      carriedForwardDurationCount: 0 };
    const pdc = parsePersistedPdc(value);
    expect(hasCanonicalPdcV5Source(pdc)).toBe(true);
    expect(hasDefinitiveRiderProfile(pdc)).toBe(true);
    expect(hasDefinitiveRiderProfile({ ...pdc, status: "partial" })).toBe(false);
    const personal = structuredClone(pdc);
    personal.mmpAll["5s"]!.cohortEligible = false;
    personal.provenance.byDuration["5s"]!.cohortEligible = false;
    expect(hasDefinitiveRiderProfile(personal)).toBe(false);
  });
  it("requires v5 measured provenance, weight, five activities, and confidence >= 0.75", () => {
    const pdc = parsePersistedPdc(parity.persistedPdc);
    expect(hasDefinitiveRiderProfile(pdc)).toBe(true);
    for (const patch of [
      { version: 4 }, { activityCount: 4 }, { weightKgSnapshot: null },
      { provenance: { ...pdc.provenance, version: 1 } },
      { provenance: { ...pdc.provenance, power: "virtual" } },
      { riderType: { ...pdc.riderType!, confidence: 0.74 } },
      { riderType: { ...pdc.riderType!, type: "Unclassified" } },
    ]) expect(hasDefinitiveRiderProfile({ ...pdc, ...patch } as PdcDoc)).toBe(false);
  });

  it.each([
    ["unknown duration source", (value: PdcDoc) => {
      value.mmpAll["5s"]!.source = "unknown";
      value.provenance.byDuration["5s"] = { source: "unknown", cohortEligible: true };
    }],
    ["cohort-ineligible duration", (value: PdcDoc) => {
      value.mmpAll["1m"]!.cohortEligible = false;
      value.provenance.byDuration["1m"]!.cohortEligible = false;
    }],
    ["missing MMP evidence", (value: PdcDoc) => { delete value.mmpAll["5m"]; }],
    ["missing provenance evidence", (value: PdcDoc) => { delete value.provenance.byDuration["20m"]; }],
    ["invalid activity evidence", (value: PdcDoc) => { value.mmpAll["5s"]!.activityId = ""; }],
    ["invalid date evidence", (value: PdcDoc) => { value.mmpAll["5s"]!.date = "2026-02-30"; }],
    ["increasing rider curve", (value: PdcDoc) => { value.mmpAll["20m"]!.value = 2_000; }],
  ] as Array<[string, (value: PdcDoc) => void]>)("rejects %s at the shared UI canonical gate", (_label, mutate) => {
    const pdc = parsePersistedPdc(parity.persistedPdc);
    const changed = structuredClone(pdc); mutate(changed);
    expect(hasCanonicalPdcV5Source(changed)).toBe(false);
    expect(hasDefinitiveRiderProfile(changed)).toBe(false);
  });
});
