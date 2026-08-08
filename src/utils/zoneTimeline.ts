import { sampleDurationsSec, type SampleTiming } from "./sampleTime";
import { makeRelSecAt, type StreamTimeArray } from "./streamTime";

export interface ZoneTimelineBucket {
  /** One-based zones represented in this effort-time interval; null means no valid sample. */
  zone: number | null;
  /** Pause-safe, cumulative effort-time bounds for this bucket. */
  startSec: number;
  endSec: number;
  /** Common axis duration: keeps every series column-aligned. */
  durationSec: number;
}

export interface ZoneTimelineAxis {
  /** Shared source-time bounds, used only to retain relative stream coverage. */
  sourceStartSec: number;
  sourceEndSec: number;
  /** Pause-safe total workout time displayed by every timeline row. */
  durationSec: number;
}

interface TimelineSource {
  values: readonly number[] | undefined;
  time: StreamTimeArray;
  timing?: SampleTiming;
}

function validDuration(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function streamRelativeTimes(source: TimelineSource): Array<number | null> {
  const relSecAt = makeRelSecAt(source.time);
  return (source.values ?? []).map((_, index) => relSecAt(index));
}

function streamTimingDurationSec(source: TimelineSource): number {
  if (!source.values?.length) return 0;
  return sampleDurationsSec(source.values.length, source.time, source.timing)
    .reduce((sum, value) => sum + (validDuration(value) ? value : 0), 0);
}

/** Raw positions are safe only when they plausibly describe effort, not a long pause. */
function hasTrustedRawCoverage(
  relativeTimes: readonly (number | null)[],
  timingDurationSec: number,
  commonDurationSec: number,
): boolean {
  const validTimes = relativeTimes.filter((time): time is number => time != null && Number.isFinite(time));
  if (validTimes.length < 2 || !validDuration(timingDurationSec) || !validDuration(commonDurationSec)) return false;
  const spanSec = Math.max(...validTimes) - Math.min(...validTimes);
  // A partially recorded sensor may legitimately cover half the common workout,
  // but a raw span many times larger than moving time is a pause-contaminated axis.
  return spanSec >= timingDurationSec * 0.45 && spanSec <= Math.max(timingDurationSec, commonDurationSec) * 1.25;
}

/**
 * Adds the elapsed hole between explicitly separate measured runs. The stream
 * duration intentionally stays on the moving-time axis; this extra interval is
 * only a display candidate, so a missing sensor run cannot inherit a zone.
 */
function segmentGapDurationsSec(
  relativeTimes: readonly (number | null)[],
  durations: readonly number[],
  segmentStarts: readonly boolean[] | undefined,
): number[] {
  return durations.map((_, index) => {
    if (index === 0 || segmentStarts?.[index] !== true) return 0;
    const previousTime = relativeTimes[index - 1];
    const startTime = relativeTimes[index];
    if (previousTime == null || startTime == null) return 0;
    // Moving-time summaries can replace supplied durations with uniform effort
    // durations. Prefer an adjacent raw interval from either measured run to
    // recover the elapsed sensor hole; fall back to the sample duration when
    // neither run contains a neighbouring timestamp.
    const neighbouringIntervals = [
      index > 1 && segmentStarts?.[index - 1] !== true
        ? previousTime - relativeTimes[index - 2]!
        : undefined,
      index + 1 < relativeTimes.length && segmentStarts?.[index + 1] !== true
        ? relativeTimes[index + 1]! - startTime
        : undefined,
    ].filter(validDuration);
    const previousDuration = neighbouringIntervals.length > 0
      ? Math.min(...neighbouringIntervals)
      : durations[index - 1];
    if (!validDuration(previousDuration)) return 0;
    return Math.max(0, startTime - previousTime - previousDuration);
  });
}

/**
 * Finds one pause-safe effort axis for all sensor rows. Source timestamps retain
 * each stream's start/end and gaps; their span is scaled into moving time rather
 * than allowing an elapsed pause to become zone time.
 */
export function resolveZoneTimelineAxis(
  sources: readonly TimelineSource[],
  movingDurationSec?: number,
): ZoneTimelineAxis | null {
  const sourceTimes: number[] = [];
  let fallbackDurationSec = 0;
  for (const source of sources) {
    if (!source.values?.length) continue;
    const duration = streamTimingDurationSec(source);
    fallbackDurationSec = Math.max(fallbackDurationSec, duration);
  }
  const durationSec = validDuration(movingDurationSec) ? movingDurationSec : fallbackDurationSec;
  if (!validDuration(durationSec)) return null;
  for (const source of sources) {
    const relativeTimes = streamRelativeTimes(source);
    if (!hasTrustedRawCoverage(relativeTimes, streamTimingDurationSec(source), durationSec)) continue;
    relativeTimes.forEach((timestamp) => {
      if (timestamp != null && Number.isFinite(timestamp)) sourceTimes.push(timestamp);
    });
  }
  // No sensor has a trustworthy raw clock (for example, it contains a long stop).
  // The shared coordinate is then the contiguous effort clock itself.
  if (sourceTimes.length === 0) return { sourceStartSec: 0, sourceEndSec: durationSec, durationSec };
  const sourceStartSec = Math.min(...sourceTimes);
  const sourceEndSec = Math.max(...sourceTimes);
  return {
    sourceStartSec,
    // A one-sample stream still occupies the first effort interval without a divide-by-zero.
    sourceEndSec: sourceEndSec > sourceStartSec ? sourceEndSec : sourceStartSec + 1,
    durationSec,
  };
}

/**
 * Buckets a sensor stream on a shared pause-safe effort axis. Invalid values are
 * intentionally retained as `null` candidates: a long missing run must render as
 * no data rather than borrowing the nearest valid zone.
 */
export function buildZoneTimeline(
  values: readonly number[] | undefined,
  time: StreamTimeArray,
  resolveZone: (value: number) => number | null,
  timing?: SampleTiming,
  bucketCount = 32,
  axis?: ZoneTimelineAxis | null,
): ZoneTimelineBucket[] {
  if (!values?.length || !Number.isSafeInteger(bucketCount) || bucketCount <= 0) return [];
  const resolvedAxis = axis ?? resolveZoneTimelineAxis([{ values, time, timing }]);
  if (!resolvedAxis) return [];
  const durations = sampleDurationsSec(values.length, time, timing);
  const relativeTimes = streamRelativeTimes({ values, time, timing });
  const timingDurationSec = durations.reduce((sum, value) => sum + (validDuration(value) ? value : 0), 0);
  const buckets = Array.from({ length: bucketCount }, () => new Map<number | null, number>());
  const sourceSpanSec = resolvedAxis.sourceEndSec - resolvedAxis.sourceStartSec;

  const addCandidate = (zone: number | null, startSec: number, endSec: number) => {
    let cursorSec = Math.max(0, startSec);
    const cappedEndSec = Math.min(resolvedAxis.durationSec, endSec);
    while (cursorSec < cappedEndSec) {
      const bucketIndex = Math.min(bucketCount - 1, Math.floor((cursorSec / resolvedAxis.durationSec) * bucketCount));
      const bucketEndSec = ((bucketIndex + 1) / bucketCount) * resolvedAxis.durationSec;
      const portionSec = Math.min(cappedEndSec, bucketEndSec) - cursorSec;
      if (portionSec <= 0) break;
      const bucket = buckets[bucketIndex]!;
      bucket.set(zone, (bucket.get(zone) ?? 0) + portionSec);
      cursorSec += portionSec;
    }
  };

  if (hasTrustedRawCoverage(relativeTimes, timingDurationSec, resolvedAxis.durationSec)) {
    const validTimes = relativeTimes.filter((timestamp): timestamp is number => timestamp != null && Number.isFinite(timestamp));
    const coverageStartSec = Math.max(0, Math.min(resolvedAxis.durationSec,
      ((Math.min(...validTimes) - resolvedAxis.sourceStartSec) / sourceSpanSec) * resolvedAxis.durationSec));
    const coverageEndSec = Math.max(coverageStartSec, Math.min(resolvedAxis.durationSec,
      ((Math.max(...validTimes) - resolvedAxis.sourceStartSec) / sourceSpanSec) * resolvedAxis.durationSec));
    const coverageDurationSec = coverageEndSec - coverageStartSec;
    const gaps = segmentGapDurationsSec(relativeTimes, durations, timing?.segmentStarts);
    const gapDurationSec = gaps.reduce((sum, duration) => sum + duration, 0);
    const sourceDurationSec = timingDurationSec + gapDurationSec;
    let cursorSec = coverageStartSec;
    values.forEach((value, index) => {
      const durationSec = durations[index];
      if (!validDuration(durationSec)) return;
      const gapDuration = gaps[index] ?? 0;
      if (gapDuration > 0 && validDuration(sourceDurationSec)) {
        const nextGapSec = cursorSec + (gapDuration / sourceDurationSec) * coverageDurationSec;
        addCandidate(null, cursorSec, nextGapSec);
        cursorSec = nextGapSec;
      }
      const nextSec = cursorSec + (durationSec / sourceDurationSec) * coverageDurationSec;
      addCandidate(Number.isFinite(value) ? resolveZone(value) : null, cursorSec, nextSec);
      cursorSec = nextSec;
    });
  } else if (validDuration(timingDurationSec)) {
    let cursorSec = 0;
    values.forEach((value, index) => {
      const durationSec = durations[index];
      if (!validDuration(durationSec)) return;
      const nextSec = cursorSec + (durationSec / timingDurationSec) * resolvedAxis.durationSec;
      addCandidate(Number.isFinite(value) ? resolveZone(value) : null, cursorSec, nextSec);
      cursorSec = nextSec;
    });
  }

  return buckets.map((candidates, index) => {
    let zone: number | null = null;
    let longestSec = -1;
    for (const [candidate, seconds] of candidates) {
      // Deterministic ties favour the lower numeric zone; a longer null interval remains no data.
      if (seconds > longestSec || (seconds === longestSec && candidate != null && (zone == null || candidate < zone))) {
        zone = candidate;
        longestSec = seconds;
      }
    }
    return {
      zone,
      startSec: (index / bucketCount) * resolvedAxis.durationSec,
      endSec: ((index + 1) / bucketCount) * resolvedAxis.durationSec,
      durationSec: resolvedAxis.durationSec / bucketCount,
    };
  });
}
