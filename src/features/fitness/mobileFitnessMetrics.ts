import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";

export const FITNESS_ZONE_WINDOW_DAYS = 28;

type ZoneMetricKey = "hrZoneSec" | "powerZoneSec";

/** 지정한 최근 기간의 존 체류시간을 합산한다. 기본은 모바일 표시 기준 28일이며, 경계 시각은 포함하고 미래 활동은 제외한다. */
export function aggregateRecentZoneSeconds(
  activities: ReadonlyArray<Pick<Activity, "id" | "startTime">>,
  metricsMap: ReadonlyMap<string, ActivityMetrics>,
  metricKey: ZoneMetricKey,
  now = Date.now(),
  windowDays = FITNESS_ZONE_WINDOW_DAYS,
): { counts: number[]; total: number } {
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const zoneCount = metricKey === "powerZoneSec" ? 7 : 5;
  const counts = Array.from({ length: zoneCount }, () => 0);
  let total = 0;

  for (const activity of activities) {
    if (activity.startTime < cutoff || activity.startTime > now) continue;
    const values = metricsMap.get(activity.id)?.[metricKey];
    // 잘린 배열의 없는 존을 0초로 추정하지 않는다. 한 활동의 전체 존 자료가 유효해야 합산한다.
    if (!Array.isArray(values) || values.length !== zoneCount
      || !values.every((value) => Number.isFinite(value) && value >= 0)) continue;
    for (let i = 0; i < zoneCount; i++) {
      const value = values[i]!;
      counts[i]! += value;
      total += value;
    }
  }

  return { counts, total };
}
