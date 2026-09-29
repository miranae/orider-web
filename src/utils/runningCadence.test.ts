import { describe, expect, it } from "vitest";
import { runningCadenceSpm } from "./runningCadence";

describe("running cadence provenance", () => {
  it("converts provider strides to total steps", () => expect(runningCadenceSpm(95, "strides_per_minute")).toBe(190));
  it("preserves app steps, including low cadence", () => {
    expect(runningCadenceSpm(191, "spm")).toBe(191);
    expect(runningCadenceSpm(90, "spm")).toBe(90);
  });
  it("does not guess cadence units from magnitude", () => {
    expect(runningCadenceSpm(95, null)).toBeNull();
    expect(runningCadenceSpm(190, undefined)).toBeNull();
    expect(runningCadenceSpm(95, "rpm")).toBeNull();
  });
  it("rejects absent and invalid recordings", () => {
    for (const value of [undefined, null, NaN, Infinity, 0, -95]) expect(runningCadenceSpm(value, "strides_per_minute")).toBeNull();
  });
});
