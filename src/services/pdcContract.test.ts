import { describe, expect, expectTypeOf, it } from "vitest";
import type { PdcDoc } from "@shared/types/pdc";
import { hasCanonicalPdcV5Source } from "@shared/training/pdcRiderGate";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { parsePersistedPdc } from "./pdcContract";

const fixture = () => structuredClone(parity.persistedPdc) as any;
const legacyFixture = () => {
  const legacy = fixture();
  legacy.version = 1;
  delete legacy.provenance;
  for (const entry of Object.values(legacy.mmpAll) as any[]) {
    delete entry.source;
    delete entry.cohortEligible;
  }
  return legacy;
};

describe("persisted PDC v5 contract", () => {
  it("accepts only the canonical v5 measured-power provenance source", () => {
    const parsed = parsePersistedPdc(fixture());
    expect(parsed).toMatchObject({ version: 5, provenance: { version: 2, power: "measured", excludesVirtualPower: true },
      activityCount: 12, weightKgSnapshot: 70, riderType: { type: "AllRounder", confidence: 0.91 } });
  });

  it("preserves a valid optional v5 MMP context", () => {
    const value = fixture();
    value.mmpAll["5s"].context = "race";
    expect(parsePersistedPdc(value).mmpAll["5s"]).toMatchObject({ context: "race" });
  });

  it.each([42, "x".repeat(129)])("rejects an invalid v5 MMP context", (context) => {
    const value = fixture();
    value.mmpAll["5s"].context = context;
    expect(() => parsePersistedPdc(value)).toThrow("INVALID_PERSISTED_PDC_V5");
  });

  it("reconstructs persisted v1 as a non-canonical v5 document using only validated CP and MMP", () => {
    const legacy = legacyFixture();
    const parsed = parsePersistedPdc(legacy);
    expectTypeOf(parsed).toEqualTypeOf<PdcDoc>();
    expectTypeOf(parsed.version).toEqualTypeOf<5>();
    expect(parsed).toMatchObject({ version: 5, activityCount: 12, cp: { value: 270 },
      provenance: { version: 2, power: "unknown", excludesVirtualPower: false, migration: "legacy_v1" },
      pdcModel: null, stamina: null, powerProfile: "unclassified", wPerKgAtKey: null,
      riderType: null, ability: null, sustainablePower: [], history: [], vo2maxEst: null, weightKgSnapshot: null });
    expect(parsed.mmpAll["5s"]).toMatchObject({ source: "unknown", cohortEligible: false });
    expect(parsed.mmpAll["5s"]).not.toHaveProperty("context");
    expect(hasCanonicalPdcV5Source(parsed)).toBe(false);
  });

  it("preserves a valid optional v1 MMP context during migration", () => {
    const legacy = legacyFixture();
    legacy.mmpAll["5s"].context = "race";
    expect(parsePersistedPdc(legacy).mmpAll["5s"]).toMatchObject({ context: "race",
      source: "unknown", cohortEligible: false });
  });

  it("rejects an invalid v1 MMP context", () => {
    const legacy = legacyFixture();
    legacy.mmpAll["5s"].context = 42;
    expect(() => parsePersistedPdc(legacy)).toThrow("INVALID_PERSISTED_PDC_V5");
  });

  it("rejects malformed persisted v1 documents", () => {
    const legacy = legacyFixture();
    delete legacy.mmpAll["5s"].activityId;
    expect(() => parsePersistedPdc(legacy)).toThrow("INVALID_PERSISTED_PDC_V5");
  });

  it.each([
    ["unknown top-level field", (value: any) => { value.rawActivities = []; }],
    ["legacy version", (value: any) => { value.version = 4; }],
    ["legacy provenance", (value: any) => { value.provenance.version = 1; }],
    ["virtual power", (value: any) => { value.provenance.power = "virtual"; }],
    ["non-finite MMP", (value: any) => { value.mmpAll["5s"].value = Infinity; }],
    ["increasing curve", (value: any) => { value.mmpAll["20m"].value = 900; }],
    ["CP/model drift", (value: any) => { value.pdcModel.cpEst = 200; }],
    ["weight/ability drift", (value: any) => { value.ability.byDuration[0].wPerKg = 10; }],
    ["provenance/source drift", (value: any) => { value.provenance.byDuration["5s"].source = "direct_file"; }],
    ["classification out of range", (value: any) => { value.riderType.confidence = 1.1; }],
    ["missing required field", (value: any) => { delete value.activityCount; }],
  ] as Array<[string, (value: any) => void]>)("rejects %s fail-closed", (_label, mutate) => {
    const value = fixture(); mutate(value);
    expect(() => parsePersistedPdc(value)).toThrow("INVALID_PERSISTED_PDC_V5");
  });
});
