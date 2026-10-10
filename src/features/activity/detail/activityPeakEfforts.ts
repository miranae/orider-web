import type { ActivityMetrics, RidePeakEffort } from "@shared/types/activity-metrics";
import type { ActivityStreams } from "@shared/types";

/** 최고 노력은 서버가 확정한 실측 파워 창만 사용한다. 재계산하지 않는다. */
export function visiblePeakEfforts(metrics: ActivityMetrics | null, owner: boolean, invalidated = false): RidePeakEffort[] {
  if (!owner || invalidated || !metrics || metrics.discipline !== "bike" || metrics.isVirtualPower !== false
    || metrics.inputPending || metrics.inputCoverage === "pending") return [];
  const durations = new Set<number>();
  return (metrics.peakEfforts?.peaks ?? []).filter(peak => {
    if (![60, 120, 300].includes(peak.durationSec) || durations.has(peak.durationSec)
      || !Number.isFinite(peak.avgPowerW) || peak.avgPowerW <= 0
      || !Number.isFinite(peak.startOffsetSec) || peak.startOffsetSec < 0) return false;
    durations.add(peak.durationSec);
    return true;
  }).sort((a, b) => a.durationSec - b.durationSec);
}

/** route 정본의 거리(km)를 원시 경로와 다운샘플 차트의 독립 인덱스로 대응한다. */
export function resolvePeakEffortLocation(peak: RidePeakEffort | null, axis: "route" | "sensor" | undefined,
  streams: ActivityStreams | null, sampled: ReadonlyArray<{ distance: number }>) {
  if (!peak || axis !== "route" || !Number.isFinite(peak.fromKm) || !Number.isFinite(peak.toKm)
    || peak.fromKm < 0 || peak.toKm <= peak.fromKm) return null;
  const start = peak.fromKm * 1000, end = peak.toKm * 1000;
  const bounds = (values: ReadonlyArray<number> | undefined): [number, number] | undefined => {
    if (!values || values.length < 2 || Array.from(values).some((value, index) => !Number.isFinite(value)
      || value < 0 || (index > 0 && value < values[index - 1]!))
      || values[0]! > start || values[values.length - 1]! < end) return undefined;
    let first = 0;
    while (first + 1 < values.length && values[first + 1]! <= start) first++;
    const last = values.findIndex((value, index) => index > first && value >= end);
    return last > first ? [first, last] : undefined;
  };
  const raw = bounds(streams?.distance);
  if (!raw) return null;
  const chartRange = bounds(sampled.map(point => point.distance));
  const latlng = streams?.latlng;
  const validRoute = raw && latlng?.length === streams?.distance?.length
    && Array.from(latlng!.slice(raw[0], raw[1] + 1)).every(position => Array.isArray(position)
      && Number.isFinite(position[0]) && Number.isFinite(position[1])
      && Math.abs(position[0]) <= 90 && Math.abs(position[1]) <= 180);
  if (!chartRange && !validRoute) return null;
  return { chartRange, routeRange: validRoute ? { startIndex: raw![0], endIndex: raw![1] } : undefined,
    markerPosition: validRoute ? latlng![raw![1]]! : null };
}
