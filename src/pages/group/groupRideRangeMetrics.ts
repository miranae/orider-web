import type { ActivityStreams } from "@shared/types";
import { clockSampleTolerance } from "./groupRideClock";

export type RideRange = { axis: "time" | "distance"; start: number; end: number };
export interface ObservedMetric { average: number | null; measuredSec: number; fraction: number | null }
export interface RideRangeMetrics {
  state: "available" | "unavailable";
  reason: "clock" | "distance" | "range" | null;
  durationSec: number | null;
  partialRange: boolean;
  metrics: Record<"hr" | "power" | "speed", ObservedMetric>;
}

/** 표본 i가 소유하는 [시각 i, 시각 i+1)만 사용한다. 마지막 표본이나 긴 공백을 연장하지 않는다. */
export function observedRideRange(stream: ActivityStreams | undefined, clock: readonly number[] | null | undefined, range: RideRange): RideRangeMetrics {
  const empty = (): Record<"hr" | "power" | "speed", ObservedMetric> => ({ hr: { average: null, measuredSec: 0, fraction: null }, power: { average: null, measuredSec: 0, fraction: null }, speed: { average: null, measuredSec: 0, fraction: null } });
  const unavailable = (reason: RideRangeMetrics["reason"]): RideRangeMetrics => ({ state: "unavailable", reason, durationSec: null, partialRange: false, metrics: empty() });
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) return unavailable("range");
  if (!clock || clock.length < 2 || clock.some((value, index) => !Number.isFinite(value) || index > 0 && value <= clock[index - 1]!)) return unavailable("clock");
  const distances = stream?.distance;
  if (range.axis === "distance" && (!distances || distances.length !== clock.length || distances.some((value, index) => !Number.isFinite(value) || value < 0 || index > 0 && value < distances[index - 1]!))) return unavailable("distance");
  const tolerance = clockSampleTolerance(clock);
  const totals = { hr: 0, power: 0, speed: 0 };
  const metrics = empty();
  let mappedMs = 0;
  for (let index = 0; index + 1 < clock.length; index++) {
    const start = clock[index]!, end = clock[index + 1]!, elapsedMs = end - start;
    let includedMs = 0;
    if (range.axis === "time") {
      includedMs = Math.max(0, Math.min(end, range.end) - Math.max(start, range.start));
    } else {
      const first = distances![index]!, last = distances![index + 1]!;
      if (first === last) includedMs = first >= range.start && first < range.end ? elapsedMs : 0;
      else {
        const from = Math.max(0, Math.min(1, (range.start - first) / (last - first)));
        const to = Math.max(0, Math.min(1, (range.end - first) / (last - first)));
        includedMs = elapsedMs * Math.max(0, to - from);
      }
    }
    mappedMs += includedMs;
    if (includedMs <= 0 || elapsedMs > tolerance) continue;
    const seconds = includedMs / 1000;
    const values = { hr: stream?.heartrate?.[index], power: stream?.watts?.[index], speed: stream?.velocity_smooth?.[index] };
    for (const key of ["hr", "power", "speed"] as const) {
      const value = values[key];
      if (typeof value !== "number" || !Number.isFinite(value) || (key === "hr" ? value <= 0 : value < 0)) continue;
      totals[key] += value * seconds * (key === "speed" ? 3.6 : 1);
      metrics[key].measuredSec += seconds;
    }
  }
  const durationSec = range.axis === "time" ? (range.end - range.start) / 1000 : mappedMs / 1000;
  const bounds = range.axis === "time" ? clock : distances!;
  const partialRange = range.start < bounds[0]! || range.end > bounds[bounds.length - 1]!;
  for (const key of ["hr", "power", "speed"] as const) {
    if (metrics[key].measuredSec > 0) metrics[key].average = totals[key] / metrics[key].measuredSec;
    metrics[key].fraction = durationSec > 0 && !(range.axis === "distance" && partialRange) ? Math.min(1, metrics[key].measuredSec / durationSec) : null;
  }
  return { state: "available", reason: null, durationSec, partialRange, metrics };
}
