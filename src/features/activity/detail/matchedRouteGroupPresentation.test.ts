import { describe, expect, it } from "vitest";
import type { ActivityMatchedRouteGroupMember, ActivityMatchedRouteGroupResponse } from "@shared/activity-matched-route-groups";
import { matchedRouteAverage, matchedRoutePresentation } from "./matchedRouteGroupPresentation";
const row = (speed: number | null, discipline: "bike" | "run" = "bike", index = 0): ActivityMatchedRouteGroupMember => ({ activityId: `record-${index}`, startTime: 1790000000000 + index * 86400000, year: 2026, isAnchor: index === 0, rankingEligible: speed !== null && speed > 0, rankingExclusionReason: null,
  canonicalAverage: { state: "available", reason: null, metricsRevision: "a".repeat(64), version: 41, discipline, startTime: 1790000000000 + index * 86400000, computedAt: 1791000000000, avgSpeedKph: speed, inputCoverage: "complete", sourceLayer: "raw_parts" } });
const pages = (members: ActivityMatchedRouteGroupMember[]) => [{ members }] as ActivityMatchedRouteGroupResponse[];
describe("member scalar presentation without an Activity or summary fallback", () => {
  it("uses exact reciprocal pace and imperial dimensions; bike zero and run zero differ", () => {
    expect(matchedRouteAverage(row(12, "run"), "run", "metric")).toEqual({ value: 300, formatted: "5:00/km" });
    expect(matchedRouteAverage(row(12, "run"), "run", "imperial").value).toBe(300 * 1.609344);
    expect(matchedRouteAverage(row(16.09344), "bike", "imperial").value).toBeCloseTo(10);
    expect(matchedRouteAverage(row(0), "bike", "metric")).toEqual({ value: 0, formatted: "0.0km/h" });
    expect(matchedRouteAverage(row(0, "run"), "run", "metric").value).toBeNull();
    expect(matchedRouteAverage(row(null), "bike", "metric").value).toBeNull();
  });
  it("keeps nonrepresentable unit extremes as per-point gaps and finite tiny values readable", () => {
    expect(matchedRouteAverage(row(2.4e-305, "run"), "run", "imperial").value).toBeNull();
    expect(matchedRouteAverage(row(1e308), "bike", "imperial").value).toBeNull();
    expect(matchedRouteAverage(row(Number.MIN_VALUE), "bike", "imperial").value).toBeNull();
    expect(matchedRouteAverage(row(1e-10), "bike", "metric").formatted).toContain("E");
  });
  it.each(["bike", "run"] as const)("has faster averages at the top for %s with null gaps and activity dates", discipline => {
    const members = [row(6, discipline, 0), row(null, discipline, 1), row(18, discipline, 2)];
    const input = JSON.stringify(members), data = matchedRoutePresentation(pages(members), discipline, "metric", null);
    expect(data.known).toBe(2); expect(data.points[1]!.y).toBeNull(); expect(data.points[2]!.y).toBe(25); expect(data.points[0]!.y).toBe(125);
    expect(data.points[1]!.x).toBe(180); expect(JSON.stringify(members)).toBe(input);
  });
  it("filters only received years and leaves complete grouping counts in the response", () => {
    const members = [row(10), { ...row(12, "bike", 1), year: 2025 }], data = matchedRoutePresentation(pages(members), "bike", "metric", 2025);
    expect(data.rows).toHaveLength(1); expect(data.allCount).toBe(2); expect(data.points[0]!.x).toBe(180);
  });
});
