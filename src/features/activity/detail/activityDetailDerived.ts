import type { OverlayDataset } from "../../../components/ElevationChart";
import type { ActivityStreams, ActivitySummary } from "@shared/types";
import type { VirtualPowerParams } from "../../../utils/virtualPower";

import {
  explicitAxisRejectionReason,
  hasDenseArraySlots,
  hasValidExplicitSensorChannelValues,
  hasValidLegacySensorChannelValues,
  hasRetainedSlotMeasurementCoverage,
} from "./sensorChannelContract";
import {
  inferUniformSampleTimeAxis,
  MAX_INFERRED_SENSOR_RATE_HZ,
} from "../../../utils/sampleTime";
import {
  detectConsistentTimestampUnit,
  normalizeIsolatedTimestampEqualities,
  normalizeEpochMilliseconds,
  timestampDivisor,
} from "../../../utils/timestampUnit";
import {
  legacySensorDurationsAgree,
  legacySensorMeasurementsCoverSession,
  resolveLegacySensorMeasurementAxis,
  timeWeightedLegacySensorSummary,
  type LegacySensorAxisInput,
  type LegacySensorCoverageChannel,
  type LegacySensorCoverageInput,
} from "./legacySensorCoverage";

import {
  OVERLAY_CONFIGS,
  resolveCssColor,
  type OverlayConfig,
  type SampledPoint,
  type SegmentEffortData,
} from "./activityDetailUtils";

export interface PhotoData {
  id: string;
  url: string | null;
  caption: string | null;
  location: [number, number] | null;
}

export interface StreamSensorSummary {
  hasHeartRateStream: boolean;
  hasRejectedHeartRateStream: boolean;
  hasCadenceStream: boolean;
  hasRejectedCadenceStream: boolean;
  hasPowerStream: boolean;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averageCadence: number | null;
  maxCadence: number | null;
  averagePower: number | null;
  maxPower: number | null;
  hasReliablePower: boolean;
  hasRejectedPowerStream: boolean;
  heartRateSource: "sensorStreamsV1" | "heartrate" | null;
  powerSource: "sensorStreamsV1" | "virtualPowerOverride" | "watts" | "watts_calc" | null;
  rejections: SensorRejectionDiagnostic[];
}

export interface ActivitySensorSelectionContext {
  /** Moving-time duration used by compact legacy sensor arrays. */
  legacyDurationSec?: number;
  /** Wall-clock duration used by null-filled explicit V1 axes. */
  explicitDurationSec?: number;
  activityStartTime?: number;
  powerOverride?: ActivityPowerOverrideProvenance;
}

export interface ActivityPowerOverride {
  source: "virtualPowerOverride";
  activityId: string;
  sourceFingerprint: string;
  params: VirtualPowerParams;
  values: number[];
  time: number[];
}

export type ActivityPowerOverrideProvenance = Pick<ActivityPowerOverride, "source" | "time">;

export type SensorRejectionReason =
  | "invalid_channel"
  | "invalid_metadata"
  | "invalid_axis"
  | "missing_duration"
  | "duration_mismatch"
  | "origin_mismatch"
  | "insufficient_coverage"
  | "insufficient_measurements"
  | "sparse_axis";

export interface SensorRejectionDiagnostic {
  channel: "power" | "heart_rate" | "cadence";
  source: "sensorStreamsV1" | "virtualPowerOverride" | "legacy";
  reason: SensorRejectionReason;
  axisLength?: number;
  channelLength?: number;
}

export interface AnalysisSensorSeries {
  values: number[];
  time: number[];
  /** Duration owned by each retained value; missing slots are intentionally absent. */
  durationsSec?: number[];
  /** Run boundaries retained after compacting missing slots. */
  segmentStarts?: boolean[];
  /** Complete validated source-axis duration, including missing slots. */
  fullSessionDurationSec?: number;
  timeOriginEpochMs?: number;
  /** True only when every sample on the source sensor axis was measured. */
  complete?: boolean;
  /** True when selection already validated conservative whole-session slot coverage. */
  wholeSessionCoverageAccepted?: boolean;
}

export interface ActivityAnalysisProjection {
  streams: ActivityStreams;
  heartRate?: AnalysisSensorSeries;
  power?: AnalysisSensorSeries;
}

const LEGACY_POWER_MIN_POSITIVE_COVERAGE = 0.05;
const LEGACY_POWER_MIN_AXIS_COVERAGE = 0.95;
const EXPLICIT_SENSOR_DURATION_TOLERANCE = 0.05;

export interface SelectedPowerStream {
  source: StreamSensorSummary["powerSource"];
  /** Original samples, kept on their source axis for charts and analysis. */
  values: readonly (number | null)[] | null;
  /** Finite, non-negative samples used for summary statistics. */
  finiteValues: number[];
  hasCandidate: boolean;
  rejection?: SensorRejectionDiagnostic;
}

export interface SelectedHeartRateStream {
  source: StreamSensorSummary["heartRateSource"];
  values: readonly (number | null)[] | null;
  positiveValues: number[];
  hasRejectedMeasurement: boolean;
  rejection?: SensorRejectionDiagnostic;
}

function validDurationMillis(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value / 1000
    : undefined;
}

export function buildActivitySensorSelectionContext(
  summary: Pick<ActivitySummary, "ridingTimeMillis" | "elapsedTimeMillis"> | null | undefined,
  activityStartTime?: number,
  powerOverride?: ActivityPowerOverrideProvenance,
): ActivitySensorSelectionContext {
  const ridingDurationSec = validDurationMillis(summary?.ridingTimeMillis);
  const elapsedDurationSec = validDurationMillis(summary?.elapsedTimeMillis);
  return {
    legacyDurationSec: ridingDurationSec ?? elapsedDurationSec,
    explicitDurationSec: elapsedDurationSec ?? ridingDurationSec,
    activityStartTime,
    ...(powerOverride ? { powerOverride } : {}),
  };
}

function normalizeSelectionContext(
  contextOrDuration?: ActivitySensorSelectionContext | number,
  activityStartTime?: number,
): ActivitySensorSelectionContext {
  if (typeof contextOrDuration === "number") {
    return {
      legacyDurationSec: contextOrDuration,
      explicitDurationSec: contextOrDuration,
      activityStartTime,
    };
  }
  return contextOrDuration ?? { activityStartTime };
}

/**
 * V1 is a preferred sensor source only after its per-channel contract passes.
 * A bad auxiliary V1 payload must not hide an independently valid persisted
 * sensor stream; removing it here also keeps the normal legacy trust gates in
 * charge of the fallback.
 */
function withoutSensorStreamsV1(streams: ActivityStreams): ActivityStreams {
  const { sensorStreamsV1: _sensorStreamsV1, ...legacyStreams } = streams;
  return legacyStreams;
}

function fallbackPowerAfterRejectedV1(
  streams: ActivityStreams,
  context: ActivitySensorSelectionContext,
  rejection: SensorRejectionDiagnostic,
): SelectedPowerStream {
  const fallback = selectActivityPowerStream(withoutSensorStreamsV1(streams), context);
  return fallback.source != null
    ? { ...fallback, rejection }
    : { source: null, values: null, finiteValues: [], hasCandidate: true, rejection };
}

function fallbackHeartRateAfterRejectedV1(
  streams: ActivityStreams,
  context: ActivitySensorSelectionContext,
  rejection: SensorRejectionDiagnostic,
): SelectedHeartRateStream {
  const fallback = selectActivityHeartRateStream(withoutSensorStreamsV1(streams), context);
  return fallback.source != null
    ? { ...fallback, rejection }
    : { source: null, values: null, positiveValues: [], hasRejectedMeasurement: true, rejection };
}

function hasSufficientAxisCoverage(
  valuesLength: number,
  expectedCount: number,
  expectedIsMinimum = false,
  maximumCount?: number,
): boolean {
  if (expectedIsMinimum) {
    return (expectedCount <= 0 || valuesLength / expectedCount >= LEGACY_POWER_MIN_AXIS_COVERAGE)
      && (maximumCount == null || valuesLength <= maximumCount);
  }
  return expectedCount <= 0
    || Math.abs(valuesLength - expectedCount) <= 1
    || Math.min(valuesLength, expectedCount) / Math.max(valuesLength, expectedCount) >= LEGACY_POWER_MIN_AXIS_COVERAGE;
}

