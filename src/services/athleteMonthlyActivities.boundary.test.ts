import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { aggregateMonthlyActivities } from "./athleteMonthlyActivities";
import { sumActivityTss } from "../utils/estimateTSS";

describe("원본 월별 목록과 대표 부하의 기간 경계", () => {
  it("현재 달력 정책의 월 경계 양쪽 저장기록은 유지하고 대표 부하는 한 달에만 둔다", () => {
    const native = { id: "native", userId: "fixture-owner", source: "orider", type: "Ride",
      startTime: new Date(2026, 8, 30, 23, 59, 45).getTime(),
      summary: { distance: 2000, ridingTimeMillis: 3600000, tss: 100 } } as Activity;
    const imported = { ...native, id: "strava_1", source: "strava", startTime: native.startTime + 30000 } as Activity;
    const input = [native, imported];
    const rows = aggregateMonthlyActivities(input, new Date(2026, 9, 2));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ week: "2026.09", rides: 1, distance: 2, tss: null, tssEstimated: false });
    expect(rows[1]).toMatchObject({ week: "2026.10", rides: 1, distance: 2, tss: 100, tssEstimated: false });
    expect(rows.reduce((total, row) => total + (row.tss ?? 0), 0)).toBe(sumActivityTss(input).value);
  });
});
