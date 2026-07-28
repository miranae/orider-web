import { makeRelSecAt, type StreamTimeArray } from "./streamTime";

const DEFAULT_DT_SEC = 1;
export const MAX_INFERRED_SENSOR_RATE_HZ = 4;
const MIN_INFERRED_SENSOR_COVERAGE = 0.95;

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

export function sampleDurationsSec(length: number, time: StreamTimeArray): number[] {
  if (length <= 0) return [];
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

export function totalDurationSec(length: number, time: StreamTimeArray): number {
  return sampleDurationsSec(length, time).reduce((sum, dt) => sum + dt, 0);
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

export function maxWeightedAverage(values: number[], durations: number[], windowSec: number): number | null {
  const n = Math.min(values.length, durations.length);
  if (n === 0 || windowSec <= 0) return null;

  let best: number | null = null;
  let start = 0;
  let weightedSum = 0;
  let total = 0;

  for (let end = 0; end < n; end++) {
    const v = values[end]!;
    const dt = durations[end]!;
    if (!Number.isFinite(v) || !Number.isFinite(dt) || dt <= 0) return null;
    weightedSum += v * dt;
    total += dt;

    while (start <= end && total - durations[start]! >= windowSec) {
      weightedSum -= values[start]! * durations[start]!;
      total -= durations[start]!;
      start++;
    }

    if (total >= windowSec) {
      const avg = weightedSum / total;
      best = best == null ? avg : Math.max(best, avg);
    }
  }

  return best;
}

export function weightedAverageFrom(values: number[], durations: number[], start: number, windowSec: number): number | null {
  if (windowSec <= 0) return null;
  let weightedSum = 0;
  let total = 0;
  const n = Math.min(values.length, durations.length);
  for (let i = start; i < n && total < windowSec; i++) {
    const v = values[i]!;
    const dt = durations[i]!;
    if (!Number.isFinite(v) || !Number.isFinite(dt) || dt <= 0) return null;
    weightedSum += v * dt;
    total += dt;
  }
  return total >= windowSec ? weightedSum / total : null;
}