function runtimeArray<T>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? value as T[] : undefined;
}

function hasRuntimeCandidate(value: unknown): boolean {
  return value != null && (!Array.isArray(value) || value.length > 0);
}

function hasAttemptedExplicitChannel(value: unknown): boolean {
  if (value == null) return false;
  if (!Array.isArray(value)) return true;
  if (value.length === 0) return false;
  if (!hasDenseArraySlots(value)) return true;
  return value.some((sample) => sample !== null);
}

function invalidVersionExplicitChannel(
  streams: ActivityStreams,
  channel: "watts" | "heartrate",
): { axisLength?: number; channelLength?: number } | null {
  const rawPayload = (streams as unknown as Record<string, unknown>).sensorStreamsV1;
  if (rawPayload == null || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const payload = rawPayload as Record<string, unknown>;
  const rawChannel = payload[channel];
  if (payload.version === 1 || !hasAttemptedExplicitChannel(rawChannel)) return null;
  return {
    axisLength: Array.isArray(payload.time) ? payload.time.length : undefined,
    channelLength: Array.isArray(rawChannel) ? rawChannel.length : undefined,
  };
}

function validTimeDurationsSec(value: unknown): {
  elapsed: number;
  sampled?: number;
} | undefined {
  const time = runtimeArray<unknown>(value);
  if (!time || time.length < 2 || !hasDenseArraySlots(time)) return undefined;
  if (!time.every((sample) => typeof sample === "number" && Number.isFinite(sample) && sample >= 0)) {
    return undefined;
  }
  const numericTime = normalizeIsolatedTimestampEqualities(time as number[]);
  if (!numericTime) return undefined;
  const unit = detectConsistentTimestampUnit(numericTime);
  if (unit == null) return undefined;
  const divisor = timestampDivisor(unit);
  const deltas = numericTime.slice(1).map(
    (sample, index) => (sample - numericTime[index]!) / divisor,
  );
  if (deltas.some((delta) => delta < 0)) return undefined;
  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const representativeStep = sortedDeltas[Math.floor(sortedDeltas.length / 2)] ?? 1;
  const stableStepTolerance = Math.max(
    representativeStep * 0.05,
    Number.EPSILON * Math.max(1, representativeStep) * 4,
  );
  const stableDeltas = deltas.filter(
    (delta) => Math.abs(delta - representativeStep) <= stableStepTolerance,
  );
  const hasOnlyStableStepsAndPauseGaps = deltas.every(
    (delta) => Math.abs(delta - representativeStep) <= stableStepTolerance
      || delta > representativeStep + stableStepTolerance,
  );
  const hasStableSampleCadence = hasOnlyStableStepsAndPauseGaps
    && stableDeltas.length >= Math.ceil(deltas.length * 0.95);
  return {
    elapsed: (numericTime[numericTime.length - 1]! - numericTime[0]!) / divisor + representativeStep,
    ...(hasStableSampleCadence
      ? {
          sampled: deltas.reduce(
            (sum, delta) => sum + (
              Math.abs(delta - representativeStep) <= stableStepTolerance
                ? delta
                : representativeStep
            ),
            representativeStep,
          ),
        }
      : {}),
  };
}

function validTimeDurationSec(value: unknown): number | undefined {
  return validTimeDurationsSec(value)?.elapsed;
}

export function expectedActivityDurationSec(
  streams: ActivityStreams,
  summaryDurationSec?: number,
): number | undefined {
  const timeDuration = validTimeDurationSec(streams.time);
  const validSummaryDuration = typeof summaryDurationSec === "number"
    && Number.isFinite(summaryDurationSec)
    && summaryDurationSec > 0
    ? summaryDurationSec
    : undefined;
  if (timeDuration != null) {
    return validSummaryDuration == null ? timeDuration : Math.max(timeDuration, validSummaryDuration);
  }
  if (validSummaryDuration != null) return validSummaryDuration;
  // Explicit V1 is fixed at 1 Hz, but unrelated route channels may have any sampling
  // frequency. Without a valid clock or positive summary they provide no duration evidence.
  return undefined;
}

interface LegacyCoverageExpectation {
  count: number;
  hasInvalidTimeEvidence: boolean;
  inferenceDurationSec?: number;
  maximumCount?: number;
  minimumOnly: boolean;
  shapeCount: number;
  summaryDurationSec?: number;
  timeAxisLength: number;
  timeDurationSec?: number;
  timeSampledDurationSec?: number;
  routeTime?: number[];
}

function reliableRouteAxisLength(value: unknown): number {
  const axis = runtimeArray<unknown>(value);
  if (!axis?.length || !hasDenseArraySlots(axis)) return 0;
  return axis.every((sample) => typeof sample === "number" && Number.isFinite(sample) && sample >= 0)
    ? axis.length
    : 0;
}

function legacyCoverageExpectation(
  streams: ActivityStreams,
  summaryDurationSec?: number,
  excludeCadence = false,
): LegacyCoverageExpectation {
  const timeDurationsSec = validTimeDurationsSec(streams.time);
  const timeDurationSec = timeDurationsSec?.elapsed;
  const timeAxisLength = timeDurationSec != null ? reliableRouteAxisLength(streams.time) : 0;
  const routeTime = timeAxisLength > 0 ? runtimeArray<number>(streams.time) : undefined;
  const rawTime = (streams as unknown as Record<string, unknown>).time;
  const hasInvalidTimeEvidence = rawTime != null
    && (!Array.isArray(rawTime) || rawTime.length > 0)
    && timeDurationSec == null;
  const shapeCount = Math.max(
    timeAxisLength,
    reliableRouteAxisLength(streams.distance),
    reliableRouteAxisLength(streams.velocity_smooth),
  );
  const validSummaryDuration = typeof summaryDurationSec === "number"
    && Number.isFinite(summaryDurationSec)
    && summaryDurationSec > 0
    ? summaryDurationSec
    : undefined;
  if (validSummaryDuration != null) {
    // Legacy sensor streams may be sampled faster than 1 Hz. Summary duration is therefore
    // a lower bound on samples, not an axis whose count must match symmetrically. A valid
    // route clock can span pauses beyond moving time, so use its longer elapsed duration
    // for the inference ceiling while keeping summary-only payloads fail-closed at 4 Hz.
    // timeDurationSec already includes the final representative sample interval; ceil only
    // protects a fractional duration boundary from dropping its final valid sample.
    const maximumDurationSec = Math.max(validSummaryDuration, timeDurationSec ?? 0);
    return {
      count: Math.ceil(validSummaryDuration),
      inferenceDurationSec: maximumDurationSec,
      maximumCount: Math.ceil(maximumDurationSec * MAX_INFERRED_SENSOR_RATE_HZ),
      minimumOnly: true,
      hasInvalidTimeEvidence,
      shapeCount,
      summaryDurationSec: validSummaryDuration,
      timeAxisLength,
      timeDurationSec,
      timeSampledDurationSec: timeDurationsSec?.sampled,
      routeTime,
    };
  }
  return {
    count: Math.max(
      timeAxisLength,
      reliableRouteAxisLength(streams.distance),
      reliableRouteAxisLength(streams.velocity_smooth),
      excludeCadence ? 0 : reliableRouteAxisLength(streams.cadence),
    ),
    minimumOnly: false,
    hasInvalidTimeEvidence,
    shapeCount,
    timeAxisLength,
    timeDurationSec,
    timeSampledDurationSec: timeDurationsSec?.sampled,
    routeTime,
  };
}

function usesLegacyTimeCoverage(valuesLength: number, expectation: LegacyCoverageExpectation): boolean {
  return (
    expectation.summaryDurationSec != null
    && expectation.timeDurationSec != null
    && hasSufficientAxisCoverage(valuesLength, expectation.timeAxisLength)
  );
}

function hasLegacyCoverage(valuesLength: number, expectation: LegacyCoverageExpectation): boolean {
  if (expectation.hasInvalidTimeEvidence && expectation.summaryDurationSec == null) return false;
  if (usesLegacyTimeCoverage(valuesLength, expectation)) {
    return legacySensorDurationsAgree(
      expectation.timeDurationSec!,
      expectation.summaryDurationSec!,
    ) || (
      expectation.timeDurationSec! > expectation.summaryDurationSec!
      && expectation.timeSampledDurationSec != null
      && legacySensorDurationsAgree(
        expectation.timeSampledDurationSec,
        expectation.summaryDurationSec!,
      )
    );
  }
  return hasSufficientAxisCoverage(
    valuesLength,
    expectation.count,
    expectation.minimumOnly,
    expectation.maximumCount,
  );
}

function explicitCoverageRejectionReason(
  streams: ActivityStreams,
  explicitTime: readonly number[],
  summaryDurationSec?: number,
  activityStartTime?: number,
): SensorRejectionReason | null {
  const rawOrigin = (streams.sensorStreamsV1 as unknown as Record<string, unknown> | undefined)
    ?.timeOriginEpochMs;
  if (typeof rawOrigin !== "number" || !Number.isSafeInteger(rawOrigin) || rawOrigin <= 0) {
    return "invalid_metadata";
  }
  const expectedDuration = expectedActivityDurationSec(streams, summaryDurationSec);
  if (expectedDuration == null) return "missing_duration";
  const measuredDuration = explicitTime[explicitTime.length - 1]! - explicitTime[0]! + 1;
  const roundingEpsilon = Math.max(1, expectedDuration) * Number.EPSILON;
  // The V1 axis spans the session even when slots are missing, so compare spans.
  // Expand the percentage bounds to an absolute second on short rides so endpoint
  // rounding cannot reject a valid sample.
  const allowedDifference = Math.max(
    1,
    expectedDuration * EXPLICIT_SENSOR_DURATION_TOLERANCE,
  );
  if (Math.abs(measuredDuration - expectedDuration) > allowedDifference + roundingEpsilon) {
    return "duration_mismatch";
  }

  const routeTime = runtimeArray<number>(streams.time);
  const routeStart = routeTime?.[0];
  // SensorStreamsV1 is recorded independently of GPS acquisition. The activity
  // start is therefore authoritative; an absolute first GPS fix is only a
  // fallback when the activity record cannot provide a usable start time.
  const expectedStartEpochMs = normalizeEpochMs(activityStartTime) ?? normalizeEpochMs(routeStart);
  if (expectedStartEpochMs == null) return null;
  const explicitStartEpochMs = rawOrigin + explicitTime[0]! * 1000;
  return Number.isSafeInteger(explicitStartEpochMs)
    && Math.abs(explicitStartEpochMs - expectedStartEpochMs) <= 1000
    ? null
    : "origin_mismatch";
}

function persistedNumericArray(value: unknown, allowNegative: boolean): number[] | undefined {
  const values = runtimeArray<unknown>(value);
  if (!values || !hasDenseArraySlots(values)) return undefined;
  if (!values.every((sample) => typeof sample === "number"
    && Number.isFinite(sample)
    && (allowNegative || sample >= 0))) return undefined;
  return values as number[];
}

function persistedTimeArray(value: unknown, allowIsolatedEqual = false): number[] | undefined {
  const values = persistedNumericArray(value, false);
  if (!values) return undefined;
  if (values.length === 0) return values;
  const unit = detectConsistentTimestampUnit(values);
  if (unit == null) return undefined;
  for (let index = 0; index < values.length; index++) {
    const sample = values[index]!;
    if (index > 0 && sample < values[index - 1]!) return undefined;
    if (!allowIsolatedEqual && index > 0 && sample === values[index - 1]!) return undefined;
  }
  if (!allowIsolatedEqual) return values;
  return normalizeIsolatedTimestampEqualities(values);
}

interface ChartTimeAxis {
  relativeSec: number[];
  originEpochMs?: number;
  durationSec: number;
}

function normalizeEpochMs(value: unknown): number | undefined {
  return normalizeEpochMilliseconds(value);
}

function chartRouteTimeAxis(
  streams: ActivityStreams,
  routeLength: number,
  activityStartTime?: number,
): ChartTimeAxis | undefined {
  const time = persistedTimeArray(streams.time, true);
  if (!time?.length || time.length !== routeLength) return undefined;
  const first = time[0]!;
  const epochOrigin = normalizeEpochMs(first);
  const relativeSec = time.map((sample) => epochOrigin == null
    ? sample - first
    : (normalizeEpochMs(sample)! - epochOrigin) / 1000);
  if (relativeSec.some((sample, index) => !Number.isFinite(sample)
    || (index > 0 && sample < relativeSec[index - 1]!))) return undefined;
  const durationSec = validTimeDurationSec(time);
  if (durationSec == null) return undefined;
  const activityOrigin = normalizeEpochMs(activityStartTime);
  const relativeOrigin = activityOrigin == null ? undefined : activityOrigin + first * 1000;
  return {
    relativeSec,
    durationSec,
    ...(epochOrigin != null
      ? { originEpochMs: epochOrigin }
      : Number.isSafeInteger(relativeOrigin) ? { originEpochMs: relativeOrigin } : {}),
  };
}

function stepSensorValue(
  values: readonly (number | null)[],
  sensorTime: readonly number[],
  targetSec: number,
  sampleStepSec: number,
): number | null {
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(targetSec));
  if (targetSec < sensorTime[0]! - epsilon
    || targetSec >= sensorTime[sensorTime.length - 1]! + sampleStepSec - epsilon) {
    return null;
  }
  let low = 0;
  let high = sensorTime.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (sensorTime[mid]! <= targetSec + epsilon) low = mid;
    else high = mid - 1;
  }
  return targetSec < sensorTime[low]! + sampleStepSec - epsilon ? values[low] ?? null : null;
}

