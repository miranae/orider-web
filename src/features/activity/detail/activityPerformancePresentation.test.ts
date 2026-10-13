import { describe, expect, it } from "vitest";
import { getPerformanceOverlays } from "./activityPerformancePresentation";
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
