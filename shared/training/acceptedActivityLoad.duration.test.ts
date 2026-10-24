import { describe, expect, it } from "vitest";
import { acceptedActivityLoad } from "./acceptedActivityLoad";

describe("accepted load duration evidence", () => {
  it.each([2834, 3473, 1268, 2652, 3281])("uses positive moving seconds when legacy riding millis is zero (%s)", movingTimeSec => {
    const activity = { source: "strava", summary: { ridingTimeMillis: 0, movingTimeSec, distance: 20_000 } };
    const original = structuredClone(activity);
    expect(acceptedActivityLoad(activity, "bike")).toEqual({
      value: Math.round(movingTimeSec / 3600 * 42), known: true, reliable: false, source: "time",
    });
    expect(activity).toEqual(original);
  });

  it("does not classify a long seconds-only ride as negligible", () => {
    expect(acceptedActivityLoad({ summary: { distance: 100, movingTimeSec: 1800 } }, "bike"))
      .toMatchObject({ value: 21, known: true, source: "time" });
  });

  it("keeps explicit zero motion known without manufacturing a load from pauses", () => {
    const activity = { source: "orider", summary: { movingTimeSec: 0, pauseTimeSec: 236_280, tss: null } };
    expect(acceptedActivityLoad(activity, "bike")).toEqual({ value: 0, known: true, reliable: false, source: "time" });
  });

  it.each([
    {}, { pauseTimeSec: 120 }, { ridingTimeMillis: 0 },
    { movingTimeSec: 0, distance: 20_000 }, { movingTimeSec: 0, distanceKm: 20 },
    { movingTimeSec: 0, distance: Number.NaN },
    { movingTimeSec: 0, ridingTimeMillis: -1 },
    { movingTimeSec: -1 }, { movingTimeSec: Number.NaN }, { movingTimeSec: Number.POSITIVE_INFINITY },
  ])("preserves unknown for missing, invalid or contradictory evidence: %j", summary => {
    expect(acceptedActivityLoad({ summary }, "bike")).toMatchObject({ value: 0, known: false, source: "unknown" });
  });

  it("retains positive millisecond precedence and reliable load precedence", () => {
    expect(acceptedActivityLoad({ summary: { ridingTimeMillis: 3_600_000, movingTimeSec: 0 } }, "bike"))
      .toMatchObject({ value: 42, known: true });
    expect(acceptedActivityLoad({ tss: 25, summary: { movingTimeSec: 0 } }, "bike"))
      .toMatchObject({ value: 25, known: true, source: "recorded" });
  });

});
