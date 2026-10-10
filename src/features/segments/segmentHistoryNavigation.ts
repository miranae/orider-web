/** 캐시 effort ID를 canonical producer의 ID 규칙에 맞춰 전달한다. 불명확하면 현재 시도는 전달하지 않는다. */
export function segmentHistoryPath(segment: unknown, effort: unknown, activityId?: string): string {
  const safe = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(v);
  const rawSegment = typeof segment === "number" && Number.isSafeInteger(segment) && segment > 0 ? String(segment) : segment;
  if (!safe(rawSegment)) return "/segment";
  const segmentId = /^\d+$/u.test(rawSegment) ? `strava_${rawSegment}` : rawSegment;
  let effortId: string | null = safe(effort) ? effort : null;
  if (activityId?.startsWith("strava_") && (typeof effort === "number" && Number.isSafeInteger(effort) && effort > 0 || typeof effort === "string" && /^\d+$/u.test(effort))) effortId = `strava_${effort}`;
  if (!safe(activityId) || !effortId || /^\d+$/u.test(effortId)) return `/segment/${segmentId}`;
  return `/segment/${segmentId}?${new URLSearchParams({ currentActivityId: activityId, currentEffortId: effortId })}`;
}
export function segmentHistoryContext(params: URLSearchParams): { activityId: string; effortId: string } | null {
  const activityId = params.get("currentActivityId"), effortId = params.get("currentEffortId");
  const safe = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(v);
  return safe(activityId) && safe(effortId) ? { activityId, effortId } : null;
}
