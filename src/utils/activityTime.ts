import type { StravaSummaryV1 } from "@shared/analysis/stravaRecord";
import type { ResolvedDuration } from "@shared/analysis/activityDuration";
export { resolveDuration, type ResolvedDuration } from "@shared/analysis/activityDuration";

/**
 * 표시용 평균 속도(km/h) — 시간 표시 기준과 속도 기준을 일치시킨다 (#236 후속).
 * 거리/현재 표시시간으로 재계산한다. 특히 공개 Strava 활동처럼 이동시간
 * 메트릭은 없고 start/end 경과시간만 있는 경우, 이동 기준 provider averageSpeed를
 * 그대로 표시하면 시간과 속도가 서로 다른 기준이 된다. 계산 불가 시에만 fallback을 쓴다.
 *
 * @param distanceM 거리(m)
 * @param resolved resolveDuration 결과
 * @param fallbackKph 전환 안 했을 때 쓸 기존 평균 속도(km/h)
 */
export function resolveAvgSpeedKph(distanceM: number, resolved: ResolvedDuration, fallbackKph: number, stravaRecord?: StravaSummaryV1 | null): number {
  if (stravaRecord) return stravaRecord.average_speed == null ? NaN : stravaRecord.average_speed * 3.6;
  if (resolved.displayMs > 0 && distanceM > 0) {
    return (distanceM / 1000) / (resolved.displayMs / 3_600_000);
  }
  return fallbackKph;
}

/** 표시 시간의 출처만 구분하며 시간 계산은 변경하지 않는다. */
export function durationLabelBasis(source: { elapsedTimeMillis?: number | null; startTime?: number | null; endTime?: number | null }, usingMoving: boolean): "movingTime" | "elapsedTime" | "activityTime" {
  if (usingMoving) return "movingTime";
  const knownElapsed = source.elapsedTimeMillis != null && source.elapsedTimeMillis > 0
    || source.startTime != null && source.endTime != null && source.endTime > source.startTime;
  return knownElapsed ? "elapsedTime" : "activityTime";
}