function alignSensorChannelForChart(
  values: readonly (number | null)[] | null | undefined,
  source: "legacy" | "explicit" | "override",
  streams: ActivityStreams,
  context: ActivitySensorSelectionContext,
  routeLength: number,
): Array<number | null> | undefined {
  if (!values?.length) return undefined;
  if (source === "override") {
    const overrideTime = persistedTimeArray(context.powerOverride?.time, true);
    const routeTime = persistedTimeArray(streams.time, true);
    return values.length === routeLength
      && overrideTime?.length === values.length
      && routeTime?.length === routeLength
      && overrideTime.every((sample, index) => sample === routeTime[index])
      ? [...values]
      : undefined;
  }
  const routeAxis = chartRouteTimeAxis(streams, routeLength, context.activityStartTime);
  if (!routeAxis) return undefined;
  // Legacy top-level channels share the route array's index contract. The first GPS fix
  // may be later than the activity start, but that delay does not shift an already exact,
  // route-length channel. V1 and override streams retain their independent clock rules.
  if (source === "legacy" && values.length === routeLength) {
    return [...values];
  }

  let sensorTime: number[];
  let sensorStepSec: number;
  let originOffsetSec = 0;
  if (source === "explicit") {
    const explicit = streams.sensorStreamsV1;
    const explicitTime = persistedTimeArray(explicit?.time);
    const explicitOrigin = normalizeEpochMs(explicit?.timeOriginEpochMs);
    if (!explicitTime || explicitTime.length !== values.length || explicitOrigin == null
      || routeAxis.originEpochMs == null) return undefined;
    sensorTime = explicitTime;
    sensorStepSec = explicit?.resolutionSeconds ?? 0;
    originOffsetSec = (explicitOrigin - routeAxis.originEpochMs) / 1000;
  } else {
    const durationSec = context.legacyDurationSec ?? routeAxis.durationSec;
    if (durationSec == null || !Number.isFinite(durationSec) || durationSec <= 0) return undefined;
    sensorTime = inferUniformSampleTimeAxis(values.length, durationSec) ?? [];
    if (!sensorTime.length) return undefined;
    const durationRatio = routeAxis.durationSec / durationSec;
    if (durationRatio < LEGACY_POWER_MIN_AXIS_COVERAGE
      || durationRatio > 1 / LEGACY_POWER_MIN_AXIS_COVERAGE) return undefined;
    sensorStepSec = durationSec / values.length;
    const sensorOrigin = normalizeEpochMs(context.activityStartTime);
    if (sensorOrigin != null && routeAxis.originEpochMs != null) {
      originOffsetSec = (sensorOrigin - routeAxis.originEpochMs) / 1000;
    }
  }
  if (!Number.isFinite(sensorStepSec) || sensorStepSec <= 0) return undefined;
  return routeAxis.relativeSec.map((routeSec) => stepSensorValue(
    values,
    sensorTime,
    routeSec - originOffsetSec,
    sensorStepSec,
  ));
}

