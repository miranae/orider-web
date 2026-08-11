import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";

export const FITNESS_ZONE_WINDOW_DAYS = 28;

type ZoneMetricKey = "hrZoneSec" | "powerZoneSec";

/** 지정한 최근 기간의 존 체류시간을 합산한다. 기본은 모바일 표시 기준 28일이며, 경계 시각은 포함하고 미래 활동은 제외한다. */
export function aggregateRecentZoneSeconds(
  activities: ReadonlyArray<Pick<Activity, "id" | "startTime">>,
  metricsMap: ReadonlyMap<string, ActivityMetrics>,
  metricKey: ZoneMetricKey,
  zoneCount: number,
  now = Date.now(),
  windowDays = FITNESS_ZONE_WINDOW_DAYS,
  expectedFtp?: number,
): { counts: number[]; total: number } {
  const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
  const counts = Array.from({ length: zoneCount }, () => 0);
  let total = 0;

  for (const activity of activities) {
    if (activity.startTime < cutoff || activity.startTime > now) continue;
    const metrics = metricsMap.get(activity.id);
    // 파워 존은 계산 당시 FTP에 종속된다. 현재 정본과 다른 버킷을 현재 FTP의
    // 와트 범위로 설명하지 않도록, 같은 FTP로 계산된 메트릭만 합산한다.
    if (
      metricKey === "powerZoneSec" &&
      expectedFtp != null &&
      metrics?.contextSnapshot?.ftp !== expectedFtp
    ) continue;
    const values = metrics?.[metricKey];
    if (!values || values.length < zoneCount) continue;
    for (let i = 0; i < zoneCount; i++) {
      const value = values[i] ?? 0;
      if (!Number.isFinite(value) || value <= 0) continue;
      counts[i]! += value;
      total += value;
    }
  }

  return { counts, total };
}
