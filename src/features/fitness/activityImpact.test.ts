import { describe, expect, it } from "vitest";

import type { Activity } from "@shared/types";
import type { FitnessPoint } from "../../utils/fitnessMetrics";
import {
  activityIdsCoveredByImpacts,
  deriveActivityImpacts,
  forecastFitnessChoice48Hours,
  forecastFitness48Hours,
} from "./activityImpact";

function activity(id: string, startTime: number, summaryTss: number | null, topLevelTss?: number): Activity {
  return {
    id,
    startTime,
    summary: { tss: summaryTss },
    ...(topLevelTss === undefined ? {} : { tss: topLevelTss }),
  } as Activity;
}

function ride(params: {
  id: string;
  source: "strava" | "orider";
  startTime: number;
  distanceKm: number;
  movingSec: number;
  tss: number | null;
}): Activity {
  return {
    id: params.id,
    source: params.source,
    startTime: params.startTime,
    summary: {
      distance: params.distanceKm * 1_000,
      movingTimeSec: params.movingSec,
      ridingTimeMillis: params.movingSec * 1_000,
      tss: params.tss,
    },
  } as Activity;
}

const point = (date: string, ctl: number, atl: number, dailyLoad: number): FitnessPoint => ({
  date,
  ctl,
  atl,
  tsb: ctl - atl,
  dailyLoad,
});

describe("deriveActivityImpacts", () => {
  it("uses canonical 196 TSS for a single activity and exposes its marginal effect", () => {
    const points = [point("2026-08-28", 36, 42, 0), point("2026-08-29", 39.8, 64, 196)];
    const [impact] = deriveActivityImpacts(points, [activity("ride", Date.UTC(2026, 7, 29, 8), 120)]);

    expect(impact.confidence).toBe("canonical-single");
    expect(impact.attributedLoad).toBe(196);
    expect(impact.marginalImpact.ctl).toBeCloseTo(196 / 42);
    expect(impact.marginalImpact.atl).toBe(28);
    expect(impact.marginalImpact.tsb).toBeCloseTo(196 / 42 - 28);
  });

  it("keeps actual end-of-day state change separate from load-only marginal impact", () => {
    const points = [point("2026-08-28", 36, 42, 0), point("2026-08-29", 39.8, 64, 196)];
    const [impact] = deriveActivityImpacts(points, [activity("ride", Date.UTC(2026, 7, 29, 8), 196)]);

    expect(impact.actualDayChange).toEqual({ ctl: 3.799999999999997, atl: 22, tsb: -18.200000000000003 });
    expect(impact.actualDayChange?.ctl).not.toBeCloseTo(impact.marginalImpact.ctl);
    expect(impact.actualDayChange?.atl).not.toBeCloseTo(impact.marginalImpact.atl);
  });

  it("allocates a multi-activity canonical load proportionally and conserves the total", () => {
    const activities = [
      activity("later", Date.UTC(2026, 7, 29, 18), 50, 75),
      activity("earlier", Date.UTC(2026, 7, 29, 7), 25),
    ];
    const impacts = deriveActivityImpacts([point("2026-08-29", 10, 20, 200)], activities);

    expect(impacts.map((impact) => impact.activity.id)).toEqual(["later", "earlier"]);
    expect(impacts.every((impact) => impact.confidence === "estimated-allocation")).toBe(true);
    expect(impacts[0].attributedLoad).toBe(150);
    expect(impacts[1].attributedLoad).toBe(50);
    expect(impacts.reduce((sum, impact) => sum + impact.attributedLoad, 0)).toBeCloseTo(200);
  });

  it("attributes a duplicated Orider and Strava ride once to the canonical representative", () => {
    const activities = [
      ride({
        id: "orider-ride",
        source: "orider",
        startTime: 1_787_990_769_446,
        distanceKm: 77.78136,
        movingSec: 11_735.672,
        tss: 102,
      }),
      ride({
        id: "strava_ride",
        source: "strava",
        startTime: 1_787_994_466_000,
        distanceKm: 70.4166,
        movingSec: 9_385,
        tss: null,
      }),
    ];

    const impacts = deriveActivityImpacts([point("2026-08-29", 37.9, 48.5, 102)], activities);

    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({
      activity: { id: "strava_ride" },
      attributedLoad: 102,
      canonicalDailyLoad: 102,
      confidence: "canonical-single",
    });
    expect(impacts.reduce((sum, impact) => sum + impact.attributedLoad, 0)).toBeCloseTo(102);
    expect(activityIdsCoveredByImpacts(activities, impacts)).toEqual(new Set(["orider-ride", "strava_ride"]));
  });

  it("uses legacy duration fallback and time load when choosing a same-source representative", () => {
    const startTime = Date.parse("2026-08-29T10:00:00.000Z");
    const longerWithoutExplicitTss = {
      id: "longer-time-load",
      source: "orider",
      startTime,
      summary: { distance: 30_000, movingTimeMillis: 3_600_000, tss: null },
    } as Activity;
    const shorterWithExplicitTss = ride({
      id: "shorter-explicit-load",
      source: "orider",
      startTime: startTime + 10_000,
      distanceKm: 30,
      movingSec: 3_550,
      tss: 50,
    });

    const impacts = deriveActivityImpacts(
      [point("2026-08-29", 10, 12, 80)],
      [shorterWithExplicitTss, longerWithoutExplicitTss],
    );

    expect(impacts).toHaveLength(1);
    expect(impacts[0].activity.id).toBe("longer-time-load");
    expect(impacts[0].attributedLoad).toBe(80);
  });

  it("keeps conservative allocation for genuinely distinct same-day activities", () => {
    const startTime = Date.parse("2026-08-29T06:00:00.000Z");
    const known = ride({
      id: "morning-ride",
      source: "orider",
      startTime,
      distanceKm: 40,
      movingSec: 3_600,
      tss: 60,
    });
    const unknown = ride({
      id: "evening-ride",
      source: "orider",
      startTime: startTime + 10 * 60 * 60 * 1_000,
      distanceKm: 30,
      movingSec: 2_700,
      tss: null,
    });

    expect(deriveActivityImpacts([point("2026-08-29", 10, 12, 100)], [known, unknown])).toEqual([]);
  });

  it("omits activities that have no matching canonical fitness point", () => {
    const impacts = deriveActivityImpacts(
      [point("2026-08-28", 10, 12, 30)],
      [activity("missing-day", Date.UTC(2026, 7, 29, 7), 30)],
      { asOfDate: "2026-08-29" },
    );
    expect(impacts).toEqual([]);
  });

  it("groups by UTC day at the boundary instead of the browser timezone", () => {
    const activities = [
      activity("before", Date.parse("2026-08-29T23:59:59.999Z"), 40),
      activity("after", Date.parse("2026-08-30T00:10:00.000Z"), 60),
    ];
    const impacts = deriveActivityImpacts(
      [point("2026-08-29", 10, 12, 40), point("2026-08-30", 11, 15, 60)],
      activities,
    );

    expect(impacts.map(({ activity: item, date, attributedLoad }) => [item.id, date, attributedLoad])).toEqual([
      ["after", "2026-08-30", 60],
      ["before", "2026-08-29", 40],
    ]);
    expect(impacts[1].daysSince).toBe(1);
    expect(impacts[1].remainingContribution.ctl).toBeCloseTo((40 / 42) * (41 / 42));
  });

  it("does not estimate a multi-activity allocation when any candidate load is unsafe", () => {
    const impacts = deriveActivityImpacts(
      [point("2026-08-29", 10, 12, 100)],
      [activity("known", Date.UTC(2026, 7, 29, 7), 50), activity("unknown", Date.UTC(2026, 7, 29, 8), Number.NaN)],
    );
    expect(impacts).toEqual([]);
  });
});

