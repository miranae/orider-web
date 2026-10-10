import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { activityPeriods, comparableCurves, comparisonRows, customActivityPeriods, sameActivitySport, summarizePeriod } from "./activityGrowth";
const activity = (startTime: number, distance: number | null = 1000) => ({ id: String(startTime), type: "Run", startTime, summary: { distance, movingTimeSec: 300, elevationGain: 0 } }) as unknown as Activity;
describe("activity growth presentation", () => {
  it("compares aliases but keeps different sports separate", () => {
    expect(sameActivitySport(activity(0), { ...activity(1), type: "running" })).toBe(true);
    expect(sameActivitySport(activity(0), { ...activity(1), type: "Ride" })).toBe(false);
    expect(sameActivitySport({ ...activity(0), type: "Yoga" }, { ...activity(1), type: "Hike" })).toBe(false);
  });
  it("preserves missing values and unknown distance provenance", () => {
    const rows = comparisonRows({ distanceKm: 0, distanceSource: null, avgSpeedKph: 12 }, { distanceKm: 5, avgSpeedKph: 10 }, true);
    expect(rows[0]).toMatchObject({ value: null, baseline: 5, delta: null });
    expect(rows[2]).toMatchObject({ value: 300, baseline: 360, delta: -60 });
    expect(rows[4]?.delta).toBeNull();
  });
  it("withholds power deltas when provenance is unknown or differs", () => {
    expect(comparisonRows({ avgPower: 200, isVirtualPower: true }, { avgPower: 180, isVirtualPower: false }, false)[4]?.delta).toBeNull();
    expect(comparisonRows({ avgPower: 200 }, { avgPower: 180 }, false)[4]?.delta).toBeNull();
    expect(comparisonRows({ avgPower: 200, isVirtualPower: false }, { avgPower: 180, isVirtualPower: false }, false)[4]?.delta).toBe(20);
    expect(comparisonRows({ avgPower: 200, inputPending: true }, {}, false)[4]?.value).toBeNull();
  });
  it.each(["current", "previous"])("withholds pending %s values and curves", (side) => {
    const ready = { distanceKm: 5, mmp: { "1m": 200 } };
    const pending = { ...ready, inputCoverage: "pending" as const };
    const current = side === "current" ? pending : ready;
    const previous = side === "previous" ? pending : ready;
    expect(comparisonRows(current, previous, false)[0]?.delta).toBeNull();
    expect(comparableCurves(current, previous, true)).toEqual([]);
  });
  it("compares only shared server curve windows", () => {
    expect(comparableCurves({ isVirtualPower: false, mmp: { "1m": 300, "5m": 200 } }, { isVirtualPower: false, mmp: { "1m": 250 } }, true)).toEqual([{ duration: 60, value: 300, baseline: 250, delta: 50 }]);
  });
  it("withholds incompatible or unknown power curves and invalid speed windows", () => {
    const power = { mmp: { "1m": 300 }, isVirtualPower: false };
    expect(comparableCurves(power, { ...power, isVirtualPower: true }, true)).toEqual([]);
    expect(comparableCurves(power, { mmp: { "1m": 250 } }, true)).toEqual([]);
    expect(comparableCurves({ speedCurve: { "5s": 0, "1m": 12 } }, { speedCurve: { "5s": 10, "1m": 10 } }, false)).toEqual([{ duration: 60, value: 12, baseline: 10, delta: 2 }]);
  });
  it("uses Monday midnight KST and exclusive period ends", () => {
    const now = Date.parse("2026-10-05T00:00:00+09:00");
    const period = activityPeriods(now, "week");
    expect(period.start).toBe(now);
    expect(summarizePeriod([activity(now - 1), activity(now)], period.previousStart, period.previousEnd, true).sources).toHaveLength(1);
  });
  it("crosses year/month boundaries in KST", () => {
    const p = activityPeriods(Date.parse("2027-01-01T00:00:00+09:00"), "month");
    expect(p.previousStart).toBe(Date.parse("2026-12-01T00:00:00+09:00"));
  });
  it("compares calendar 3/6/12-month blocks across years without assuming equal month lengths", () => {
    const now = Date.parse("2026-03-15T12:00:00+09:00");
    expect(activityPeriods(now, "3months")).toEqual({ start: Date.parse("2026-01-01T00:00:00+09:00"), end: now + 1, previousStart: Date.parse("2025-10-01T00:00:00+09:00"), previousEnd: Date.parse("2026-01-01T00:00:00+09:00") });
    expect(activityPeriods(now, "12months").previousStart).toBe(Date.parse("2024-04-01T00:00:00+09:00"));
  });
  it("validates inclusive KST dates, leap days and bounded custom windows", () => {
    const now = Date.parse("2024-03-01T12:00:00+09:00");
    const result = customActivityPeriods("2024-02-28", "2024-02-29", now)!;
    expect(result.end).toBe(Date.parse("2024-03-01T00:00:00+09:00"));
    expect(result.previousEnd - result.previousStart).toBe(2 * 86400000);
    expect(customActivityPeriods("2023-02-29", "2024-02-29", now)).toBeNull();
    expect(customActivityPeriods("2024-02-29", "2024-03-02", now)).toBeNull();
    expect(customActivityPeriods("2024-03-01", "2024-02-29", now)).toBeNull();
    expect(customActivityPeriods("2022-01-01", "2024-02-29", now)).toBeNull();
  });
  it("withholds partial totals and missing fields rather than substituting zero", () => {
    expect(summarizePeriod([activity(100)], 0, 200, false)).toMatchObject({ count: null, distance: null });
    expect(summarizePeriod([activity(100, null)], 0, 200, true)).toMatchObject({ count: 1, distance: null, elevation: 0 });
    expect(summarizePeriod([], 0, 200, true)).toMatchObject({ count: 0, distance: 0 });
  });
  it("reports per-field observed subtotals without converting elapsed time to moving time", () => {
    const missing = { ...activity(120, null), summary: { ridingTimeMillis: 900000, elevationGain: 12 } } as unknown as Activity;
    const result = summarizePeriod([activity(100), missing], 0, 200, true);
    expect(result).toMatchObject({ count: 2, distance: null, movingTime: null, elevation: 12 });
    expect(result.fields.distance).toEqual({ total: null, observed: 1000, knownCount: 1, missingCount: 1 });
    expect(result.fields.movingTime).toEqual({ total: null, observed: 300, knownCount: 1, missingCount: 1 });
    expect(summarizePeriod([missing], 0, 200, true).fields.movingTime.observed).toBeNull();
    expect(summarizePeriod([activity(100), missing], 0, 200, false).fields.distance).toEqual({ total: null, observed: null, knownCount: null, missingCount: null });
  });
});
