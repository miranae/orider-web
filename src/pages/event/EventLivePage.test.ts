import { describe, expect, it } from "vitest";
import { normalizeSnapshotData } from "./EventLivePage";

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

