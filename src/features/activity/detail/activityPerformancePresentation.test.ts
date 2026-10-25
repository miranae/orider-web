import { describe, expect, it } from "vitest";
import { withStravaChartSummary, withCanonicalChartSummary, getPerformanceOverlays } from "./activityPerformancePresentation";
import { buildChartOverlays } from "./activityDetailDerived";
import type { SampledPoint } from "./activityDetailUtils";
const point = (speed: number, heartRate: number | null = null, power: number | null = null): SampledPoint => ({
  speed, heartRate, power, cadence: 0, distance: 10, altitude: 0, latlng: null,
});
describe("shared performance chart presentation", () => {
  it("shows running pace as mm:ss and preserves stops/missing samples as gaps", () => {
    const points = [point(12, 140), point(0, null), point(Number.NaN, 150)];
    const configs = getPerformanceOverlays(points, "run", "metric", "spm", "cadence");
    const pace = configs.find(cfg => cfg.key === "speed")!;
    expect(pace.label).toBe("pace"); expect(pace.unit).toBe("min/km");
    expect(pace.getValue(points[0]!)).toBe(5); expect(pace.formatValue?.(5.5)).toBe("5:30");
    const data = buildChartOverlays(configs, new Set(["speed", "hr"]), points, key => key);
    expect(data[0]?.data).toEqual([5, null, null]); expect(data[0]?.reverseAxis).toBe(true);
    expect(data[1]?.data).toEqual([140, null, 150]);
    expect(configs.some(cfg => cfg.key === "power")).toBe(false);
  });
  it("converts running imperial pace once and keeps cycling speed/power units", () => {
    const points = [point(12, null, 150)];
    const pace = getPerformanceOverlays(points, "run", "imperial", null, "cadence")[0]!;
    expect(pace.getValue(points[0]!)).toBeCloseTo(8.04672); expect(pace.formatValue?.(8.04672)).toBe("8:03");
    const cycling = getPerformanceOverlays(points, "ride", "metric", null, "cadence");
    expect(cycling[0]?.unit).toBe("km/h"); expect(cycling[0]?.getValue(points[0]!)).toBe(12);
    expect(cycling.find(cfg => cfg.key === "power")?.unit).toBe("W");
    expect(cycling.some(cfg => cfg.key === "hr")).toBe(false);
  });
});


it("keeps canonical averages when public metrics omit private maxima", () => {
  const observed = {minElev:0,maxElev:229,overlays:{hr:{avg:143,max:183},power:{avg:103,max:1893},speed:{avg:19.1,max:43.2}}};
  const result = withCanonicalChartSummary(observed, {avgHr:144,avgPower:102,avgSpeedKph:20.9});
  expect(result?.overlays).toEqual({hr:{avg:144,max:183},power:{avg:102,max:1893},speed:{avg:20.9,max:43.2}});
  expect(observed.overlays.hr.avg).toBe(143);
  expect(withCanonicalChartSummary(observed, null)).toBe(observed);
});

it("keeps Strava whole-activity chart headings on the same provider values as the overview", () => {
  const observed = { minElev: 0, maxElev: 100, overlays: { speed: { avg: 25.2, max: 54.2 }, power: { avg: 120, max: 780 } } };
  const activity = { source: "strava", stravaSummaryV1: { version: 1, average_speed: 25.6 / 3.6, max_speed: 60.4 / 3.6, average_watts: 120.9 } } as unknown as import("@shared/types").Activity;
  const result = withStravaChartSummary(observed, activity);
  expect(result?.overlays.speed.avg).toBeCloseTo(25.6); expect(result?.overlays.speed.max).toBeCloseTo(60.4);
  expect(result?.overlays.power.avg).toBe(120.9); expect(observed.overlays.speed.max).toBe(54.2);
});
