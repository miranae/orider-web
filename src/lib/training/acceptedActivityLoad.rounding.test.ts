import { describe, expect, it } from "vitest";
import { acceptedActivityLoad } from "../../../shared/training/acceptedActivityLoad";
import type { Activity } from "@shared/types";
import { estimateActivityTss, sumActivityTss } from "../../utils/estimateTSS";

const summary = { ridingTimeMillis: 3_600_000, distance: 10_000 };
const derived = { schemaVersion: 1, userId: "fixture", inputBinding: "fixture-binding", streamTss: 0.1 };

describe("accepted TSS evidence before integer rounding", () => {
  it.each([
    [{ userId: "fixture", summary: { ...summary, tss: 0.1 } }, "recorded"],
    [{ userId: "fixture", tss: 0.1, summary: { ...summary, tss: 200 } }, "recorded"],
    [{ userId: "fixture", summary, serverDerivedLoad: derived }, "server"],
    [{ userId: "fixture", source: "strava", summary: { ...summary, tss: 200 }, serverDerivedLoad: derived }, "server"],
  ] as const)("keeps rounded zero known with its selected provenance", (activity, source) => {
    const before = structuredClone(activity);
    expect(acceptedActivityLoad(activity, "bike")).toEqual({ value: 0, known: true, reliable: true, source });
    expect(activity).toEqual(before);
  });

  it("preserves the existing raw-zero sentinel duration fallback", () => {
    expect(acceptedActivityLoad({ userId: "fixture", summary: { ...summary, tss: 0 } }, "bike"))
      .toEqual({ value: 42, known: true, reliable: false, source: "time" });
  });

  it("retains confirmed zero in the actual TrainingLog estimate and aggregate consumers", () => {
    const activity = { id: "tiny", userId: "fixture", type: "Ride", startTime: Date.UTC(2026, 8, 21),
      summary: { ...summary, tss: 0.1 } } as unknown as Activity;
    expect(estimateActivityTss(activity)).toEqual({ value: 0, estimated: false });
    expect(sumActivityTss([activity])).toEqual({ value: 0, estimated: false, unknownCount: 0 });
  });
});