function trustedLegacyPower(
  values: readonly number[] | undefined,
  expectation: LegacyCoverageExpectation,
): number[] | null {
  if (!values?.length) return null;
  if (!hasValidLegacySensorChannelValues(values)) return null;

  if (!hasLegacyCoverage(values.length, expectation)) return null;

  // Positive coverage remains the corruption/sparsity gate. Once the whole
  // legacy channel passes, finite zero watts are measured coasting samples.
  const positiveCount = values.filter((value) => value > 0).length;
  const coverageDenominator = usesLegacyTimeCoverage(values.length, expectation)
    ? Math.max(values.length, 1)
    : Math.max(values.length, expectation.count, 1);
  return positiveCount / coverageDenominator >= LEGACY_POWER_MIN_POSITIVE_COVERAGE
    ? [...values]
    : null;
}

export function selectActivityPowerStream(
  streams: ActivityStreams | null,
  contextOrDuration?: ActivitySensorSelectionContext | number,
  activityStartTime?: number,
): SelectedPowerStream {
  if (!streams) return { source: null, values: null, finiteValues: [], hasCandidate: false };

  const context = normalizeSelectionContext(contextOrDuration, activityStartTime);
  const explicit = streams.sensorStreamsV1?.version === 1 ? streams.sensorStreamsV1 : null;
  const rawLegacyWatts = (streams as unknown as Record<string, unknown>).watts;
  const rawLegacyCalculatedWatts = (streams as unknown as Record<string, unknown>).watts_calc;
  const legacyWatts = runtimeArray<number>(rawLegacyWatts);
  const legacyCalculatedWatts = runtimeArray<number>(rawLegacyCalculatedWatts);
  const hasLegacyCandidate = hasRuntimeCandidate(rawLegacyWatts)
    || hasRuntimeCandidate(rawLegacyCalculatedWatts);
  const legacyExpectation = legacyCoverageExpectation(streams, context.legacyDurationSec);
  const invalidVersionPower = invalidVersionExplicitChannel(streams, "watts");
  if (invalidVersionPower) {
    return {
      source: null, values: null, finiteValues: [], hasCandidate: true,
      rejection: {
        channel: "power", source: "sensorStreamsV1", reason: "invalid_metadata",
        ...invalidVersionPower,
      },
    };
  }
  if (context.powerOverride) {
    const overrideTime = persistedTimeArray(context.powerOverride.time, true);
    const routeTime = persistedTimeArray(streams.time, true);
    const invalidChannel = !legacyWatts || !hasValidLegacySensorChannelValues(legacyWatts);
    const invalidAxis = !overrideTime
      || overrideTime.length !== legacyWatts?.length
      || routeTime?.length !== overrideTime.length
      || !overrideTime.every((sample, index) => sample === routeTime[index]);
    const hasEnoughMeasurements = !!legacyWatts?.length
      && legacyWatts.filter((value) => value > 0).length / legacyWatts.length >= LEGACY_POWER_MIN_POSITIVE_COVERAGE;
    if (invalidChannel || invalidAxis || !hasEnoughMeasurements) {
      return {
        source: null, values: null, finiteValues: [], hasCandidate: true,
        rejection: {
          channel: "power",
          source: "virtualPowerOverride",
          reason: invalidChannel ? "invalid_channel" : invalidAxis ? "invalid_axis" : "insufficient_measurements",
          axisLength: overrideTime?.length,
          channelLength: legacyWatts?.length,
        },
      };
    }
    return {
      source: "virtualPowerOverride",
      values: legacyWatts,
      finiteValues: [...legacyWatts],
      hasCandidate: true,
    };
  }
  if (explicit) {
    const rawWatts = (explicit as unknown as Record<string, unknown>).watts;
    if (rawWatts != null && !Array.isArray(rawWatts)) {
      return {
        source: null, values: null, finiteValues: [], hasCandidate: true,
        rejection: { channel: "power", source: "sensorStreamsV1", reason: "invalid_channel" },
      };
    }
    const explicitWatts = runtimeArray<number | null>(rawWatts);
    if (explicitWatts && !hasValidExplicitSensorChannelValues(explicitWatts)) {
      return {
        source: null, values: null, finiteValues: [], hasCandidate: true,
        rejection: {
          channel: "power", source: "sensorStreamsV1", reason: "invalid_channel",
          channelLength: explicitWatts.length,
        },
      };
    }
    // V1 null is missing, while zero is an authoritative measured coast.
    const finiteValues = explicitWatts?.filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0,
    ) ?? [];
    // Measured V1 power is authoritative. HR-only V1 payloads still need the
    // legacy fallback because virtual power remains on the top-level axis.
    if (finiteValues.length > 0) {
      const explicitTime = runtimeArray<number>((explicit as unknown as Record<string, unknown>).time);
      if (explicit.timeUnit !== "relative_seconds" || explicit.resolutionSeconds !== 1) {
        return {
          source: null, values: null, finiteValues: [], hasCandidate: true,
          rejection: {
            channel: "power", source: "sensorStreamsV1", reason: "invalid_metadata",
            axisLength: explicitTime?.length, channelLength: explicitWatts?.length,
          },
        };
      }
      if (!explicitTime) {
        return fallbackPowerAfterRejectedV1(streams, context, {
          channel: "power", source: "sensorStreamsV1", reason: "invalid_axis",
          channelLength: explicitWatts?.length,
        });
      }
      const axisRejection = explicitAxisRejectionReason(
        explicitTime,
        explicitWatts?.length ?? 0,
        explicit.timeUnit,
        explicit.resolutionSeconds,
      );
      if (axisRejection) {
        return fallbackPowerAfterRejectedV1(streams, context, {
          channel: "power", source: "sensorStreamsV1", reason: axisRejection,
          axisLength: explicitTime?.length, channelLength: explicitWatts?.length,
        });
      }
      const coverageRejection = explicitCoverageRejectionReason(
        streams,
        explicitTime,
        context.explicitDurationSec,
        context.activityStartTime,
      );
      if (coverageRejection) {
        return {
          source: null, values: null, finiteValues: [], hasCandidate: true,
          rejection: {
            channel: "power", source: "sensorStreamsV1", reason: coverageRejection,
            axisLength: explicitTime.length, channelLength: explicitWatts?.length,
          },
        };
      }
      if (!hasRetainedSlotMeasurementCoverage(finiteValues.length, explicitWatts?.length ?? 0)) {
        return {
          source: null, values: null, finiteValues: [], hasCandidate: true,
          rejection: {
            channel: "power", source: "sensorStreamsV1", reason: "insufficient_measurements",
            axisLength: explicitTime.length, channelLength: explicitWatts?.length,
          },
        };
      }
      return {
        source: "sensorStreamsV1",
        values: explicitWatts ?? null,
        finiteValues,
        hasCandidate: true,
      };
    }
  }

  const trustedWatts = trustedLegacyPower(legacyWatts, legacyExpectation);
  if (trustedWatts) {
    return {
      source: "watts",
      values: legacyWatts ?? null,
      finiteValues: trustedWatts,
      hasCandidate: true,
    };
  }
  const trustedCalculatedWatts = trustedLegacyPower(legacyCalculatedWatts, legacyExpectation);
  if (trustedCalculatedWatts) {
    return {
      source: "watts_calc",
      values: legacyCalculatedWatts ?? null,
      finiteValues: trustedCalculatedWatts,
      hasCandidate: true,
    };
  }
  const invalidLegacyChannel = (hasRuntimeCandidate(rawLegacyWatts)
    && (!legacyWatts || !hasValidLegacySensorChannelValues(legacyWatts)))
    || (hasRuntimeCandidate(rawLegacyCalculatedWatts)
      && (!legacyCalculatedWatts || !hasValidLegacySensorChannelValues(legacyCalculatedWatts)));
  const hasCoveredLegacyPower = [legacyWatts, legacyCalculatedWatts]
    .some((values) => values != null
      && hasValidLegacySensorChannelValues(values)
      && hasLegacyCoverage(values.length, legacyExpectation));
  return {
    source: null,
    values: null,
    finiteValues: [],
    hasCandidate: hasLegacyCandidate,
    ...(hasLegacyCandidate ? {
      rejection: {
        channel: "power" as const,
        source: "legacy" as const,
        reason: invalidLegacyChannel
          ? "invalid_channel" as const
          : hasCoveredLegacyPower
            ? "insufficient_measurements" as const
            : "insufficient_coverage" as const,
        channelLength: Math.max(legacyWatts?.length ?? 0, legacyCalculatedWatts?.length ?? 0),
      },
    } : {}),
  };
}

