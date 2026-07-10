import { describe, expect, it } from "vitest";
import { calculateVirtualPowerTool } from "./virtualPowerTool";

describe("calculateVirtualPowerTool", () => {
  it("wraps the virtual power stream into guest-facing watts, TSS, FTP, and distance estimates", () => {
    const result = calculateVirtualPowerTool({
      speedKmh: 28,
      gradePercent: 3,
      durationMin: 40,
      riderWeightKg: 68,
      bikeWeightKg: 9,
      ftp: 220,
    });

    expect(result.averageWatts).toBeGreaterThan(100);
    expect(result.estimatedTss).toBeGreaterThan(0);
    expect(result.ftpEstimate).toBe(Math.round(result.averageWatts * 0.95));
    expect(result.distanceKm).toBe(18.7);
  });
});
