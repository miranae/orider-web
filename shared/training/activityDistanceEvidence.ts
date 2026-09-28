/** 숫자 호환값을 관측 거리로 승격한다. 다른 지표의 서빙 상태는 바꾸지 않는다. */
export function resolveObservedDistanceKm(
  metrics: { distanceKm?: unknown; distanceSource?: unknown; version?: unknown },
  recordedSummaryMeters?: unknown,
): number | null {
  const distance = metrics.distanceKm;
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) return null;
  if (Object.prototype.hasOwnProperty.call(metrics, "distanceSource")) {
    return metrics.distanceSource === "recorded_summary" || metrics.distanceSource === "stream_counter" ? distance : null;
  }
  if (typeof metrics.version === "number" && metrics.version >= 32) return null;
  return distance > 0 || recordedSummaryMeters === 0 ? distance : null;
}