function positiveValues(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}

function trustedLegacySensor(
  values: readonly number[] | undefined,
  expectation: LegacyCoverageExpectation,
  channel: LegacySensorCoverageChannel,
): number[] | null {
  if (!values?.length || !hasValidLegacySensorChannelValues(values)) return null;
  if (!hasLegacyCoverage(values.length, expectation)) return null;
  const positive = positiveValues(values);
  return legacySensorMeasurementsCoverSession(legacySensorCoverageInput(values, expectation, channel))
    ? positive : null;
}

function legacySensorCoverageInput(
  values: readonly number[],
  expectation: LegacyCoverageExpectation,
  channel: LegacySensorCoverageChannel,
): LegacySensorCoverageInput {
  return {
    channel,
    ...legacySensorAxisInput(values, expectation),
  };
}

function legacySensorAxisInput(
  values: readonly number[],
  expectation: LegacyCoverageExpectation,
): LegacySensorAxisInput {
  const useMovingTimeAxis = expectation.summaryDurationSec != null
    && expectation.timeDurationSec != null
    && expectation.timeSampledDurationSec != null
    && expectation.timeDurationSec > expectation.summaryDurationSec
    && !legacySensorDurationsAgree(expectation.timeDurationSec, expectation.summaryDurationSec)
    && legacySensorDurationsAgree(expectation.timeSampledDurationSec, expectation.summaryDurationSec);
  return {
    hasAlignedShapeEvidence: expectation.shapeCount > 0
      && hasSufficientAxisCoverage(values.length, expectation.shapeCount),
    hasInvalidTimeEvidence: expectation.hasInvalidTimeEvidence,
    values,
    routeTime: useMovingTimeAxis ? undefined : expectation.routeTime,
    trustedDurationSec: useMovingTimeAxis
      ? expectation.summaryDurationSec
      : expectation.inferenceDurationSec ?? expectation.summaryDurationSec,
  };
}

