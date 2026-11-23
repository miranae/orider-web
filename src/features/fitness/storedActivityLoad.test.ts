import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { storedActivityLoad, storedActivityName } from "./storedActivityLoad";

const base = { id: "a", userId: "u", type: "Ride", startTime: 0, endTime: 0, summary: { distance: 40000, ridingTimeMillis: 7200000, averagePower: 200, tss: null } } as unknown as Activity;

describe("storedActivityLoad", () => {
  it("prefers server metrics, then stored activity values", () => {
    expect(storedActivityLoad({ ...base, summary: { ...base.summary, tss: 70 } }, { tss: 82.4 })).toBe(82);
    expect(storedActivityLoad({ ...base, summary: { ...base.summary, tss: 70 } })).toBe(70);
    expect(storedActivityLoad({ ...base, serverDerivedLoad: { schemaVersion: 1, userId: "u", inputBinding: "b", streamTss: 55 } } as unknown as Activity)).toBe(55);
  });
  it("never estimates load from power or duration and ignores provider summaries", () => {
    expect(storedActivityLoad(base)).toBeNull();
    expect(storedActivityLoad({ ...base, source: "strava", summary: { ...base.summary, tss: 70 } })).toBeNull();
  });
  it("uses the stored name, then the description", () => {
    expect(storedActivityName({ ...base, name: " 남산 업힐 ", description: "메모" } as unknown as Activity)).toBe("남산 업힐");
    expect(storedActivityName({ ...base, description: "한강 Z2" } as Activity)).toBe("한강 Z2");
    expect(storedActivityName(base)).toBeNull();
  });
});
