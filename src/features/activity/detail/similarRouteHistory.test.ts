import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { formatSimilarRouteValue, similarRouteHistoryRows, similarRouteMetricValue, similarRouteSummary } from "./similarRouteHistory";
const activity = (id: string, startTime = 100) => ({ id, userId: "owner", startTime, type: "Ride", summary: { distance: 1609.344, movingTimeSec: 120, pauseTimeSec: 0 } }) as Activity;
describe("similar route history presentation", () => {
  it("deduplicates ids and sorts dates and exact-time ties deterministically", () => {
    const current = activity("current", 500);
    expect(similarRouteHistoryRows(current, [activity("b", 300), activity("a", 300), activity("early", 100), activity("b", 200)]).map(row => row.activity.id)).toEqual(["early", "a", "b"]);
  });
  it("preserves earlier owner same-sport outdoor nondeleted scope", () => {
    const current = activity("current", 500), previous = activity("past", 100);
    expect(similarRouteHistoryRows({ ...current, startTime: NaN }, [previous])).toEqual([]);
    expect(similarRouteHistoryRows(current, [previous, current, { ...previous, id: "foreign", userId: "other" }, { ...previous, id: "deleted", deletedAt: 1 }, { ...previous, id: "different", type: "Run" }, { ...previous, id: "future", startTime: 600 }, { ...previous, id: "sameTime", startTime: 500 }, { ...previous, id: "invalid", startTime: NaN }, { ...previous, id: "negative", startTime: -1 }, { ...previous, id: "indoor", trainer: true }]).map(row => row.activity.id)).toEqual(["past"]);
  });
  it("keeps missing, NaN and negative fields unknown without elapsed substitution", () => {
    const source = { ...activity("source"), summary: { distance: NaN, movingTimeSec: -1, pauseTimeSec: undefined, ridingTimeMillis: 300000, elapsedTimeMillis: 400000 } } as unknown as Activity;
    expect(similarRouteSummary(source)).toMatchObject({ distance: null, movingTime: null, pauseTime: null });
    expect(similarRouteSummary({ ...activity("missing"), summary: undefined } as unknown as Activity)).toMatchObject({ distance: null, movingTime: null, pauseTime: null });
  });
  it("converts only distance units, preserving seconds and valid zero", () => {
    const row = similarRouteSummary(activity("source"));
    expect(similarRouteMetricValue(row, "distance", "imperial")).toBe(1);
    expect(similarRouteMetricValue(row, "distance", "metric")).toBeCloseTo(1.609344);
    expect(similarRouteMetricValue(row, "movingTime", "imperial")).toBe(120);
    expect(formatSimilarRouteValue(row.pauseTime, "pauseTime")).toBe("0:00");
    for (const missing of [null, NaN, -1, Infinity]) expect(formatSimilarRouteValue(missing, "movingTime")).toBe("—");
    expect(formatSimilarRouteValue(3599.6, "movingTime")).toBe("60:00");
  });
});
