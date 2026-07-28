import { describe, expect, it } from "vitest";
import type { Activity, UserFitness } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { PdcDoc } from "@shared/types/pdc";
import riderParity from "../coach/__fixtures__/rider-insight-parity.json";
import { parsePersistedPdc } from "../../services/pdcContract";
import { STALE_THRESHOLD_MS } from "@shared/training/staleness";
import {
  authoritativeCombinedLoad,
  buildRunEvidence,
  buildSwimEvidence,
  computeCyclingAbility,
  computeIntegratedLoadFocus,
} from "./multisportPerformance";

const now = Date.UTC(2026, 6, 14);
const day = 24 * 60 * 60 * 1000;

function activity(id: string, type: string, tss: number, startTime = now - day): Activity {
  return {
    id,
    type,
    startTime,
    summary: { tss, relativeEffort: null, ridingTimeMillis: 3_600_000, swolf: null },
  } as Activity;
}

function metrics(partial: Partial<ActivityMetrics>): ActivityMetrics {
  return {
    tss: null,
    durationSec: 3600,
    powerZoneSec: [],
    hrZoneSec: [],
    discipline: "bike",
    ...partial,
  } as ActivityMetrics;
}

describe("computeIntegratedLoadFocus", () => {
  it("maps all seven bike power zones once and conserves authoritative load", () => {
    const result = computeIntegratedLoadFocus(
      [activity("bike", "Ride", 70)],
      new Map([["bike", metrics({ tss: 70, discipline: "bike", powerZoneSec: [600, 600, 600, 600, 600, 600, 600], hrZoneSec: [720, 720, 720, 720, 720] })]]),
      now,
    );

    expect(result.buckets.baseAerobic).toBeCloseTo(5.57, 2);
    expect(result.buckets.highAerobic).toBeCloseTo(25.8, 2);
    expect(result.buckets.highIntensity).toBeCloseTo(38.636, 3);
    expect(result.buckets.unclassified).toBe(0);
    expect(result.buckets.highIntensity).toBeGreaterThan(result.buckets.highAerobic);
    expect(result.sourceLoad).toEqual({ power: 70, heartRate: 0, unclassified: 0 });
    expect(result.hasAnaerobicBikeDetail).toBe(true);
    expect(Object.values(result.buckets).reduce((sum, value) => sum + value, 0)).toBeCloseTo(result.totalLoad, 10);
  });

  it("uses lower-confidence HR mapping for supported sports without claiming bike anaerobic detail", () => {
    const result = computeIntegratedLoadFocus(
      [activity("run", "Run", 50), activity("swim", "Swim", 25)],
      new Map([
        ["run", metrics({ discipline: "run", hrZoneSec: [720, 720, 720, 720, 720] })],
        ["swim", metrics({ discipline: "swim", hrZoneSec: [720, 720, 720, 720, 720] })],
      ]),
      now,
    );

    expect(result.buckets.baseAerobic).toBeCloseTo(14.73, 2);
    expect(result.buckets.highAerobic).toBeCloseTo(33.78, 2);
    expect(result.buckets.highIntensity).toBeCloseTo(26.5, 2);
    expect(result.buckets.unclassified).toBe(0);
    expect(result.sourceLoad.heartRate).toBe(75);
    expect(result.confidence).toBe("medium");
    expect(result.hasAnaerobicBikeDetail).toBe(false);
  });

  it("retains unsupported and evidence-free activity load as unclassified", () => {
    const result = computeIntegratedLoadFocus(
      [activity("yoga", "Yoga", 30), activity("ride", "Ride", 40)],
      new Map([["yoga", metrics({ discipline: "bike", hrZoneSec: [720, 720, 720, 720, 720] })]]),
      now,
    );

    expect(result.disciplineLoad.other).toBe(30);
    expect(result.buckets.unclassified).toBe(70);
    expect(result.coveragePct).toBe(0);
    expect(result.totalLoad).toBe(70);
  });

  it("honors the inclusive 28-day cutoff and excludes future activities", () => {
    const activities = [
      activity("boundary", "Run", 10, now - 28 * day),
      activity("old", "Run", 20, now - 28 * day - 1),
      activity("future", "Run", 30, now + 1),
    ];
    const map = new Map([["boundary", metrics({ discipline: "run", hrZoneSec: [3600, 0, 0, 0, 0] })]]);
    expect(computeIntegratedLoadFocus(activities, map, now).totalLoad).toBe(10);
  });

  it("keeps load unclassified when zone evidence covers less than half the activity", () => {
    const result = computeIntegratedLoadFocus(
      [activity("partial", "Ride", 100)],
      new Map([["partial", metrics({ discipline: "bike", durationSec: 3600, powerZoneSec: [0, 0, 0, 0, 1, 0, 0] })]]),
      now,
    );

    expect(result.buckets).toEqual({ baseAerobic: 0, highAerobic: 0, highIntensity: 0, unclassified: 100 });
    expect(result.sourceLoad).toEqual({ power: 0, heartRate: 0, unclassified: 100 });
    expect(result.coveragePct).toBe(0);
  });

  it("preserves the canonical precomputed, stream TSS, and stream HR-TSS precedence", () => {
    const zones = [720, 720, 720, 720, 720];
    const precomputed = activity("precomputed", "Run", 120);
    const streamPower = activity("stream-power", "Run", 0);
    const streamHeartRate = activity("stream-hr", "Run", 0);
    streamHeartRate.summary.relativeEffort = 70;

    expect(computeIntegratedLoadFocus(
      [precomputed],
      new Map([["precomputed", metrics({ discipline: "run", tss: 90, streamTrimpTss: 85, hrZoneSec: zones })]]),
      now,
    ).totalLoad).toBe(120);
    expect(computeIntegratedLoadFocus(
      [streamPower],
      new Map([["stream-power", metrics({ discipline: "run", tss: 90, streamTrimpTss: 85, hrZoneSec: zones })]]),
      now,
    ).totalLoad).toBeCloseTo(90, 10);
    expect(computeIntegratedLoadFocus(
      [streamHeartRate],
      new Map([["stream-hr", metrics({ discipline: "run", tss: null, streamTrimpTss: 85, hrZoneSec: zones })]]),
      now,
    ).totalLoad).toBeCloseTo(85, 10);
  });
});

