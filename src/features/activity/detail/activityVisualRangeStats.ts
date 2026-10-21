import type { ActivityStreams } from "@shared/types";
import { weightedMean } from "../../../utils/sampleTime";
import { normalizeEpochMilliseconds } from "../../../utils/timestampUnit";
import { buildActivityAnalysisProjection, buildAlignedActivityChartChannels, type ActivitySensorSelectionContext, type AnalysisSensorSeries } from "./activityDetailDerived";
import { elapsedRangeFromChartSelection } from "./activityRangeSelection";

/** Observed raw time-window values; never a replacement for stored server analysis metrics. */
export function activityVisualRangeStats(streams: ActivityStreams | null | undefined, context: ActivitySensorSelectionContext | undefined,
  axis: readonly number[] | null | undefined, sourceIndices: readonly number[] | undefined, range: readonly [number, number] | null | undefined) {
  if (!streams || !axis || !sourceIndices || !range || axis.length !== streams.distance?.length) return null;
  const window = elapsedRangeFromChartSelection(axis, sourceIndices, range);
  if (!window) return null;
  const aligned = buildAlignedActivityChartChannels(streams, context);
  const projection = buildActivityAnalysisProjection(streams, context);
  const steps = axis.slice(1).map((value, index) => value - axis[index]!).sort((a, b) => a - b);
  // Match the existing route-range UI boundary policy: never hold a sample across a >3× median gap.
  const maxGap = (steps[Math.floor(steps.length / 2)] ?? 0) * 3;
  const routeDurations = axis.map((time, index) => {
    const next = axis[index + 1];
    return next !== undefined && next - time <= maxGap ? next - time : 0;
  });
  const aggregate = (values: readonly (number | null)[] | undefined, times: readonly number[], durations: readonly number[], positive: boolean) => {
    if (!values || values.length !== times.length || durations.length !== times.length) return undefined;
    const measured: number[] = [], weights: number[] = [];
    let max = -Infinity;
    values.forEach((value, index) => {
      const duration = Math.max(0, Math.min(times[index]! + durations[index]!, window.endOffsetSec) - Math.max(times[index]!, window.startOffsetSec));
      if (value == null || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) return;
      if (duration > 0 || times[index]! >= window.startOffsetSec && times[index]! < window.endOffsetSec) max = Math.max(max, value);
      if (!Number.isFinite(duration) || duration <= 0) return;
      measured.push(value); weights.push(duration);
    });
    const avg = weightedMean(measured, weights);
    return avg === null ? undefined : { avg, max };
  };
  const sensor = (series: AnalysisSensorSeries | undefined, fallback: readonly (number | null)[] | undefined, positive: boolean) => {
    if (!series) return aggregate(fallback, axis, routeDurations, positive);
    const activityStart = normalizeEpochMilliseconds(context?.activityStartTime);
    if (activityStart == null || series.timeOriginEpochMs == null) return undefined;
    const offset = (series.timeOriginEpochMs - activityStart) / 1000;
    const times = series.time.map(time => time + offset);
    const durations = series.durationsSec ?? times.map((time, index) => series.segmentStarts?.[index + 1] ? 0 : Math.max(0, (times[index + 1] ?? time) - time));
    return aggregate(series.values, times, durations, positive);
  };
  const overlays: Record<string, { avg: number; max: number }> = {};
  const candidates = {
    speed: streams.velocity_smooth?.length === axis.length ? aggregate(streams.velocity_smooth.map(value => value == null ? null : value * 3.6), axis, routeDurations, false) : undefined,
    hr: sensor(projection?.heartRate, aligned.chartHeartRate, true),
    power: sensor(projection?.power, aligned.chartPower, false),
    cadence: aggregate(aligned.alignedCadence, axis, routeDurations, false),
  };
  Object.entries(candidates).forEach(([key, value]) => { if (value) overlays[key] = value; });
  const elevations = streams.altitude?.length === axis.length ? streams.altitude.filter((value, index): value is number => value != null && Number.isFinite(value) && axis[index]! >= window.startOffsetSec && axis[index]! < window.endOffsetSec) : [];
  return { minElev: elevations.length ? Math.min(...elevations) : NaN, maxElev: elevations.length ? Math.max(...elevations) : NaN, overlays };
}
