import { makeRelSecAt, type StreamTimeArray } from "./streamTime";

const DEFAULT_DT_SEC = 1;
export const MAX_INFERRED_SENSOR_RATE_HZ = 4;
const MIN_INFERRED_SENSOR_COVERAGE = 0.95;

export interface SampleTiming {
  /** Explicit duration owned by each retained sample. */
  durationsSec?: readonly number[];
  /** True at the first retained sample after a missing interval. */
  segmentStarts?: readonly boolean[];
}

/**
 * Builds an interval-start clock only when a trusted duration makes the implied
 * dense sensor rate plausible. The final sample owns the final interval, so the
 * N returned timestamps integrate to exactly durationSec.
 */
export function inferUniformSampleTimeAxis(
  length: number,
  durationSec: number | undefined,
): number[] | undefined {
  if (!Number.isSafeInteger(length) || length < 2
    || typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec <= 0) {
    return undefined;
  }
  const rateHz = length / durationSec;
  const coverage = length / Math.ceil(durationSec);
  if (coverage < MIN_INFERRED_SENSOR_COVERAGE || rateHz > MAX_INFERRED_SENSOR_RATE_HZ) return undefined;
  const intervalSec = durationSec / length;
  return Array.from({ length }, (_, index) => index * intervalSec);
}

function normalizedTimes(length: number, time: StreamTimeArray): number[] | null {
  if (length <= 0 || !time?.length) return null;
  const relSecAt = makeRelSecAt(time);
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const t = relSecAt(i);
    if (t == null || !Number.isFinite(t)) return null;
    out.push(t);
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i]! <= out[i - 1]!) return null;
  }
  return out;
}

export function sampleDurationsSec(
  length: number,
  time: StreamTimeArray,
  timing?: SampleTiming,
): number[] {
  if (length <= 0) return [];
  if (timing?.durationsSec?.length === length) {
    return timing.durationsSec.map((duration) => (
      Number.isFinite(duration) && duration > 0 ? duration : 0
    ));
  }
  const times = normalizedTimes(length, time);
  if (!times || times.length < 2) return Array(length).fill(DEFAULT_DT_SEC);

  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i]! - times[i - 1]!;
    if (Number.isFinite(dt) && dt > 0) deltas.push(dt);
  }
  if (deltas.length === 0) return Array(length).fill(DEFAULT_DT_SEC);
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? DEFAULT_DT_SEC;
  return [...deltas, median];
}

export function totalDurationSec(length: number, time: StreamTimeArray, timing?: SampleTiming): number {
  return sampleDurationsSec(length, time, timing).reduce((sum, dt) => sum + dt, 0);
}

export function weightedMean(values: number[], durations: number[]): number | null {
  const n = Math.min(values.length, durations.length);
  let weightedSum = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    const dt = durations[i]!;
    if (!Number.isFinite(v) || !Number.isFinite(dt) || dt <= 0) continue;
    weightedSum += v * dt;
    total += dt;
  }
  return total > 0 ? weightedSum / total : null;
}

export function maxWeightedAverage(
  values: number[],
  durations: number[],
  windowSec: number,
  segmentStarts?: readonly boolean[],
): number | null {
  const n = Math.min(values.length, durations.length);
  if (n === 0 || windowSec <= 0) return null;
  for (let index = 0; index < n; index++) {
    if (!Number.isFinite(values[index])
      || !Number.isFinite(durations[index])
      || durations[index]! <= 0) return null;
  }

  const maxFromSampleBoundaries = (
    segmentValues: readonly number[],
    segmentDurations: readonly number[],
  ): number | null => {
    const durationEpsilon = Number.EPSILON
      * Math.max(1, windowSec)
      * Math.max(4, segmentValues.length);
    let best: number | null = null;
    let end = 0;
    let fullDuration = 0;
    let fullWeightedSum = 0;
    for (let start = 0; start < segmentValues.length; start++) {
      while (
        end < segmentValues.length
        && fullDuration + segmentDurations[end]! < windowSec - durationEpsilon
      ) {
        fullDuration += segmentDurations[end]!;
        fullWeightedSum += segmentValues[end]! * segmentDurations[end]!;
        end++;
      }
      if (end < segmentValues.length) {
        const remainingDuration = windowSec - fullDuration;
        if (remainingDuration <= segmentDurations[end]! + durationEpsilon) {
          const average = (
            fullWeightedSum + segmentValues[end]! * remainingDuration
          ) / windowSec;
          best = best == null ? average : Math.max(best, average);
        }
      }
      if (end === start) {
        end++;
      } else {
        fullDuration -= segmentDurations[start]!;
        fullWeightedSum -= segmentValues[start]! * segmentDurations[start]!;
        if (Math.abs(fullDuration) <= durationEpsilon) fullDuration = 0;
        if (Math.abs(fullWeightedSum) <= durationEpsilon) fullWeightedSum = 0;
      }
    }
    return best;
  };

  let best: number | null = null;
  let segmentStart = 0;
  for (let segmentEnd = 1; segmentEnd <= n; segmentEnd++) {
    if (segmentEnd < n && !segmentStarts?.[segmentEnd]) continue;
    const segmentValues = values.slice(segmentStart, segmentEnd);
    const segmentDurations = durations.slice(segmentStart, segmentEnd);
    const candidates = [
      maxFromSampleBoundaries(segmentValues, segmentDurations),
      maxFromSampleBoundaries(
        [...segmentValues].reverse(),
        [...segmentDurations].reverse(),
      ),
    ];
    for (const candidate of candidates) {
      if (candidate != null) best = best == null ? candidate : Math.max(best, candidate);
    }
    segmentStart = segmentEnd;
  }
  return best;
}

export function weightedAverageFrom(
  values: number[],
  durations: number[],
  start: number,
  windowSec: number,
  segmentStarts?: readonly boolean[],
): number | null {
  if (windowSec <= 0) return null;
  let weightedSum = 0;
  let total = 0;
  const n = Math.min(values.length, durations.length);
  for (let i = start; i < n && total < windowSec; i++) {
    if (i > start && segmentStarts?.[i]) break;
    const v = values[i]!;
    const dt = durations[i]!;
    if (!Number.isFinite(v) || !Number.isFinite(dt) || dt <= 0) return null;
    weightedSum += v * dt;
    total += dt;
  }
  return total >= windowSec ? weightedSum / total : null;
}