describe("forecastFitness48Hours", () => {
  it("projects zero-load recovery and an optional first-day easy load", () => {
    const current = point("2026-08-29", 42, 49, 100);
    const forecast = forecastFitness48Hours(current, 35);

    expect(forecast.rest[0]).toMatchObject({ date: "2026-08-30", hoursAhead: 24, dailyLoad: 0, ctl: 41, atl: 42 });
    expect(forecast.rest[1]).toMatchObject({ date: "2026-08-31", hoursAhead: 48, dailyLoad: 0 });
    expect(forecast.rest[1].ctl).toBeCloseTo(41 * (41 / 42));
    expect(forecast.rest[1].atl).toBe(36);
    expect(forecast.easy?.[0].ctl).toBeCloseTo(41 + 35 / 42);
    expect(forecast.easy?.[0].atl).toBe(47);
    expect(forecast.easy?.[1].dailyLoad).toBe(0);
  });

  it("omits the easy scenario for zero or non-finite load", () => {
    const current = point("2026-08-29", 42, 49, 100);
    expect(forecastFitness48Hours(current, 0).easy).toBeUndefined();
    expect(forecastFitness48Hours(current, Number.POSITIVE_INFINITY).easy).toBeUndefined();
  });

  it("projects each selectable load through the same canonical EMA", () => {
    const current = point("2026-08-29", 42, 49, 100);
    const recovery = forecastFitnessChoice48Hours(current, 20);
    const endurance = forecastFitnessChoice48Hours(current, 45);

    expect(recovery[0].dailyLoad).toBe(20);
    expect(recovery[0].ctl).toBeCloseTo(41 + 20 / 42);
    expect(recovery[0].atl).toBeCloseTo(42 + 20 / 7);
    expect(endurance[0].dailyLoad).toBe(45);
    expect(endurance[0].atl).toBeGreaterThan(recovery[0].atl);
    expect(endurance[1].tsb).toBeLessThan(recovery[1].tsb);
  });
});
