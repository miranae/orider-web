import { inferUniformSampleTimeAxis } from "../../../utils/sampleTime";

export type LegacySensorCoverageChannel = "heart_rate" | "cadence";

interface LegacySensorCoverageInput {
  channel: LegacySensorCoverageChannel;
  hasAlignedShapeEvidence?: boolean;
  hasInvalidTimeEvidence?: boolean;
  values: readonly number[];
  routeTime?: readonly number[];
  trustedDurationSec?: number;
}

interface RelativeTimeAxis {
  time: number[];
  durationSec: number;
  stepSec: number;
}

const COVERAGE_RULES = {
  heart_rate: { edgeRatio: 0.1, binRatio: 0.8, gapRatio: 0.2 },
  // A zero cadence can be a real coast rather than a missing sensor sample. Require
  // broad session evidence, but allow longer zero runs than heart rate.
  cadence: { edgeRatio: 0.2, binRatio: 0.6, gapRatio: 0.4 },
} as const;
const MIN_TRUSTED_DURATION_AGREEMENT = 0.95;

function validDuration(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function routeTimeAxis(routeTime: readonly number[] | undefined): RelativeTimeAxis | undefined {
  if (!routeTime || routeTime.length < 2) return undefined;
  if (routeTime.some((sample) => !Number.isFinite(sample) || sample < 0)) return undefined;
  const divisor = routeTime[0]! >= 1_000_000_000_000 ? 1000 : 1;
  const time = routeTime.map((sample) => (sample - routeTime[0]!) / divisor);
  const deltas = time.slice(1).map((sample, index) => sample - time[index]!);
  if (deltas.some((delta) => delta <= 0)) return undefined;
  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const stepSec = sortedDeltas[Math.floor(sortedDeltas.length / 2)]!;
  return { time, durationSec: time[time.length - 1]! + stepSec, stepSec };
}

function inferredTimeAxis(length: number, durationSec: number): RelativeTimeAxis | undefined {
  const time = inferUniformSampleTimeAxis(length, durationSec);
  if (!time) return undefined;
  return { time, durationSec, stepSec: durationSec / length };
}

function measurementAxis({
  values,
  routeTime,
  trustedDurationSec,
}: LegacySensorCoverageInput): RelativeTimeAxis | undefined {
  const routeAxis = routeTimeAxis(routeTime);
  const summaryDuration = validDuration(trustedDurationSec);
  const trustedDuration = summaryDuration ?? routeAxis?.durationSec;
  if (routeAxis?.time.length === values.length && trustedDuration != null) {
    const durationRatio = routeAxis.durationSec / trustedDuration;
    if (summaryDuration == null || (durationRatio >= MIN_TRUSTED_DURATION_AGREEMENT
      && durationRatio <= 1 / MIN_TRUSTED_DURATION_AGREEMENT)) {
      return { ...routeAxis, durationSec: trustedDuration };
    }
  }
  return trustedDuration == null ? undefined : inferredTimeAxis(values.length, trustedDuration);
}

/**
 * Legacy sensor arrays use zero for a missing value and are indexed with the route
 * track points. Accept them only when positive measurements represent the whole
 * trusted session, independently of the route sampling frequency.
 */
export function legacySensorMeasurementsCoverSession(input: LegacySensorCoverageInput): boolean {
  const { channel, values } = input;
  const positiveIndexes = values.flatMap((value, index) => value > 0 ? [index] : []);
  if (positiveIndexes.length < 2) return false;

  const axis = measurementAxis(input);
  // A fully measured channel has no sentinel ambiguity even when old data omitted
  // both route time and summary duration. Mixed zero channels need temporal proof.
  if (!axis) {
    const hasTemporalEvidence = input.routeTime != null
      || validDuration(input.trustedDurationSec) != null
      || input.hasInvalidTimeEvidence === true;
    return !hasTemporalEvidence
      && input.hasAlignedShapeEvidence === true
      && positiveIndexes.length === values.length;
  }

  const { edgeRatio, binRatio, gapRatio } = COVERAGE_RULES[channel];
  const positiveTimes = positiveIndexes.map((index) => axis.time[index]!);
  if (positiveTimes.some((time) => !Number.isFinite(time))) return false;
  const first = positiveTimes[0]!;
  const lastEnd = Math.min(axis.durationSec, positiveTimes[positiveTimes.length - 1]! + axis.stepSec);
  if (first / axis.durationSec > edgeRatio
    || (axis.durationSec - lastEnd) / axis.durationSec > edgeRatio) return false;

  const binCount = Math.min(10, values.length);
  const occupiedBins = new Set(positiveTimes.map((time) => Math.min(
    binCount - 1,
    Math.floor(time / axis.durationSec * binCount),
  )));
  if (occupiedBins.size < Math.ceil(binCount * binRatio)) return false;

  let maxMissingGapSec = Math.max(first, axis.durationSec - lastEnd);
  for (let index = 1; index < positiveTimes.length; index++) {
    const missingGapSec = positiveTimes[index]! - positiveTimes[index - 1]! - axis.stepSec;
    maxMissingGapSec = Math.max(maxMissingGapSec, missingGapSec);
  }
  return maxMissingGapSec / axis.durationSec <= gapRatio;
}
