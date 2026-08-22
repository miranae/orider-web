import { describe, expect, it } from "vitest";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { aggregateRecentZoneSeconds, FITNESS_ZONE_WINDOW_DAYS } from "./mobileFitnessMetrics";

describe("aggregateRecentZoneSeconds", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 6, 14);
  const activities = [
    { id: "inside", startTime: now - 2 * day },
    { id: "boundary", startTime: now - FITNESS_ZONE_WINDOW_DAYS * day },
    { id: "old", startTime: now - (FITNESS_ZONE_WINDOW_DAYS * day + 1) },
    { id: "future", startTime: now + 1 },
  ];
  const metrics = new Map<string, ActivityMetrics>([
    ["inside", { hrZoneSec: [10, 20, 30, 40, 50], powerZoneSec: [1, 2, 3, 4, 5, 6] } as ActivityMetrics],
    ["boundary", { hrZoneSec: [1, 1, 1, 1, 1], powerZoneSec: [10, 10, 10, 10, 10, 10] } as ActivityMetrics],
    ["old", { hrZoneSec: [100, 100, 100, 100, 100], powerZoneSec: [100, 100, 100, 100, 100, 100] } as ActivityMetrics],
    ["future", { hrZoneSec: [100, 100, 100, 100, 100], powerZoneSec: [100, 100, 100, 100, 100, 100] } as ActivityMetrics],
  ]);

  it("applies the same rolling 28-day cutoff to HR zones", () => {
    expect(aggregateRecentZoneSeconds(activities, metrics, "hrZoneSec", 5, now)).toEqual({
      counts: [11, 21, 31, 41, 51],
      total: 155,
    });
  });

  it("applies the same rolling 28-day cutoff to power zones", () => {
    expect(aggregateRecentZoneSeconds(activities, metrics, "powerZoneSec", 6, now)).toEqual({
      counts: [11, 12, 13, 14, 15, 16],
      total: 81,
    });
  });

  it("supports the desktop 30-day window without changing the mobile default", () => {
    expect(aggregateRecentZoneSeconds(activities, metrics, "hrZoneSec", 5, now, 30)).toEqual({
      counts: [111, 121, 131, 141, 151],
      total: 655,
    });
  });

  it("does not mix power zones computed with a different FTP into current ranges", () => {
    const ftpMetrics = new Map<string, ActivityMetrics>([
      ["inside", {
        powerZoneSec: [1, 2, 3, 4, 5, 6],
        contextSnapshot: { ftp: 250 },
      } as ActivityMetrics],
      ["boundary", {
        powerZoneSec: [10, 10, 10, 10, 10, 10],
        contextSnapshot: { ftp: 240 },
      } as ActivityMetrics],
    ]);

    expect(aggregateRecentZoneSeconds(
      activities,
      ftpMetrics,
      "powerZoneSec",
      6,
      now,
      FITNESS_ZONE_WINDOW_DAYS,
      250,
    )).toEqual({ counts: [1, 2, 3, 4, 5, 6], total: 21 });
  });
});
