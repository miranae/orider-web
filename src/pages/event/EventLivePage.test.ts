import { describe, expect, it } from "vitest";
import { normalizeSnapshotData, shouldEmitSosHighlight } from "./EventLivePage";

describe("EventLivePage snapshot normalization", () => {
  it("defaults missing locations and checkpoints to empty arrays", () => {
    const snapshot = normalizeSnapshotData({ timestamp: 123 });

    expect(snapshot.timestamp).toBe(123);
    expect(snapshot.locations).toEqual([]);
    expect(snapshot.checkpoints).toEqual([]);
    expect(snapshot.counts).toEqual({
      riding: 0,
      finished: 0,
      dnf: 0,
      sos: 0,
      offCourse: 0,
      total: 0,
    });
  });
});

describe("EventLivePage SOS highlight gating", () => {
  it("emits when a rider transitions into SOS and alerts aren't muted", () => {
    expect(shouldEmitSosHighlight("RIDING", "SOS", false)).toBe(true);
  });

  it("does not emit when SOS alerts are muted", () => {
    expect(shouldEmitSosHighlight("RIDING", "SOS", true)).toBe(false);
  });

  it("does not emit when the rider was already in SOS (no transition)", () => {
    expect(shouldEmitSosHighlight("SOS", "SOS", false)).toBe(false);
  });

  it("does not emit for non-SOS statuses", () => {
    expect(shouldEmitSosHighlight("RIDING", "FINISHED", false)).toBe(false);
  });

  it("does not emit without a known previous status (first snapshot)", () => {
    expect(shouldEmitSosHighlight(undefined, "SOS", false)).toBe(false);
  });
});

