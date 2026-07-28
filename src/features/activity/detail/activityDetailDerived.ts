import type { OverlayDataset } from "../../../components/ElevationChart";
import type { ActivityStreams, ActivitySummary } from "@shared/types";
import { inferUniformSampleTimeAxis } from "../../../utils/sampleTime";

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
  | "insufficient_measurements";

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
  timeOriginEpochMs?: number;
  /** True only when every sample on the source sensor axis was measured. */
  complete?: boolean;
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

function hasValidExplicitAxis(
  time: readonly number[],
  channelLength: number,
  timeUnit: unknown,
  resolutionSeconds: unknown,
): boolean {
  if (channelLength === 0 || channelLength !== time.length) return false;
  if (timeUnit !== "relative_seconds" || resolutionSeconds !== 1 || !Number.isFinite(resolutionSeconds)) return false;
  for (let index = 0; index < time.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(time, index)) return false;
    const timestamp = time[index];
    if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp < 0) return false;
    if (index > 0 && timestamp - time[index - 1]! !== resolutionSeconds) return false;
  }
  return true;
}

function hasDenseArraySlots(values: readonly unknown[]): boolean {
  for (let index = 0; index < values.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) return false;
  }
  return true;
}

function hasValidExplicitSensorChannelValues(values: readonly unknown[]): boolean {
  if (!hasDenseArraySlots(values)) return false;
  return values.every((value) => value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= 0));
}

