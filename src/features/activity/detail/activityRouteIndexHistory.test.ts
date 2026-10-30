import { describe, expect, it } from "vitest";
import type { ActivityRouteIndexPageResponse } from "@shared/activity-route-index-page";
import { routeIndexAverage, routeIndexHistory, type RouteIndexCandidate } from "./activityRouteIndexHistory";
const row = (id: string, speed: number | null, startTime = 1790000000000, discipline: "run" | "bike" = "run"): RouteIndexCandidate => ({ activityId: id, startTime,
  match: {} as RouteIndexCandidate["match"], canonicalAverage: { state: "available", reason: null, version: 41, metricsRevision: "a".repeat(64), discipline, startTime, computedAt: startTime + 1, avgSpeedKph: speed, inputCoverage: "complete", sourceLayer: "raw_parts" } });
const page = (rows: RouteIndexCandidate[]) => ({ candidates: rows, pageScannedCount: rows.length, geometryPrefilteredCount: 0, sourceValidatedCount: rows.length, omitted: [] }) as unknown as ActivityRouteIndexPageResponse;
describe("received route candidate presentation", () => {
  it("uses canonical dimensions, respects imperial conversion and preserves null/bike zero/run gap", () => {
    expect(routeIndexAverage(row("run", 12), "run", "metric").value).toBe(300);
    expect(routeIndexAverage(row("run", 12), "run", "imperial").value).toBeCloseTo(482.8032);
    expect(routeIndexAverage(row("bike", 16.09344, undefined, "bike"), "bike", "imperial").value).toBeCloseTo(10);
    expect(routeIndexAverage(row("zero", 0, undefined, "bike"), "bike", "metric").value).toBe(0);
    expect(routeIndexAverage(row("zero", 0), "run", "metric").value).toBeNull();
    expect(routeIndexAverage(row("missing", null), "run", "metric").formatted).toBe("—");
    expect(routeIndexAverage(row("wrong", 10, undefined, "bike"), "run", "metric").value).toBeNull();
  });
  it("isolates finite arithmetic overflow/underflow to a point and gives small nonzero values scientific text", () => {
    expect(routeIndexAverage(row("tiny", 2.4e-305), "run", "imperial").value).toBeNull();
    expect(routeIndexAverage(row("huge", 1e308, undefined, "bike"), "bike", "imperial").value).toBeNull();
    expect(routeIndexAverage(row("underflow", Number.MIN_VALUE, undefined, "bike"), "bike", "metric").value).toBeNull();
    expect(routeIndexAverage(row("small", 1e-10, undefined, "bike"), "bike", "metric").formatted).not.toContain("0.0");
  });
  it("sorts activity dates and ties without mutation, filters received KST years locally and leaves missing gaps", () => {
    const rows = [row("b", 10), row("a", null), row("old", 12, Date.UTC(2025, 11, 31, 14, 59))];
    const before = JSON.stringify(rows), data = routeIndexHistory([page(rows)], "run", "metric", 2026);
    expect(data.rows.map(value => value.activityId)).toEqual(["a", "b"]); expect(data.points[0]!.y).toBeNull(); expect(data.known).toBe(1);
    expect(data.years).toEqual([2026, 2025]); expect(JSON.stringify(rows)).toBe(before);
    const trend = routeIndexHistory([page([row("slow", 10), row("fast", 12)])], "run", "metric", null);
    expect(trend.points.find(value => value.row.activityId === "fast")!.y).toBeLessThan(trend.points.find(value => value.row.activityId === "slow")!.y!);
  });
});
