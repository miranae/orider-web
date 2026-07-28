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
  hasCadenceStream: boolean;
  hasPowerStream: boolean;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  averageCadence: number | null;
  maxCadence: number | null;
  averagePower: number | null;
  maxPower: number | null;
  hasReliablePower: boolean;
}

export interface AnalysisSensorSeries {
  values: number[];
  time: number[];
}

export interface ActivityAnalysisProjection {
  streams: ActivityStreams;
  heartRate?: AnalysisSensorSeries;
  power?: AnalysisSensorSeries;
}

const LEGACY_POWER_MIN_POSITIVE_SAMPLES = 25;
const LEGACY_POWER_MIN_POSITIVE_COVERAGE = 0.2;

function positiveValues(values: readonly (number | null | undefined)[] | undefined): number[] {
  return values?.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0) ?? [];
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maximum(values: readonly number[]): number {
  return values.reduce((result, value) => Math.max(result, value), -Infinity);
}

export function deriveStreamSensorSummary(streams: ActivityStreams | null): StreamSensorSummary | null {
  if (!streams) return null;

  const explicit = streams.sensorStreamsV1?.version === 1 ? streams.sensorStreamsV1 : null;
  const heartRate = positiveValues(explicit?.heartrate ?? streams.heartrate);
  const cadence = positiveValues(streams.cadence);
  const hasHeartRateStream = heartRate.length > 0;
  const hasCadenceStream = cadence.length > 0;
  const hasLegacyMeasuredWatts = !!streams.watts?.length;
  const legacyPowerSource = hasLegacyMeasuredWatts ? streams.watts! : streams.watts_calc ?? [];
  const hasPowerStream = explicit
    ? explicit.watts.some((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    : legacyPowerSource.length > 0;

  let power: number[] = [];
  let hasReliablePower = false;
  if (explicit) {
    power = explicit.watts.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
    hasReliablePower = power.length > 0;
  } else if (hasLegacyMeasuredWatts) {
    const finitePower = legacyPowerSource.filter((value) => Number.isFinite(value) && value >= 0);
    const positiveCount = finitePower.filter((value) => value > 0).length;
    const expectedCount = Math.max(
      legacyPowerSource.length,
      streams.time?.length ?? 0,
      streams.distance?.length ?? 0,
    );
    // Legacy Orider streams encoded both missing power and real coasting as 0.
    // Only a sufficiently populated stream is safe to interpret those zeros as measured 0 W.
    hasReliablePower = positiveCount >= LEGACY_POWER_MIN_POSITIVE_SAMPLES
      && positiveCount / expectedCount >= LEGACY_POWER_MIN_POSITIVE_COVERAGE;
    if (hasReliablePower) power = finitePower;
  } else if (legacyPowerSource.length) {
    power = legacyPowerSource.filter((value) => Number.isFinite(value) && value >= 0);
    hasReliablePower = power.length > 0;
  }

  return {
    hasHeartRateStream,
    hasCadenceStream,
    hasPowerStream,
    averageHeartRate: heartRate.length > 0 ? average(heartRate) : null,
    maxHeartRate: heartRate.length > 0 ? maximum(heartRate) : null,
    averageCadence: cadence.length > 0 ? average(cadence) : null,
    maxCadence: cadence.length > 0 ? maximum(cadence) : null,
    averagePower: hasReliablePower ? average(power) : null,
    maxPower: hasReliablePower ? maximum(power) : null,
    hasReliablePower,
  };
}

function measuredSeries(
  values: readonly (number | null)[],
  time: readonly number[],
  isMeasured: (value: number) => boolean,
  fixedStep?: number,
): AnalysisSensorSeries | undefined {
  const length = Math.min(values.length, time.length);
  let currentValues: number[] = [];
  const runs: number[][] = [];
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
    } else {
      if (currentValues.length > 0) runs.push(currentValues);
      currentValues = [];
    }
  }
  // 여러 측정 run을 이어 붙이면 가짜 rolling window가 되고 하나만 고르면 부하를
  // 과소평가한다. run-aware 집계가 도입되기 전에는 분석 지표를 숨기는 편이 안전하다.
  if (runs.length !== 1) return undefined;
  const measuredValues = runs[0]!;
  const positiveDiffs = time.slice(1)
    .map((value, index) => value - (time[index] ?? value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const step = fixedStep ?? positiveDiffs[(positiveDiffs.length - 1) >> 1] ?? 1;
  // 결측 구간의 벽시계 시간을 직전 측정값의 지속시간으로 오인하지 않도록,
  // 유일한 연속 측정 구간만 대표 간격으로 재배치한다.
  return { values: measuredValues, time: measuredValues.map((_, index) => index * step) };
}

export function buildActivityAnalysisProjection(
  streams: ActivityStreams | null,
  sensorSummary: StreamSensorSummary | null,
  preferTopLevelPower = false,
): ActivityAnalysisProjection | null {
  if (!streams) return null;

  const explicit = streams.sensorStreamsV1?.version === 1 ? streams.sensorStreamsV1 : null;
  if (explicit) {
    return {
      streams: {
        ...streams,
        heartrate: undefined,
        watts: preferTopLevelPower ? streams.watts : undefined,
        watts_calc: undefined,
      },
      heartRate: measuredSeries(explicit.heartrate, explicit.time, (value) => value > 0, explicit.resolutionSeconds),
      power: preferTopLevelPower
        ? undefined
        : measuredSeries(explicit.watts, explicit.time, (value) => value >= 0, explicit.resolutionSeconds),
    };
  }

  const legacyTime = streams.time ?? streams.heartrate?.map((_, index) => index) ?? [];
  const validLegacyHeartRateCount = positiveValues(streams.heartrate).length;
  const shouldRepairLegacyHeartRate = !!streams.heartrate?.length
    && validLegacyHeartRateCount / streams.heartrate.length <= 0.5;
  const heartRate = shouldRepairLegacyHeartRate && streams.heartrate
    ? measuredSeries(streams.heartrate, legacyTime, (value) => value > 0)
    : undefined;
  if (!preferTopLevelPower && sensorSummary?.hasPowerStream && !sensorSummary.hasReliablePower) {
    return {
      streams: {
        ...streams,
        heartrate: shouldRepairLegacyHeartRate ? undefined : streams.heartrate,
        watts: undefined,
        watts_calc: undefined,
      },
      heartRate,
    };
  }
  return {
    streams: shouldRepairLegacyHeartRate ? { ...streams, heartrate: undefined } : streams,
    heartRate,
  };
}

export function buildSampledData(streams: ActivityStreams | null): SampledPoint[] {
  if (!streams?.distance) return [];
  const dist = streams.distance;
  const len = dist.length;
  const interval = Math.max(1, Math.floor(len / 300));
  const hasIndependentSensors = streams.sensorStreamsV1?.version === 1;
  const selectedIndexes = new Set<number>();
  for (let i = 0; i < len; i += interval) selectedIndexes.add(i);
  const chartChannels: Array<readonly number[] | undefined> = [
    streams.altitude,
    streams.velocity_smooth,
    hasIndependentSensors ? undefined : streams.heartrate,
    hasIndependentSensors ? undefined : (streams.watts?.length ? streams.watts : streams.watts_calc),
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
      heartRate: hasIndependentSensors ? 0 : streams.heartrate?.[i] ?? 0,
      power: hasIndependentSensors ? 0 : (streams.watts?.[i] ?? streams.watts_calc?.[i]) ?? 0,
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
  const altitude = streams?.altitude?.filter(Number.isFinite) ?? [];
  if (altitude.length === 0) return null;
  const minElev = altitude.reduce((result, value) => Math.min(result, value), Infinity);
  const maxElev = maximum(altitude);
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
