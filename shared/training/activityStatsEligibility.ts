/** 누적·기간 거리 통계의 인입 시 고정 정책. 훈련 부하의 수집 대상과 구분한다. */
export function isStatsCountable(activity: { source?: unknown; statsCountable?: unknown } | undefined): boolean {
  const source = activity?.source;
  if (source == null || source === "strava" || source === "orider") return true;
  return (source === "apple_health" || source === "health_connect" || source === "samsung_health")
    && activity?.statsCountable === true;
}
