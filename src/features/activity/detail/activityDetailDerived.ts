import type { OverlayDataset } from "../../../components/ElevationChart";
import type { ActivityStreams } from "@shared/types";

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
  powerSource: "sensorStreamsV1" | "watts" | "watts_calc" | null;
}

export interface AnalysisSensorSeries {
  values: number[];
  time: number[];
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

export interface SelectedPowerStream {
  source: StreamSensorSummary["powerSource"];
  /** Original samples, kept on their source axis for charts and analysis. */
  values: readonly (number | null)[] | null;
  /** Finite, non-negative samples used for summary statistics. */
  finiteValues: number[];
  hasCandidate: boolean;
}

export interface SelectedHeartRateStream {
  source: StreamSensorSummary["heartRateSource"];
  values: readonly (number | null)[] | null;
  positiveValues: number[];
  hasRejectedMeasurement: boolean;
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

function hasValidExplicitSensorChannelValues(values: readonly unknown[]): values is readonly (number | null)[] {
  if (!hasDenseArraySlots(values)) return false;
  return values.every((value) => value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= 0));
}

function hasValidLegacySensorChannelValues(values: readonly unknown[]): values is readonly number[] {
  if (!hasDenseArraySlots(values)) return false;
  return values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function hasSufficientAxisCoverage(valuesLength: number, expectedCount: number): boolean {
  return expectedCount <= 0
    || Math.abs(valuesLength - expectedCount) <= 1
    || Math.min(valuesLength, expectedCount) / Math.max(valuesLength, expectedCount) >= LEGACY_POWER_MIN_AXIS_COVERAGE;
}

function runtimeArray<T>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? value as T[] : undefined;
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
  return values?.every((sample) => Number.isSafeInteger(sample)) ? values : undefined;
}

function trustedLegacyPower(values: readonly number[] | undefined, expectedCount: number): number[] | null {
  if (!values?.length) return null;
  if (!hasValidLegacySensorChannelValues(values)) return null;

  if (!hasSufficientAxisCoverage(values.length, expectedCount)) return null;

  const positiveCount = values.filter((value) => value > 0).length;
  const coverageDenominator = Math.max(values.length, expectedCount, 1);
  return positiveCount / coverageDenominator >= LEGACY_POWER_MIN_POSITIVE_COVERAGE
    ? [...values]
    : null;
}

export function selectActivityPowerStream(streams: ActivityStreams | null): SelectedPowerStream {
  if (!streams) return { source: null, values: null, finiteValues: [], hasCandidate: false };

  const explicit = streams.sensorStreamsV1?.version === 1 ? streams.sensorStreamsV1 : null;
  const legacyWatts = runtimeArray<number>(streams.watts);
  const legacyCalculatedWatts = runtimeArray<number>(streams.watts_calc);
  const legacyTime = runtimeArray<number>(streams.time);
  const legacyDistance = runtimeArray<number>(streams.distance);
  const hasLegacyCandidate = !!legacyWatts?.length || !!legacyCalculatedWatts?.length;
  const expectedLegacyCount = Math.max(legacyTime?.length ?? 0, legacyDistance?.length ?? 0);
  if (explicit) {
    const rawWatts = (explicit as unknown as Record<string, unknown>).watts;
    if (rawWatts != null && !Array.isArray(rawWatts)) {
      return { source: null, values: null, finiteValues: [], hasCandidate: true };
    }
    const explicitWatts = runtimeArray<number | null>(rawWatts);
    if (explicitWatts && !hasValidExplicitSensorChannelValues(explicitWatts)) {
      return { source: null, values: null, finiteValues: [], hasCandidate: true };
    }
    const finiteValues = explicitWatts?.filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0,
    ) ?? [];
    // Measured V1 power is authoritative. HR-only V1 payloads still need the
    // legacy fallback because virtual power remains on the top-level axis.
    if (finiteValues.length > 0) {
      const explicitTime = runtimeArray<number>((explicit as unknown as Record<string, unknown>).time);
      if (!explicitTime || !hasValidExplicitAxis(
        explicitTime,
        explicitWatts?.length ?? 0,
        explicit.timeUnit,
        explicit.resolutionSeconds,
      )) {
        return { source: null, values: null, finiteValues: [], hasCandidate: true };
      }
      return {
        source: "sensorStreamsV1",
        values: explicitWatts ?? null,
        finiteValues,
        hasCandidate: true,
      };
    }
  }

  const trustedWatts = trustedLegacyPower(legacyWatts, expectedLegacyCount);
  if (trustedWatts) {
    return {
      source: "watts",
      values: legacyWatts ?? null,
      finiteValues: trustedWatts,
      hasCandidate: true,
    };
  }
  const trustedCalculatedWatts = trustedLegacyPower(legacyCalculatedWatts, expectedLegacyCount);
  if (trustedCalculatedWatts) {
    return {
      source: "watts_calc",
      values: legacyCalculatedWatts ?? null,
      finiteValues: trustedCalculatedWatts,
      hasCandidate: true,
    };
  }
  return { source: null, values: null, finiteValues: [], hasCandidate: hasLegacyCandidate };
}