function hasValidLegacySensorChannelValues(values: readonly unknown[]): boolean {
  if (!hasDenseArraySlots(values)) return false;
  return values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function hasSufficientAxisCoverage(
  valuesLength: number,
  expectedCount: number,
  expectedIsMinimum = false,
): boolean {
  if (expectedIsMinimum) {
    return expectedCount <= 0 || valuesLength / expectedCount >= LEGACY_POWER_MIN_AXIS_COVERAGE;
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

function validTimeDurationSec(value: unknown): number | undefined {
  const time = runtimeArray<unknown>(value);
  if (!time || time.length < 2 || !hasDenseArraySlots(time)) return undefined;
  if (!time.every((sample) => typeof sample === "number" && Number.isFinite(sample) && sample >= 0)) {
    return undefined;
  }
  const numericTime = time as number[];
  const divisor = numericTime[0]! >= 1_000_000_000_000 ? 1000 : 1;
  const deltas = numericTime.slice(1).map((sample, index) => sample - numericTime[index]!);
  if (deltas.some((delta) => delta <= 0)) return undefined;
  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const representativeStep = (sortedDeltas[Math.floor(sortedDeltas.length / 2)] ?? divisor) / divisor;
  return (numericTime[numericTime.length - 1]! - numericTime[0]!) / divisor + representativeStep;
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
  minimumOnly: boolean;
  summaryDurationSec?: number;
  timeAxisLength: number;
  timeDurationSec?: number;
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
  const timeDurationSec = validTimeDurationSec(streams.time);
  const timeAxisLength = timeDurationSec != null ? reliableRouteAxisLength(streams.time) : 0;
  const validSummaryDuration = typeof summaryDurationSec === "number"
    && Number.isFinite(summaryDurationSec)
    && summaryDurationSec > 0
    ? summaryDurationSec
    : undefined;
  if (validSummaryDuration != null) {
    // Legacy sensor streams may be sampled faster than 1 Hz. Summary duration is therefore
    // a lower bound on samples, not an axis whose count must match symmetrically.
    return {
      count: Math.ceil(validSummaryDuration),
      minimumOnly: true,
      summaryDurationSec: validSummaryDuration,
      timeAxisLength,
      timeDurationSec,
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
    timeAxisLength,
    timeDurationSec,
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
  if (usesLegacyTimeCoverage(valuesLength, expectation)) {
    return expectation.timeDurationSec! / expectation.summaryDurationSec! >= LEGACY_POWER_MIN_AXIS_COVERAGE;
  }
  return hasSufficientAxisCoverage(valuesLength, expectation.count, expectation.minimumOnly);
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
  // V1 is validated as a contiguous 1 Hz axis. Expand the percentage bounds to
  // an absolute second on short rides so endpoint rounding cannot reject a valid sample.
  const allowedDifference = Math.max(
    1,
    expectedDuration * EXPLICIT_SENSOR_DURATION_TOLERANCE,
  );
  if (Math.abs(measuredDuration - expectedDuration) > allowedDifference + roundingEpsilon) {
    return "duration_mismatch";
  }

  const routeTime = runtimeArray<number>(streams.time);
  const routeStart = routeTime?.[0];
  const expectedStartEpochMs = normalizeEpochMs(routeStart) ?? normalizeEpochMs(activityStartTime);
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

function persistedTimeArray(value: unknown): number[] | undefined {
  const values = persistedNumericArray(value, false);
  if (!values) return undefined;
  const firstUnit = values[0]! >= 1_000_000_000_000
    ? "epoch_ms"
    : values[0]! >= 1_000_000_000 ? "epoch_sec" : "relative";
  for (let index = 0; index < values.length; index++) {
    const sample = values[index]!;
    const sampleUnit = sample >= 1_000_000_000_000
      ? "epoch_ms"
      : sample >= 1_000_000_000 ? "epoch_sec" : "relative";
    if (sampleUnit !== firstUnit) return undefined;
    if (index > 0 && sample <= values[index - 1]!) return undefined;
    // Fractional relative seconds are valid for routes sampled above 1 Hz. Keep
    // absolute epoch axes integer-safe so later millisecond normalization is exact.
    if (values[0]! >= 1_000_000_000_000 && !Number.isSafeInteger(sample)) return undefined;
    if (values[0]! >= 1_000_000_000 && values[0]! < 1_000_000_000_000
      && !Number.isSafeInteger(sample * 1000)) return undefined;
  }
  return values;
}

interface ChartTimeAxis {
  relativeSec: number[];
  originEpochMs?: number;
  durationSec: number;
}

function normalizeEpochMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1_000_000_000) return undefined;
  const epochMs = value < 1_000_000_000_000 ? value * 1000 : value;
  return Number.isSafeInteger(epochMs) ? epochMs : undefined;
}

function chartRouteTimeAxis(
  streams: ActivityStreams,
  routeLength: number,
  activityStartTime?: number,
): ChartTimeAxis | undefined {
  const time = persistedTimeArray(streams.time);
  if (!time?.length || time.length !== routeLength) return undefined;
  const first = time[0]!;
  const epochOrigin = normalizeEpochMs(first);
  const relativeSec = time.map((sample) => epochOrigin == null
    ? sample - first
    : (normalizeEpochMs(sample)! - epochOrigin) / 1000);
  if (relativeSec.some((sample, index) => !Number.isFinite(sample)
    || (index > 0 && sample <= relativeSec[index - 1]!))) return undefined;
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
    const overrideTime = persistedTimeArray(context.powerOverride?.time);
    const routeTime = persistedTimeArray(streams.time);
    return values.length === routeLength
      && overrideTime?.length === values.length
      && routeTime?.length === routeLength
      && overrideTime.every((sample, index) => sample === routeTime[index])
      ? [...values]
      : undefined;
  }
  const routeAxis = chartRouteTimeAxis(streams, routeLength, context.activityStartTime);
  if (!routeAxis) return undefined;

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
    const overrideTime = persistedTimeArray(context.powerOverride.time);
    const routeTime = persistedTimeArray(streams.time);
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
      if (!explicitTime || !hasValidExplicitAxis(
        explicitTime,
        explicitWatts?.length ?? 0,
        explicit.timeUnit,
        explicit.resolutionSeconds,
      )) {
        return {
          source: null, values: null, finiteValues: [], hasCandidate: true,
          rejection: {
            channel: "power", source: "sensorStreamsV1", reason: "invalid_axis",
            axisLength: explicitTime?.length, channelLength: explicitWatts?.length,
          },
        };
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
): number[] | null {
  if (!values?.length || !hasValidLegacySensorChannelValues(values)) return null;
  if (!hasLegacyCoverage(values.length, expectation)) return null;
  const positive = positiveValues(values);
  return positive.length > 0 ? positive : null;
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
  if (explicit && explicitHeartRate && explicitPositive.length > 0) {
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
    if (!explicitTime || !hasValidExplicitAxis(
      explicitTime,
      explicitHeartRate.length,
      explicit.timeUnit,
      explicit.resolutionSeconds,
    )) {
      return {
        source: null, values: null, positiveValues: [], hasRejectedMeasurement: true,
        rejection: {
          channel: "heart_rate", source: "sensorStreamsV1", reason: "invalid_axis",
          axisLength: explicitTime?.length, channelLength: explicitHeartRate.length,
        },
      };
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
  const rawCadence = (streams as unknown as Record<string, unknown>).cadence;
  const cadenceValues = runtimeArray<number>(rawCadence);
  const cadence = trustedLegacySensor(
    cadenceValues,
    legacyCoverageExpectation(streams, context.legacyDurationSec, true),
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

  return {
    hasHeartRateStream,
    hasRejectedHeartRateStream: selectedHeartRate.hasRejectedMeasurement,
    hasCadenceStream,
    hasRejectedCadenceStream: hasCadenceCandidate && !hasCadenceStream,
    hasPowerStream: hasReliablePower,
    averageHeartRate: heartRate.length > 0 ? average(heartRate) : null,
    maxHeartRate: heartRate.length > 0 ? maximum(heartRate) : null,
    averageCadence: cadence.length > 0 ? average(cadence) : null,
    maxCadence: cadence.length > 0 ? maximum(cadence) : null,
    averagePower: hasReliablePower ? average(power) : null,
    maxPower: hasReliablePower ? maximum(power) : null,
    hasReliablePower,
    hasRejectedPowerStream: selectedPower.hasCandidate && !hasReliablePower,
    heartRateSource: selectedHeartRate.source,
    powerSource: selectedPower.source,
    rejections: [selectedHeartRate.rejection, selectedPower.rejection, cadenceRejection]
      .filter((rejection): rejection is SensorRejectionDiagnostic => rejection != null),
  };
}

function measuredSeries(
  values: readonly (number | null)[],
  time: readonly number[],
  isMeasured: (value: number) => boolean,
  fixedStep?: number,
  timeOriginEpochMs?: unknown,
): AnalysisSensorSeries | undefined {
  const length = Math.min(values.length, time.length);
  let currentValues: number[] = [];
  let currentTimes: number[] = [];
  const runs: Array<{ values: number[]; time: number[] }> = [];
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
      currentValues.push(value);
      currentTimes.push(timestamp);
    } else {
      if (currentValues.length > 0) runs.push({ values: currentValues, time: currentTimes });
      currentValues = [];
      currentTimes = [];
    }
  }
  // 여러 측정 run을 이어 붙이면 가짜 rolling window가 되고 하나만 고르면 부하를
  // 과소평가한다. run-aware 집계가 도입되기 전에는 분석 지표를 숨기는 편이 안전하다.
  if (runs.length !== 1) return undefined;
  const measured = runs[0]!;
  const positiveDiffs = time.slice(1)
    .map((value, index) => value - (time[index] ?? value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const step = fixedStep ?? positiveDiffs[(positiveDiffs.length - 1) >> 1] ?? 1;
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
    complete: values.length === time.length && measured.values.length === values.length,
    ...(validTimeOriginEpochMs != null ? { timeOriginEpochMs: validTimeOriginEpochMs } : {}),
  };
}

function canonicalOverrideAxis(
  time: readonly number[],
  activityStartTime?: number,
): { time: number[]; timeOriginEpochMs?: number } | undefined {
  const normalized = persistedTimeArray(time);
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
  const normalizedTime = persistedTimeArray(streams.time);
  const normalizedDistance = persistedNumericArray(streams.distance, false);
  const normalizedCadence = persistedNumericArray(streams.cadence, false);
  const cadenceExpectation = legacyCoverageExpectation(streams, context.legacyDurationSec, true);
  const normalizedStreams: ActivityStreams = {
    ...streams,
    altitude: persistedNumericArray(streams.altitude, true),
    distance: normalizedDistance,
    time: normalizedTime,
    velocity_smooth: persistedNumericArray(streams.velocity_smooth, false),
    cadence: normalizedCadence && trustedLegacySensor(normalizedCadence, cadenceExpectation)
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
  const legacyTime = topLevelTime?.length
    ? topLevelTime
    : legacyHeartRateValues?.map((_, index) => index) ?? [];
  const shouldRepairLegacyHeartRate = !!legacyHeartRateValues?.length
    && selectedHeartRate.positiveValues.length / legacyHeartRateValues.length <= 0.5;
  const legacyHeartRate = shouldRepairLegacyHeartRate && legacyHeartRateValues
    ? measuredSeries(legacyHeartRateValues, legacyTime, (value) => value > 0)
    : undefined;
  const projectedLegacyHeartRate = legacyHeartRateValues && !shouldRepairLegacyHeartRate
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
          )
        : selectedHeartRate.source === "heartrate" ? legacyHeartRate : undefined,
      power: overridePower ?? (usesExplicitPower
        ? measuredSeries(
            selectedPower.values ?? [],
            runtimeArray<number>((explicit as unknown as Record<string, unknown>).time) ?? [],
            (value) => value >= 0,
            explicit.resolutionSeconds,
            explicit.timeOriginEpochMs,
          )
        : undefined),
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
    power: overridePower,
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
  ) ? cadenceValues : undefined;
  const chartHeartRate = alignSensorChannelForChart(
    selectedHeartRate.values,
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
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
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
      heartRate: chartHeartRate?.[i] ?? 0,
      power: chartPower?.[i] ?? 0,
      cadence: alignedCadence?.[i] ?? 0,
    });
  }
  return points;
}

export function getAvailableOverlays(sampledData: SampledPoint[]): OverlayConfig[] {
  if (sampledData.length === 0) return [];
  return OVERLAY_CONFIGS.filter((cfg) => sampledData.some((d) => cfg.getValue(d) > 0));
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
      label: `${labelFor(cfg.label)} (${cfg.unit})`,
      data: sampledData.map((d) => cfg.getValue(d)),
      color: resolveCssColor(cfg.color),
      yAxisID: cfg.yAxisID,
      unit: cfg.unit,
    }));
}