export function selectActivityHeartRateStream(
  streams: ActivityStreams | null,
  contextOrDuration?: ActivitySensorSelectionContext | number,
  activityStartTime?: number,
): SelectedHeartRateStream {
  if (!streams) return { source: null, values: null, positiveValues: [], hasRejectedMeasurement: false };

  const context = normalizeSelectionContext(contextOrDuration, activityStartTime);
  const explicit = streams.sensorStreamsV1?.version === 1 ? streams.sensorStreamsV1 : null;
  const invalidVersionHeartRate = invalidVersionExplicitChannel(streams, "heartrate");
  if (invalidVersionHeartRate) {
    return {
      source: null, values: null, positiveValues: [], hasRejectedMeasurement: true,
      rejection: {
        channel: "heart_rate", source: "sensorStreamsV1", reason: "invalid_metadata",
        ...invalidVersionHeartRate,
      },
    };
  }
  const rawExplicitHeartRate = explicit
    ? (explicit as unknown as Record<string, unknown>).heartrate
    : null;
  if (rawExplicitHeartRate != null && !Array.isArray(rawExplicitHeartRate)) {
    return {
      source: null, values: null, positiveValues: [], hasRejectedMeasurement: true,
      rejection: { channel: "heart_rate", source: "sensorStreamsV1", reason: "invalid_channel" },
    };
  }
  const explicitHeartRate = runtimeArray<number | null>(rawExplicitHeartRate);
  if (explicitHeartRate && !hasValidExplicitSensorChannelValues(explicitHeartRate)) {
    return {
      source: null, values: null, positiveValues: [], hasRejectedMeasurement: true,
      rejection: {
        channel: "heart_rate", source: "sensorStreamsV1", reason: "invalid_channel",
        channelLength: explicitHeartRate.length,
      },
    };
  }
  const explicitPositive = positiveValues(explicitHeartRate);
  const hasExplicitHeartRateAttempt = explicitHeartRate?.some((value) => value !== null) ?? false;
  if (explicit && explicitHeartRate && hasExplicitHeartRateAttempt) {
    const explicitTime = runtimeArray<number>((explicit as unknown as Record<string, unknown>).time);
    if (explicit.timeUnit !== "relative_seconds" || explicit.resolutionSeconds !== 1) {
      return {
        source: null, values: null, positiveValues: [], hasRejectedMeasurement: true,
        rejection: {
          channel: "heart_rate", source: "sensorStreamsV1", reason: "invalid_metadata",
          axisLength: explicitTime?.length, channelLength: explicitHeartRate.length,
        },
      };
    }
    if (!explicitTime) {
      return fallbackHeartRateAfterRejectedV1(streams, context, {
        channel: "heart_rate", source: "sensorStreamsV1", reason: "invalid_axis",
        channelLength: explicitHeartRate.length,
      });
    }
    const axisRejection = explicitAxisRejectionReason(
      explicitTime,
      explicitHeartRate.length,
      explicit.timeUnit,
      explicit.resolutionSeconds,
    );
    if (axisRejection) {
      return fallbackHeartRateAfterRejectedV1(streams, context, {
        channel: "heart_rate", source: "sensorStreamsV1", reason: axisRejection,
        axisLength: explicitTime?.length, channelLength: explicitHeartRate.length,
      });
    }
    const coverageRejection = explicitCoverageRejectionReason(
      streams,
      explicitTime,
      context.explicitDurationSec,
      context.activityStartTime,
    );
    if (coverageRejection) {
      return {
        source: null, values: null, positiveValues: [], hasRejectedMeasurement: true,
        rejection: {
          channel: "heart_rate", source: "sensorStreamsV1", reason: coverageRejection,
          axisLength: explicitTime.length, channelLength: explicitHeartRate.length,
        },
      };
    }
    if (!hasRetainedSlotMeasurementCoverage(explicitPositive.length, explicitHeartRate.length)) {
      return {
        source: null, values: null, positiveValues: [], hasRejectedMeasurement: true,
        rejection: {
          channel: "heart_rate", source: "sensorStreamsV1", reason: "insufficient_measurements",
          axisLength: explicitTime.length, channelLength: explicitHeartRate.length,
        },
      };
    }
    return {
      source: "sensorStreamsV1",
      values: explicitHeartRate,
      positiveValues: explicitPositive,
      hasRejectedMeasurement: false,
    };
  }

  const rawLegacyHeartRate = (streams as unknown as Record<string, unknown>).heartrate;
  const legacyHeartRate = runtimeArray<number>(rawLegacyHeartRate);
  const hasLegacyHeartRateCandidate = rawLegacyHeartRate != null
    && (!Array.isArray(rawLegacyHeartRate) || rawLegacyHeartRate.length > 0);
  const legacyPositive = trustedLegacySensor(
    legacyHeartRate,
    legacyCoverageExpectation(streams, context.legacyDurationSec),
    "heart_rate",
  );
  if (legacyPositive) {
    return {
      source: "heartrate",
      values: legacyHeartRate ?? null,
      positiveValues: legacyPositive,
      hasRejectedMeasurement: false,
    };
  }
  return {
    source: null,
    values: null,
    positiveValues: [],
    hasRejectedMeasurement: hasLegacyHeartRateCandidate,
    ...(hasLegacyHeartRateCandidate ? {
      rejection: {
        channel: "heart_rate" as const,
        source: "legacy" as const,
        reason: !legacyHeartRate || !hasValidLegacySensorChannelValues(legacyHeartRate)
          ? "invalid_channel" as const
          : hasLegacyCoverage(
              legacyHeartRate.length,
              legacyCoverageExpectation(streams, context.legacyDurationSec),
            )
            ? "insufficient_measurements" as const
            : "insufficient_coverage" as const,
        channelLength: legacyHeartRate?.length,
      },
    } : {}),
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maximum(values: readonly number[]): number {
  return values.reduce((result, value) => Math.max(result, value), -Infinity);
}

export function deriveStreamSensorSummary(
  streams: ActivityStreams | null,
  contextOrDuration?: ActivitySensorSelectionContext | number,
  activityStartTime?: number,
): StreamSensorSummary | null {
  if (!streams) return null;

  const context = normalizeSelectionContext(contextOrDuration, activityStartTime);
  const selectedHeartRate = selectActivityHeartRateStream(streams, context);
  const heartRate = selectedHeartRate.positiveValues;
  const legacyHeartRate = selectedHeartRate.source === "heartrate"
    ? runtimeArray<number>(selectedHeartRate.values)
    : undefined;
  const legacyHeartRateExpectation = legacyCoverageExpectation(streams, context.legacyDurationSec);
  const rawCadence = (streams as unknown as Record<string, unknown>).cadence;
  const cadenceValues = runtimeArray<number>(rawCadence);
  const cadenceExpectation = legacyCoverageExpectation(streams, context.legacyDurationSec, true);
  const cadence = trustedLegacySensor(
    cadenceValues,
    cadenceExpectation,
    "cadence",
  ) ?? [];
  const hasHeartRateStream = heartRate.length > 0;
  const hasCadenceStream = cadence.length > 0;
  const selectedPower = selectActivityPowerStream(streams, context);
  const power = selectedPower.finiteValues;
  const hasReliablePower = selectedPower.source != null;
  const hasCadenceCandidate = rawCadence != null
    && (!Array.isArray(rawCadence) || rawCadence.length > 0);
  const cadenceRejection: SensorRejectionDiagnostic | undefined = hasCadenceCandidate && !hasCadenceStream
    ? {
        channel: "cadence",
        source: "legacy",
        reason: !cadenceValues || !hasValidLegacySensorChannelValues(cadenceValues)
          ? "invalid_channel"
          : hasLegacyCoverage(
              cadenceValues.length,
              legacyCoverageExpectation(streams, context.legacyDurationSec, true),
            )
            ? "insufficient_measurements"
            : "insufficient_coverage",
        channelLength: cadenceValues?.length,
      }
    : undefined;
  const heartRateStats = legacyHeartRate
    ? timeWeightedLegacySensorSummary(
        legacySensorCoverageInput(legacyHeartRate, legacyHeartRateExpectation, "heart_rate"),
        (value) => value > 0,
      )
    : heartRate.length > 0 ? { average: average(heartRate), maximum: maximum(heartRate) } : null;
  const cadenceStats = cadenceValues && hasCadenceStream
    ? timeWeightedLegacySensorSummary(
        legacySensorCoverageInput(cadenceValues, cadenceExpectation, "cadence"),
        (value) => value > 0,
      )
    : null;
  const legacyPowerValues = selectedPower.source === "watts" || selectedPower.source === "watts_calc"
    ? runtimeArray<number>(selectedPower.values)
    : undefined;
  const powerStats = legacyPowerValues
    ? timeWeightedLegacySensorSummary(
        legacySensorAxisInput(legacyPowerValues, legacyCoverageExpectation(streams, context.legacyDurationSec)),
        (value) => value >= 0,
      )
    : hasReliablePower ? { average: average(power), maximum: maximum(power) } : null;

  return {
    hasHeartRateStream,
    hasRejectedHeartRateStream: selectedHeartRate.hasRejectedMeasurement,
    hasCadenceStream,
    hasRejectedCadenceStream: hasCadenceCandidate && !hasCadenceStream,
    hasPowerStream: hasReliablePower,
    averageHeartRate: heartRateStats?.average ?? null,
    maxHeartRate: heartRateStats?.maximum ?? null,
    averageCadence: cadenceStats?.average ?? null,
    maxCadence: cadenceStats?.maximum ?? null,
    averagePower: powerStats?.average ?? null,
    maxPower: powerStats?.maximum ?? null,
    hasReliablePower,
    hasRejectedPowerStream: selectedPower.hasCandidate && !hasReliablePower,
    heartRateSource: selectedHeartRate.source,
    powerSource: selectedPower.source,
    rejections: [selectedHeartRate.rejection, selectedPower.rejection, cadenceRejection]
      .filter((rejection): rejection is SensorRejectionDiagnostic => rejection != null),
  };
}

/** Seconds an ascending axis covers, falling back to the slot count. */
function axisSpanSec(time: readonly number[], length: number, step: number): number {
  const first = time[0];
  const last = time[length - 1];
  if (typeof first !== "number" || typeof last !== "number"
    || !Number.isFinite(first) || !Number.isFinite(last) || last < first) {
    return length * step;
  }
  return Math.max(last - first + step, length * step);
}

function measuredSeries(
  values: readonly (number | null)[],
  time: readonly number[],
  isMeasured: (value: number) => boolean,
  fixedStep?: number,
  timeOriginEpochMs?: unknown,
  wholeSessionCoverageAccepted = false,
  slotDurationsSec?: readonly number[],
): AnalysisSensorSeries | undefined {
  const length = Math.min(values.length, time.length);
  const positiveDiffs = time.slice(1)
    .map((value, index) => value - (time[index] ?? value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const step = fixedStep ?? positiveDiffs[(positiveDiffs.length - 1) >> 1] ?? 1;
  let currentValues: number[] = [];
  let currentTimes: number[] = [];
  let currentDurations: number[] = [];
  const runs: Array<{ values: number[]; time: number[]; durationsSec: number[] }> = [];
  for (let index = 0; index <= length; index++) {
    const value = values[index];
    const timestamp = time[index];
    if (
      typeof value === "number"
      && Number.isFinite(value)
      && typeof timestamp === "number"
      && Number.isFinite(timestamp)
      && isMeasured(value)
    ) {
      // A declared fixed-step axis may skip seconds (auto-pause, dropout, upload
      // thinning). A skipped slot is unmeasured time exactly like a null value, so
      // it must break the run — otherwise a rolling window would splice two efforts
      // separated by a pause into one continuous effort.
      const previousTime = currentTimes[currentTimes.length - 1];
      if (fixedStep != null && previousTime != null && timestamp - previousTime > fixedStep) {
        runs.push({ values: currentValues, time: currentTimes, durationsSec: currentDurations });
        currentValues = [];
        currentTimes = [];
        currentDurations = [];
      }
      currentValues.push(value);
      currentTimes.push(timestamp);
      currentDurations.push(slotDurationsSec?.[index] ?? step);
    } else {
      if (currentValues.length > 0) {
        runs.push({ values: currentValues, time: currentTimes, durationsSec: currentDurations });
      }
      currentValues = [];
      currentTimes = [];
      currentDurations = [];
    }
  }
  // Only channels that already passed the conservative whole-session coverage gate may
  // retain multiple measured runs. Other partial sources remain fail-closed.
  if (runs.length !== 1 && !wholeSessionCoverageAccepted) return undefined;
  const measured = runs.length === 1 ? runs[0]! : {
    values: runs.flatMap((run) => run.values),
    time: runs.flatMap((run) => run.time),
    durationsSec: runs.flatMap((run) => run.durationsSec),
  };
  if (!measured.values.length) return undefined;
  // Keep the source timestamps so independently compacted HR/power runs cannot appear aligned.
  // A defensive fixed-step fallback remains for a degenerate one-sample source.
  const measuredTime = measured.time.length > 1
    ? measured.time
    : measured.values.map((_, index) => (measured.time[0] ?? 0) + index * step);
  const validTimeOriginEpochMs = typeof timeOriginEpochMs === "number"
    && Number.isSafeInteger(timeOriginEpochMs)
    && timeOriginEpochMs >= 0
    ? timeOriginEpochMs
    : undefined;
  return {
    values: measured.values,
    time: measuredTime,
    ...(wholeSessionCoverageAccepted ? {
      durationsSec: measured.durationsSec,
      segmentStarts: runs.flatMap((run) => run.values.map((_, index) => index === 0)),
      // 세션 길이는 elapsed 다. 구멍 있는 축도 세션 전체를 가로지르므로 남은 슬롯을
      // 세면 3시간 라이드가 1시간 50분으로 보고된다. durationsSec 합(=측정된 초)과는
      // 의도적으로 다르다 — 존 분포·TSS 는 측정 구간만, 주행시간은 실제 경과다.
      fullSessionDurationSec: slotDurationsSec?.length === length
        ? slotDurationsSec.reduce((sum, duration) => sum + duration, 0)
        : axisSpanSec(time, length, step),
    } : {}),
    complete: values.length === time.length && measured.values.length === values.length,
    ...(wholeSessionCoverageAccepted ? { wholeSessionCoverageAccepted: true } : {}),
    ...(validTimeOriginEpochMs != null ? { timeOriginEpochMs: validTimeOriginEpochMs } : {}),
  };
}

function canonicalOverrideAxis(
  time: readonly number[],
  activityStartTime?: number,
): { time: number[]; timeOriginEpochMs?: number } | undefined {
  const normalized = persistedTimeArray(time, true);
  if (!normalized?.length) return undefined;
  const epochOrigin = normalizeEpochMs(normalized[0]);
  if (epochOrigin != null) {
    const relativeTime = normalized.map((sample) => {
      const epochMs = normalizeEpochMs(sample);
      return epochMs == null ? Number.NaN : (epochMs - epochOrigin) / 1000;
    });
    return relativeTime.every(Number.isFinite)
      ? { time: relativeTime, timeOriginEpochMs: epochOrigin }
      : undefined;
  }
  const activityOrigin = normalizeEpochMs(activityStartTime);
  return {
    time: [...normalized],
    ...(activityOrigin != null ? { timeOriginEpochMs: activityOrigin } : {}),
  };
}

export function buildActivityAnalysisProjection(
  streams: ActivityStreams | null,
  contextOrDuration?: ActivitySensorSelectionContext | number,
  activityStartTime?: number,
): ActivityAnalysisProjection | null {
  if (!streams) return null;

  const context = normalizeSelectionContext(contextOrDuration, activityStartTime);
  const explicit = streams.sensorStreamsV1?.version === 1 ? streams.sensorStreamsV1 : null;
  const selectedPower = selectActivityPowerStream(streams, context);
  const selectedHeartRate = selectActivityHeartRateStream(streams, context);
  const normalizedTime = persistedTimeArray(streams.time, true);
  const normalizedDistance = persistedNumericArray(streams.distance, false);
  const normalizedCadence = persistedNumericArray(streams.cadence, false);
  const cadenceExpectation = legacyCoverageExpectation(streams, context.legacyDurationSec, true);
  const normalizedStreams: ActivityStreams = {
    ...streams,
    altitude: persistedNumericArray(streams.altitude, true),
    distance: normalizedDistance,
    time: normalizedTime,
    velocity_smooth: persistedNumericArray(streams.velocity_smooth, false),
    cadence: normalizedCadence && trustedLegacySensor(normalizedCadence, cadenceExpectation, "cadence")
      ? normalizedCadence
      : undefined,
    heartrate: undefined,
    watts: undefined,
    watts_calc: undefined,
  };
  const legacyHeartRateValues = selectedHeartRate.source === "heartrate"
    ? runtimeArray<number>(streams.heartrate)
    : undefined;
  const topLevelTime = runtimeArray<number>(streams.time);
  const legacyHeartRateAxis = legacyHeartRateValues
    ? resolveLegacySensorMeasurementAxis(legacySensorAxisInput(
        legacyHeartRateValues,
        legacyCoverageExpectation(streams, context.legacyDurationSec),
      ))
    : undefined;
  const legacyPowerValues = selectedPower.source === "watts" || selectedPower.source === "watts_calc"
    ? runtimeArray<number>(selectedPower.values)
    : undefined;
  const legacyPowerAxis = legacyPowerValues
    ? resolveLegacySensorMeasurementAxis(legacySensorAxisInput(
        legacyPowerValues,
        legacyCoverageExpectation(streams, context.legacyDurationSec),
      ))
    : undefined;
  const legacyTimeOriginEpochMs = normalizeEpochMs(topLevelTime?.[0])
    ?? normalizeEpochMs(context.activityStartTime);
  const hasMissingLegacyHeartRate = legacyHeartRateValues?.some((value) => value === 0) === true;
  const legacyHeartRate = hasMissingLegacyHeartRate && legacyHeartRateValues
    ? measuredSeries(
        legacyHeartRateValues,
        legacyHeartRateAxis?.time ?? legacyHeartRateValues.map((_, index) => index),
        (value) => value > 0,
        undefined,
        legacyTimeOriginEpochMs,
        true,
        legacyHeartRateAxis?.durationsSec,
      )
    : undefined;
  const legacyPower = legacyPowerValues?.some((value) => value === 0)
    ? measuredSeries(
        legacyPowerValues,
        legacyPowerAxis?.time ?? legacyPowerValues.map((_, index) => index),
        (value) => value >= 0,
        undefined,
        legacyTimeOriginEpochMs,
        true,
        legacyPowerAxis?.durationsSec,
      )
    : undefined;
  const projectedLegacyHeartRate = legacyHeartRateValues && !hasMissingLegacyHeartRate
    ? legacyHeartRateValues
    : undefined;
  const usesOverridePower = selectedPower.source === "virtualPowerOverride";
  const overrideAxis = usesOverridePower && context.powerOverride
    ? canonicalOverrideAxis(context.powerOverride.time, context.activityStartTime)
    : undefined;
  const overridePower = usesOverridePower && overrideAxis
    ? measuredSeries(
        selectedPower.values ?? [],
        overrideAxis.time,
        (value) => value >= 0,
        undefined,
        overrideAxis.timeOriginEpochMs,
      )
    : undefined;
  if (explicit) {
    const usesExplicitPower = selectedPower.source === "sensorStreamsV1";
    const usesExplicitHeartRate = selectedHeartRate.source === "sensorStreamsV1";
    return {
      streams: {
        ...normalizedStreams,
        heartrate: projectedLegacyHeartRate,
        watts: selectedPower.source === "watts" || usesOverridePower
          ? runtimeArray<number>(selectedPower.values)
          : undefined,
        watts_calc: selectedPower.source === "watts_calc"
          ? runtimeArray<number>(selectedPower.values)
          : undefined,
      },
      heartRate: usesExplicitHeartRate
        ? measuredSeries(
            selectedHeartRate.values ?? [],
            runtimeArray<number>((explicit as unknown as Record<string, unknown>).time) ?? [],
            (value) => value > 0,
            explicit.resolutionSeconds,
            explicit.timeOriginEpochMs,
            true,
          )
        : selectedHeartRate.source === "heartrate" ? legacyHeartRate : undefined,
      power: overridePower ?? (usesExplicitPower
        ? measuredSeries(
            selectedPower.values ?? [],
            runtimeArray<number>((explicit as unknown as Record<string, unknown>).time) ?? [],
            (value) => value >= 0,
            explicit.resolutionSeconds,
            explicit.timeOriginEpochMs,
            true,
          )
        : legacyPower),
    };
  }

  const heartRate = legacyHeartRate;
  if (selectedPower.hasCandidate && selectedPower.source == null) {
    return {
      streams: {
        ...normalizedStreams,
        heartrate: projectedLegacyHeartRate,
        watts: undefined,
        watts_calc: undefined,
      },
      heartRate,
      power: legacyPower,
    };
  }
  if (selectedPower.source === "watts_calc" && streams.watts?.length) {
    return {
      streams: {
        ...normalizedStreams,
        heartrate: projectedLegacyHeartRate,
        watts: undefined,
        watts_calc: runtimeArray<number>(selectedPower.values),
      },
      heartRate,
      power: legacyPower,
    };
  }
  return {
    streams: {
      ...normalizedStreams,
      heartrate: projectedLegacyHeartRate,
      watts: selectedPower.source === "watts" || usesOverridePower
        ? runtimeArray<number>(selectedPower.values)
        : undefined,
      watts_calc: selectedPower.source === "watts_calc"
        ? runtimeArray<number>(selectedPower.values)
        : undefined,
    },
    heartRate,
    power: overridePower ?? legacyPower,
  };
}

export function buildSampledData(
  streams: ActivityStreams | null,
  contextOrDuration?: ActivitySensorSelectionContext | number,
  activityStartTime?: number,
): SampledPoint[] {
  if (!streams?.distance) return [];
  const context = normalizeSelectionContext(contextOrDuration, activityStartTime);
  const dist = streams.distance;
  const len = dist.length;
  const interval = Math.max(1, Math.floor(len / 300));
  const selectedPower = selectActivityPowerStream(streams, context);
  const selectedHeartRate = selectActivityHeartRateStream(streams, context);
  const cadenceValues = runtimeArray<number>(streams.cadence);
  const chartCadence = cadenceValues && trustedLegacySensor(
    cadenceValues,
    legacyCoverageExpectation(streams, context.legacyDurationSec, true),
    "cadence",
  ) ? cadenceValues : undefined;
  const chartHeartRateValues = selectedHeartRate.values?.map((value) => (
    typeof value === "number" && value > 0 ? value : null
  ));
  const chartHeartRate = alignSensorChannelForChart(
    chartHeartRateValues,
    selectedHeartRate.source === "sensorStreamsV1" ? "explicit" : "legacy",
    streams,
    context,
    len,
  );
  const chartPower = alignSensorChannelForChart(
    selectedPower.values,
    selectedPower.source === "sensorStreamsV1"
      ? "explicit"
      : selectedPower.source === "virtualPowerOverride" ? "override" : "legacy",
    streams,
    context,
    len,
  );
  const alignedCadence = alignSensorChannelForChart(chartCadence, "legacy", streams, context, len);
  const selectedIndexes = new Set<number>();
  for (let i = 0; i < len; i += interval) selectedIndexes.add(i);
  const chartChannels: Array<readonly (number | null)[] | undefined> = [
    streams.altitude,
    streams.velocity_smooth,
    chartHeartRate,
    chartPower,
    alignedCadence,
  ];
  for (const channel of chartChannels) {
    if (!channel?.length) continue;
    let minIndex = -1;
    let maxIndex = -1;
    let minValue = Infinity;
    let maxValue = -Infinity;
    for (let index = 0; index < Math.min(channel.length, len); index++) {
      const value = channel[index];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        const previous = channel[index - 1];
        const next = channel[index + 1];
        if ((typeof previous === "number" && Number.isFinite(previous))
          || (typeof next === "number" && Number.isFinite(next))) selectedIndexes.add(index);
        continue;
      }
      if (value < minValue) { minValue = value; minIndex = index; }
      if (value > maxValue) { maxValue = value; maxIndex = index; }
    }
    if (minIndex >= 0) selectedIndexes.add(minIndex);
    if (maxIndex >= 0) selectedIndexes.add(maxIndex);
  }
  const points: SampledPoint[] = [];
  for (const i of [...selectedIndexes].sort((a, b) => a - b)) {
    points.push({
      latlng: streams.latlng?.[i] as [number, number] ?? null,
      distance: dist[i] ?? 0,
      altitude: (streams.altitude as number[] | undefined)?.[i] ?? 0,
      speed: (streams.velocity_smooth?.[i] ?? 0) * 3.6,
      heartRate: chartHeartRate ? chartHeartRate[i] ?? null : null,
      power: chartPower ? chartPower[i] ?? null : null,
      cadence: alignedCadence?.[i] ?? 0,
    });
  }
  return points;
}

export function getAvailableOverlays(sampledData: SampledPoint[]): OverlayConfig[] {
  if (sampledData.length === 0) return [];
  return OVERLAY_CONFIGS.filter((cfg) => sampledData.some((d) => (cfg.getValue(d) ?? 0) > 0));
}

export function buildSummaryStats(
  streams: ActivityStreams | null,
  sensorSummary: StreamSensorSummary | null,
): { minElev: number; maxElev: number; overlays: Record<string, { avg: number; max: number }> } | null {
  const altitude = (runtimeArray<unknown>(streams?.altitude) ?? []).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const stats: Record<string, { avg: number; max: number }> = {};
  const speed = positiveValues(streams?.velocity_smooth).map((value) => value * 3.6);
  if (speed.length > 0) stats.speed = { avg: average(speed), max: maximum(speed) };
  if (sensorSummary?.averageHeartRate != null && sensorSummary.maxHeartRate != null) {
    stats.hr = { avg: sensorSummary.averageHeartRate, max: sensorSummary.maxHeartRate };
  }
  if (sensorSummary?.averagePower != null && sensorSummary.maxPower != null) {
    stats.power = { avg: sensorSummary.averagePower, max: sensorSummary.maxPower };
  }
  if (sensorSummary?.averageCadence != null && sensorSummary.maxCadence != null) {
    stats.cadence = { avg: sensorSummary.averageCadence, max: sensorSummary.maxCadence };
  }
  if (altitude.length === 0 && Object.keys(stats).length === 0) return null;
  const minElev = altitude.length > 0
    ? altitude.reduce((result, value) => Math.min(result, value), Infinity)
    : 0;
  const maxElev = altitude.length > 0 ? maximum(altitude) : 0;
  return { minElev, maxElev, overlays: stats };
}

export function getSegmentEfforts(streams: ActivityStreams | null): SegmentEffortData[] {
  const raw = (streams as Record<string, unknown> | null)?.segment_efforts;
  if (!Array.isArray(raw)) return [];
  return (raw as SegmentEffortData[]).slice().sort((a, b) => a.startIndex - b.startIndex);
}

export function getChartHighlightRange(
  hoveredSegment: SegmentEffortData | null,
  streams: ActivityStreams | null,
): [number, number] | undefined {
  if (!hoveredSegment || !streams?.distance) return undefined;
  const len = streams.distance.length;
  const interval = Math.max(1, Math.floor(len / 300));
  const start = Math.round(hoveredSegment.startIndex / interval);
  const end = Math.round(hoveredSegment.endIndex / interval);
  return [start, end];
}

export function getStreamPhotos(streams: ActivityStreams | null): PhotoData[] {
  const raw = (streams as Record<string, unknown> | null)?.photos;
  if (!Array.isArray(raw)) return [];
  return raw as PhotoData[];
}

export function buildChartOverlays(
  availableOverlays: OverlayConfig[],
  activeOverlays: Set<string>,
  sampledData: SampledPoint[],
  labelFor: (label: string) => string,
): OverlayDataset[] {
  return availableOverlays
    .filter((cfg) => activeOverlays.has(cfg.key))
    .map((cfg) => ({
      key: cfg.key,
      label: `${labelFor(cfg.label)} (${cfg.unit})`,
      data: sampledData.map((d) => cfg.getValue(d)),
      color: resolveCssColor(cfg.color),
      yAxisID: cfg.yAxisID,
      unit: cfg.unit,
    }));
}

/**
 * 서로 다른 단위의 선을 한 차트에서 읽을 수 있도록 비교 지표는 두 개까지만 유지한다.
 * 새 지표를 고르면 가장 먼저 선택한 지표를 교체하고, 마지막 선택을 축의 기준으로 삼는다.
 */
export function selectChartOverlay(
  activeOverlays: ReadonlySet<string>,
  key: string,
): { activeOverlays: Set<string>; focusedOverlayKey: string | null } {
  const next = new Set(activeOverlays);
  if (next.has(key)) {
    next.delete(key);
    const remainingKeys = [...next];
    return { activeOverlays: next, focusedOverlayKey: remainingKeys[remainingKeys.length - 1] ?? null };
  }
  if (next.size >= 2) next.delete(next.values().next().value as string);
  next.add(key);
  return { activeOverlays: next, focusedOverlayKey: key };
}