describe("computeCyclingAbility", () => {
  it("builds three PDC axes from measured evidence and duration percentiles", () => {
    const pdc = parsePersistedPdc(riderParity.persistedPdc);

    const result = computeCyclingAbility(pdc)!;
    expect(result.axes.map((axis) => axis.score)).toEqual([79, 70, 64]);
    expect(result.axes.every((axis) => axis.confidence === "high")).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("suppresses ability when there are fewer than five canonical activities", () => {
    const pdc = {
      activityCount: 3,
      mmpAll: { "5m": { value: 300 } },
      wPerKgAtKey: { "5m": 4.2 },
      ability: { overallPercentile: 55, byDuration: [{ duration: "5m", wPerKg: 4.2, percentile: 55 }] },
    } as unknown as PdcDoc;
    expect(computeCyclingAbility(pdc)).toBeNull();
  });

  it("rejects a legacy PDC before it reaches the ability surface", () => {
    expect(computeCyclingAbility({ activityCount: 4 } as PdcDoc)).toBeNull();
  });

  it("rejects raw evidence without the canonical classification gate", () => {
    expect(computeCyclingAbility({
      activityCount: 20,
      mmpAll: { "5s": { value: 900 }, "1m": { value: 500 } },
      wPerKgAtKey: { "5s": 12, "1m": 7 },
    } as PdcDoc)).toBeNull();
  });
});

describe("authoritativeCombinedLoad", () => {
  it("keeps authoritative totals when a legacy document has no breakdown", () => {
    const result = authoritativeCombinedLoad({
      totalCTL: 42,
      totalATL: 35,
      totalTSB: 7,
      updatedAt: now,
    } as UserFitness, now);

    expect(result).toEqual({ ctl: 42, atl: 35, tsb: 7, contributions: [] });
  });

  it("rejects non-finite totals and stale server documents", () => {
    const base = {
      totalCTL: 42,
      totalATL: 35,
      totalTSB: 7,
      updatedAt: now,
      breakdown: {},
    } as unknown as UserFitness;

    expect(authoritativeCombinedLoad({ ...base, totalCTL: Number.NaN }, now)).toBeNull();
    expect(authoritativeCombinedLoad({ ...base, updatedAt: now - STALE_THRESHOLD_MS - 1 }, now)).toBeNull();
    expect(authoritativeCombinedLoad({ ...base, updatedAt: Number.NaN }, now)).toBeNull();
  });
});

describe("sport evidence", () => {
  it("uses only real run threshold and best persisted records", () => {
    const result = buildRunEvidence(285, {
      "5km": [
        { value: 1300, date: "2026-07-01" },
        { value: 1250, date: "2026-07-10" },
      ],
    } as never);
    expect(result.thresholdPaceSec).toBe(285);
    expect(result.records).toEqual([{ distance: "5km", seconds: 1250, date: "2026-07-10" }]);
  });

  it("averages only measured swim efficiency samples and never creates records", () => {
    const swims = [
      activity("s1", "Swim", 20),
      activity("s2", "Swim", 20, now - 89 * day),
      activity("old", "Swim", 20, now - 90 * day - 1),
      activity("future", "Swim", 20, now + 1),
    ];
    swims[0]!.summary.swolf = 40;
    const result = buildSwimEvidence(95, swims, new Map([
      ["s1", metrics({ discipline: "swim", swimMetrics: { swolfAvg: 38, strokesPerLap: 18, distancePerStroke: 1.4 } })],
      ["s2", metrics({ discipline: "swim", swimMetrics: { swolfAvg: 42, strokesPerLap: 20, distancePerStroke: 1.2 } })],
      ["old", metrics({ discipline: "swim", swimMetrics: { swolfAvg: 10, strokesPerLap: 10, distancePerStroke: 3 } })],
      ["future", metrics({ discipline: "swim", swimMetrics: { swolfAvg: 10, strokesPerLap: 10, distancePerStroke: 3 } })],
    ]), now);
    expect(result).toEqual({ windowDays: 90, cssSecPer100m: 95, swolfAvg: 40, distancePerStrokeM: 1.2999999999999998, activityCount: 2 });
  });
});
