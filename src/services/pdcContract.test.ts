import { describe, expect, it } from "vitest";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { parsePersistedPdc } from "./pdcContract";

const fixture = () => structuredClone(parity.persistedPdc) as any;

describe("persisted PDC v5 contract", () => {
  it("accepts only the canonical v5 measured-power provenance source", () => {
    const parsed = parsePersistedPdc(fixture());
    expect(parsed).toMatchObject({ version: 5, provenance: { version: 2, power: "measured", excludesVirtualPower: true },
      activityCount: 12, weightKgSnapshot: 70, riderType: { type: "AllRounder", confidence: 0.91 } });
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
