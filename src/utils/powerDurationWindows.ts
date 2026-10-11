import type { ActivityPowerWindowInput } from "@shared/types/activity-range-analysis";

export type AvailablePowerWindowInput = Extract<ActivityPowerWindowInput, { state: "available" }>;
export const MAX_POWER_WINDOW_POINTS = 100000;
export const MAX_POWER_WINDOW_BYTES = 4 * 1024 * 1024;
export const MAX_POWER_WINDOW_DURATIONS = 64;
const ORIGINAL_DURATIONS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-9;

/** 구간은 압축하지 않은 원래 경과시간 축. 서비스와 Worker 양쪽에서 같은 경계를 검증한다. */
export function validPowerWindowInput(input: ActivityPowerWindowInput): boolean {
  if (!input || !/^[a-f0-9]{64}$/.test(input.inputRevision) || input.algorithmVersion !== "sample-time-weighted-v1"
    || input.scope !== "selected_range" || input.timingBasis !== "elapsed"
    || !Number.isFinite(input.rangeStartElapsedSec) || input.rangeStartElapsedSec < 0
    || !Number.isFinite(input.rangeEndElapsedSec) || input.rangeEndElapsedSec <= input.rangeStartElapsedSec || input.rangeEndElapsedSec > 604800) return false;
  if (input.state === "unavailable") return ["virtual_power", "unknown_provenance", "unaligned_elapsed_axis", "missing_power", "input_limit"].includes(input.reason);
  if (input.state !== "available" || input.reason !== null || !["strava_api", "direct_file", "orider_native"].includes(input.provenance)
    || !Array.isArray(input.startsSec) || !Array.isArray(input.durationsSec) || !Array.isArray(input.watts) || !Array.isArray(input.segmentStarts)
    || !input.watts.length || input.watts.length > MAX_POWER_WINDOW_POINTS
    || [input.startsSec.length, input.durationsSec.length, input.segmentStarts.length].some(length => length !== input.watts.length)
    || input.segmentStarts[0] !== true) return false;
  let segmentDuration = 0, longest = 0;
  for (let i = 0; i < input.watts.length; i++) {
    const start = input.startsSec[i]!, duration = input.durationsSec[i]!, watts = input.watts[i]!, boundary = input.segmentStarts[i];
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(watts) || watts < 0 || typeof boundary !== "boolean"
      || start < input.rangeStartElapsedSec || start + duration > input.rangeEndElapsedSec + 1e-9) return false;
    if (i > 0) {
      const previousEnd = input.startsSec[i - 1]! + input.durationsSec[i - 1]!;
      if (start < previousEnd - 1e-9 || !boundary && Math.abs(start - previousEnd) > 1e-9) return false;
    }
    if (boundary) segmentDuration = 0;
    segmentDuration += duration; longest = Math.max(longest, segmentDuration);
  }
  return Number.isFinite(input.longestContinuousSeconds) && input.longestContinuousSeconds > 0 && near(input.longestContinuousSeconds, longest)
    && new TextEncoder().encode(JSON.stringify(input)).byteLength <= MAX_POWER_WINDOW_BYTES;
}

/** 실제 계산할 지속시간만 만든다. 곡선 사이 값을 보간해 기록으로 표시하지 않는다. */
export function powerDurationGrid(longest: number): number[] {
  if (!Number.isFinite(longest) || longest <= 0 || longest > 604800) return [];
  const durations = new Set([...ORIGINAL_DURATIONS.filter(value => value <= longest), longest]);
  const slots = MAX_POWER_WINDOW_DURATIONS - durations.size;
  for (let i = 0; i < slots; i++) {
    const value = Math.round(Math.exp(Math.log(Math.max(1, longest)) * i / Math.max(1, slots - 1)));
    if (value > 0 && value <= longest) durations.add(value);
  }
  return [...durations].sort((a, b) => a - b);
}

/** sample-time.ts maxWeightedAverage와 동일한 두 방향 표본 경계 커널. 경계 표본 일부만 창에 소유된다. */
export function maxWeightedAverage(
  values: number[],
  durations: number[],
  windowSec: number,
  segmentStarts?: readonly boolean[],
): number | null {
  const n = Math.min(values.length, durations.length);
  if (n === 0 || windowSec <= 0) return null;
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
  let segmentValues: number[] = [];
  let segmentDurations: number[] = [];
  const finishSegment = () => {
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
    segmentValues = [];
    segmentDurations = [];
  };
  for (let index = 0; index < n; index++) {
    const value = values[index]!;
    const duration = durations[index]!;
    if (!Number.isFinite(value) || !Number.isFinite(duration) || duration <= 0) {
      finishSegment();
      continue;
    }
    if (segmentStarts?.[index] && segmentValues.length > 0) finishSegment();
    segmentValues.push(value);
    segmentDurations.push(duration);
  }
  finishSegment();
  return best;
}


export interface PowerWindowPoint { durationSeconds: number; maxPower: number }
export function calculatePowerWindow(input: AvailablePowerWindowInput, durationSeconds: number): PowerWindowPoint | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > input.longestContinuousSeconds) return null;
  const maxPower = maxWeightedAverage(input.watts, input.durationsSec, durationSeconds, input.segmentStarts);
  return maxPower === null || !Number.isFinite(maxPower) ? null : { durationSeconds, maxPower };
}
