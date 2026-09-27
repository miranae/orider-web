import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { acceptedTrainingActivities, sumActivityTss } from "./estimateTSS";
import { planDayKey } from "@shared/training/planDate";

describe("조회 입력셋의 대표 선정 후 부하 기간 배분", () => {
  it.each([
    ["month/day", "2026-09-30T23:59:45+09:00", "2026-10-01T00:00:15+09:00"],
    ["week/day", "2026-10-04T23:59:45+09:00", "2026-10-05T00:00:15+09:00"],
  ])("%s 경계 쌍둥이는 대표 날짜에만 합산한다", (_name, nativeTime, stravaTime) => {
    const native = { id: "native", userId: "fixture-owner", source: "orider", type: "Ride",
      startTime: Date.parse(nativeTime), summary: { ridingTimeMillis: 3600000, tss: 100 } } as Activity;
    const imported = { ...native, id: "strava_1", source: "strava", startTime: Date.parse(stravaTime) } as Activity;
    const input = [native, imported];
    const representatives = acceptedTrainingActivities(input);
    expect(representatives.map((activity) => activity.id)).toEqual(["strava_1"]);
    const buckets = new Map<string, Activity[]>();
    for (const activity of representatives) {
      const day = planDayKey(activity.startTime);
      buckets.set(day, [...(buckets.get(day) ?? []), activity]);
    }
    const total = [...buckets.values()].reduce((sum, members) => sum + (sumActivityTss(members).value ?? 0), 0);
    expect(total).toBe(sumActivityTss(input).value);
    expect(total).toBe(100);
    expect(buckets.has(planDayKey(native.startTime))).toBe(false);
    expect(sumActivityTss([])).toEqual({ value: null, estimated: false, unknownCount: 0 });
  });
});
