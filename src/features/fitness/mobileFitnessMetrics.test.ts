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
    ["inside", { hrZoneSec: [10, 20, 30, 40, 50], powerZoneSec: [1, 2, 3, 4, 5, 6, 7] } as ActivityMetrics],
    ["boundary", { hrZoneSec: [1, 1, 1, 1, 1], powerZoneSec: [10, 10, 10, 10, 10, 10, 10] } as ActivityMetrics],
    ["old", { hrZoneSec: [100, 100, 100, 100, 100], powerZoneSec: [100, 100, 100, 100, 100, 100, 100] } as ActivityMetrics],
    ["future", { hrZoneSec: [100, 100, 100, 100, 100], powerZoneSec: [100, 100, 100, 100, 100, 100, 100] } as ActivityMetrics],
  ]);

  it("applies the same rolling 28-day cutoff to HR zones", () => {
    expect(aggregateRecentZoneSeconds(activities, metrics, "hrZoneSec", now)).toEqual({
      counts: [11, 21, 31, 41, 51],
      total: 155,
    });
  });

  it("applies the same rolling 28-day cutoff to power zones", () => {
    expect(aggregateRecentZoneSeconds(activities, metrics, "powerZoneSec", now)).toEqual({
      counts: [11, 12, 13, 14, 15, 16, 17],
      total: 98,
    });
  });

  it("supports the desktop 30-day window without changing the mobile default", () => {
    expect(aggregateRecentZoneSeconds(activities, metrics, "hrZoneSec", now, 30)).toEqual({
      counts: [111, 121, 131, 141, 151],
      total: 655,
    });
  });
});

it("includes Z7 in the denominator and retains historical FTP classifications", () => {
 const activities = [{ id: "old-basis", startTime: 1 }, { id: "new-basis", startTime: 2 }];
 const metrics = new Map<string, ActivityMetrics>([
  ["old-basis", { powerZoneSec: [100, 0, 0, 0, 0, 0, 100], contextSnapshot: { ftp: 175 } } as ActivityMetrics],
  ["new-basis", { powerZoneSec: [0, 100, 0, 0, 0, 0, 0], contextSnapshot: { ftp: 220 } } as ActivityMetrics],
 ]);
 expect(aggregateRecentZoneSeconds(activities, metrics, "powerZoneSec", 3)).toEqual({ counts: [100, 100, 0, 0, 0, 0, 100], total: 300 });
});
it("excludes legacy six-zone documents instead of inventing known-zero Z7", () => {
 const metrics = new Map<string, ActivityMetrics>([["legacy", { powerZoneSec: [10, 0, 0, 0, 0, 20] } as ActivityMetrics]]);
 expect(aggregateRecentZoneSeconds([{ id: "legacy", startTime: 1 }], metrics, "powerZoneSec", 2)).toEqual({ counts: [0, 0, 0, 0, 0, 0, 0], total: 0 });
});


it.each([
  ["powerZoneSec", 7, [10, 0, 0, 0, 0, 0, Number.NaN]],
  ["powerZoneSec", 7, [10, 0, 0, 0, 0, 0, -1]],
  ["powerZoneSec", 7, [10, 0, 0, 0, 0, 0, 1, 2]],
  ["hrZoneSec", 5, [10, 0, 0, 0]],
  ["hrZoneSec", 5, [10, 0, 0, 0, Number.POSITIVE_INFINITY]],
  ["hrZoneSec", 5, [10, 0, 0, 0, -1]],
] as const)("excludes the whole activity when %s evidence is incomplete or invalid", (key, count, values) => {
  const metrics = new Map<string, ActivityMetrics>([["invalid", { [key]: values } as unknown as ActivityMetrics]]);
  expect(aggregateRecentZoneSeconds([{ id: "invalid", startTime: 1 }], metrics, key, 2))
    .toEqual({ counts: Array.from({ length: count }, () => 0), total: 0 });
});

it("keeps valid HR fallback evidence when the power array is truncated", () => {
  const metrics = new Map<string, ActivityMetrics>([["ride", {
    powerZoneSec: [10, 0, 0, 0, 0, 20], hrZoneSec: [10, 20, 30, 40, 50],
  } as ActivityMetrics]]);
  const activities = [{ id: "ride", startTime: 1 }];
  expect(aggregateRecentZoneSeconds(activities, metrics, "powerZoneSec", 2).total).toBe(0);
  expect(aggregateRecentZoneSeconds(activities, metrics, "hrZoneSec", 2))
    .toEqual({ counts: [10, 20, 30, 40, 50], total: 150 });
});
