/** dev의 버전32는 파워 결측 계약이다. 거리 출처 필수 계약은 통합 계산기33부터다. */
export const DISTANCE_SOURCE_REQUIRED_SINCE_VERSION = 33;

/** 숫자 호환값을 관측 거리로 승격한다. 다른 지표의 서빙 상태는 바꾸지 않는다. */
export function resolveObservedDistanceKm(
  metrics: { distanceKm?: unknown; distanceSource?: unknown; version?: unknown },
  recordedSummaryMeters?: unknown,
): number | null {
  if (Object.prototype.hasOwnProperty.call(metrics, "version")
    && (typeof metrics.version !== "number" || !Number.isSafeInteger(metrics.version) || metrics.version < 0)) return null;
  const distance = metrics.distanceKm;
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) return null;
  if (Object.prototype.hasOwnProperty.call(metrics, "distanceSource")) {
    return metrics.distanceSource === "recorded_summary" || metrics.distanceSource === "stream_counter" ? distance : null;
  }
  if (typeof metrics.version === "number" && metrics.version >= DISTANCE_SOURCE_REQUIRED_SINCE_VERSION) return null;
  return distance > 0 || recordedSummaryMeters === 0 ? distance : null;
}
