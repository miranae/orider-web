import { describe, expect, it } from "vitest";
import parity from "../../src/features/coach/__fixtures__/rider-insight-parity.json";
import { parsePersistedPdc } from "../../src/services/pdcContract";
import { hasDefinitiveRiderProfile } from "./pdcRiderGate";

describe("canonical PDC rider profile gate", () => {
  it("requires v5 measured provenance, weight, five activities, and confidence >= 0.75", () => {
    const pdc = parsePersistedPdc(parity.persistedPdc);
    expect(hasDefinitiveRiderProfile(pdc)).toBe(true);
    for (const patch of [
      { version: 4 }, { activityCount: 4 }, { weightKgSnapshot: null },
      { provenance: { ...pdc.provenance, version: 1 } },
      { provenance: { ...pdc.provenance, power: "virtual" } },
      { riderType: { ...pdc.riderType!, confidence: 0.74 } },
      { riderType: { ...pdc.riderType!, type: "Unclassified" } },
    ]) expect(hasDefinitiveRiderProfile({ ...pdc, ...patch } as any)).toBe(false);
  });
});