function positiveValues(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}

function trustedLegacySensor(values: readonly number[] | undefined, expectedCount: number): number[] | null {
  if (!values?.length || !hasValidLegacySensorChannelValues(values)) return null;
  if (!hasSufficientAxisCoverage(values.length, expectedCount)) return null;
  const positive = positiveValues(values);
  return positive.length > 0 ? positive : null;
}

export function selectActivityHeartRateStream(streams: ActivityStreams | null): SelectedHeartRateStream {
  if (!streams) return { source: null, values: null, positiveValues: [], hasRejectedMeasurement: false };

  const explicit = streams.sensorStreamsV1?.version === 1 ? streams.sensorStreamsV1 : null;
  const rawExplicitHeartRate = explicit
    ? (explicit as unknown as Record<string, unknown>).heartrate
    : null;
  if (rawExplicitHeartRate != null && !Array.isArray(rawExplicitHeartRate)) {
    return { source: null, values: null, positiveValues: [], hasRejectedMeasurement: true };
  }
  const explicitHeartRate = runtimeArray<number | null>(rawExplicitHeartRate);
  if (explicitHeartRate && !hasValidExplicitSensorChannelValues(explicitHeartRate)) {
    return { source: null, values: null, positiveValues: [], hasRejectedMeasurement: true };
  }
  const explicitPositive = positiveValues(explicitHeartRate);
  if (explicit && explicitHeartRate && explicitPositive.length > 0) {
    const explicitTime = runtimeArray<number>((explicit as unknown as Record<string, unknown>).time);
    if (!explicitTime || !hasValidExplicitAxis(
      explicitTime,
      explicitHeartRate.length,
      explicit.timeUnit,
      explicit.resolutionSeconds,
    )) {
      return { source: null, values: null, positiveValues: [], hasRejectedMeasurement: true };
    }
    return {
      source: "sensorStreamsV1",
      values: explicitHeartRate,
      positiveValues: explicitPositive,
      hasRejectedMeasurement: false,
    };
  }

  const legacyHeartRate = runtimeArray<number>(streams.heartrate);
  const legacyTime = runtimeArray<number>(streams.time);
  const legacyDistance = runtimeArray<number>(streams.distance);
  const expectedLegacyCount = Math.max(legacyTime?.length ?? 0, legacyDistance?.length ?? 0);
  const legacyPositive = trustedLegacySensor(legacyHeartRate, expectedLegacyCount);
  if (legacyPositive) {
    return {
      source: "heartrate",
      values: legacyHeartRate ?? null,
      positiveValues: legacyPositive,
      hasRejectedMeasurement: false,
    };
  }
  return { source: null, values: null, positiveValues: [], hasRejectedMeasurement: false };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maximum(values: readonly number[]): number {
  return values.reduce((result, value) => Math.max(result, value), -Infinity);
}

export function deriveStreamSensorSummary(streams: ActivityStreams | null): StreamSensorSummary | null {
  if (!streams) return null;

  const selectedHeartRate = selectActivityHeartRateStream(streams);
  const heartRate = selectedHeartRate.positiveValues;
  const legacyTime = runtimeArray<number>(streams.time);
  const legacyDistance = runtimeArray<number>(streams.distance);
  const cadenceValues = runtimeArray<number>(streams.cadence);
  const cadence = trustedLegacySensor(
    cadenceValues,
    Math.max(legacyTime?.length ?? 0, legacyDistance?.length ?? 0),
  ) ?? [];
  const hasHeartRateStream = heartRate.length > 0;
  const hasCadenceStream = cadence.length > 0;
  const selectedPower = selectActivityPowerStream(streams);
  const power = selectedPower.finiteValues;
  const hasReliablePower = selectedPower.source != null;

  return {
    hasHeartRateStream,
    hasRejectedHeartRateStream: selectedHeartRate.hasRejectedMeasurement,
    hasCadenceStream,
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
  };
}

interface SavedPowerSummary {
  averagePower?: number | null;
  maxPower?: number | null;
}

function matchesSavedPower(actual: number | null, saved: number | null | undefined): boolean {
  return actual != null
    && saved != null
    && Number.isFinite(actual)
    && Number.isFinite(saved)
    && Math.round(actual) === Math.round(saved);
}

export function streamPowerReplacesSavedSummary(
  streamSummary: StreamSensorSummary | null,
  savedSummary: SavedPowerSummary,
): boolean {
  if (!streamSummary) return false;
  if (streamSummary.hasRejectedPowerStream) return true;
  if (!streamSummary.hasPowerStream) return false;
  return !matchesSavedPower(streamSummary.averagePower, savedSummary.averagePower)
    || !matchesSavedPower(streamSummary.maxPower, savedSummary.maxPower);
}

function measuredSeries(
  values: readonly (number | null)[],
  time: readonly number[],
  isMeasured: (value: number) => boolean,
  fixedStep?: number,
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
  return {
    values: measured.values,
    time: measuredTime,
    complete: values.length === time.length && measured.values.length === values.length,
  };
}

export function buildActivityAnalysisProjection(
  streams: ActivityStreams | null,
  preferTopLevelPower = false,
): ActivityAnalysisProjection | null {
  if (!streams) return null;

  const explicit = streams.sensorStreamsV1?.version === 1 ? streams.sensorStreamsV1 : null;
  const selectedPower = selectActivityPowerStream(streams);
  const selectedHeartRate = selectActivityHeartRateStream(streams);
  const normalizedTime = persistedTimeArray(streams.time);
  const normalizedDistance = persistedNumericArray(streams.distance, false);
  const normalizedCadence = persistedNumericArray(streams.cadence, false);
  const expectedLegacyCount = Math.max(
    runtimeArray<unknown>(streams.time)?.length ?? 0,
    runtimeArray<unknown>(streams.distance)?.length ?? 0,
  );
  const normalizedStreams: ActivityStreams = {
    ...streams,
    altitude: persistedNumericArray(streams.altitude, true),
    distance: normalizedDistance,
    time: normalizedTime,
    velocity_smooth: persistedNumericArray(streams.velocity_smooth, false),
    cadence: normalizedCadence && trustedLegacySensor(normalizedCadence, expectedLegacyCount)
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
  if (explicit) {
    const usesExplicitPower = !preferTopLevelPower && selectedPower.source === "sensorStreamsV1";
    const usesExplicitHeartRate = selectedHeartRate.source === "sensorStreamsV1";
    return {
      streams: {
        ...normalizedStreams,
        heartrate: projectedLegacyHeartRate,
        watts: preferTopLevelPower
          ? persistedNumericArray(streams.watts, false)
          : selectedPower.source === "watts" ? runtimeArray<number>(selectedPower.values) : undefined,
        watts_calc: !preferTopLevelPower && selectedPower.source === "watts_calc"
          ? runtimeArray<number>(selectedPower.values)
          : undefined,
      },
      heartRate: usesExplicitHeartRate
        ? measuredSeries(
            selectedHeartRate.values ?? [],
            runtimeArray<number>((explicit as unknown as Record<string, unknown>).time) ?? [],
            (value) => value > 0,
            explicit.resolutionSeconds,
          )
        : selectedHeartRate.source === "heartrate" ? legacyHeartRate : undefined,
      power: usesExplicitPower
        ? measuredSeries(
            selectedPower.values ?? [],
            runtimeArray<number>((explicit as unknown as Record<string, unknown>).time) ?? [],
            (value) => value >= 0,
            explicit.resolutionSeconds,
          )
        : undefined,
    };
  }

  const heartRate = legacyHeartRate;
  if (!preferTopLevelPower && selectedPower.hasCandidate && selectedPower.source == null) {
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
  if (!preferTopLevelPower && selectedPower.source === "watts_calc" && streams.watts?.length) {
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
      watts: preferTopLevelPower
        ? persistedNumericArray(streams.watts, false)
        : selectedPower.source === "watts" ? runtimeArray<number>(selectedPower.values) : undefined,
      watts_calc: !preferTopLevelPower && selectedPower.source === "watts_calc"
        ? runtimeArray<number>(selectedPower.values)
        : undefined,
    },
    heartRate,
  };
}

export function buildSampledData(streams: ActivityStreams | null): SampledPoint[] {
  if (!streams?.distance) return [];
  const dist = streams.distance;
  const len = dist.length;
  const interval = Math.max(1, Math.floor(len / 300));
  const selectedPower = selectActivityPowerStream(streams);
  const selectedHeartRate = selectActivityHeartRateStream(streams);
  const chartPower = selectedPower.source === "watts" || selectedPower.source === "watts_calc"
    ? selectedPower.values
    : null;
  const selectedIndexes = new Set<number>();
  for (let i = 0; i < len; i += interval) selectedIndexes.add(i);
  const chartChannels: Array<readonly (number | null)[] | undefined> = [
    streams.altitude,
    streams.velocity_smooth,
    selectedHeartRate.source === "heartrate" ? streams.heartrate : undefined,
    chartPower ?? undefined,
    streams.cadence,
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
      heartRate: selectedHeartRate.source === "heartrate" ? streams.heartrate?.[i] ?? 0 : 0,
      power: chartPower?.[i] ?? 0,
      cadence: streams.cadence?.[i] ?? 0,
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
