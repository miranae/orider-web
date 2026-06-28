import type { OverlayDataset } from "../../../components/ElevationChart";
import type { ActivityStreams } from "@shared/types";

import {
  OVERLAY_CONFIGS,
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

export function buildSampledData(streams: ActivityStreams | null): SampledPoint[] {
  if (!streams?.distance) return [];
  const dist = streams.distance;
  const len = dist.length;
  const interval = Math.max(1, Math.floor(len / 300));
  const points: SampledPoint[] = [];
  for (let i = 0; i < len; i += interval) {
    points.push({
      latlng: streams.latlng?.[i] as [number, number] ?? null,
      distance: dist[i] ?? 0,
      altitude: (streams.altitude as number[] | undefined)?.[i] ?? 0,
      speed: (streams.velocity_smooth?.[i] ?? 0) * 3.6,
      heartRate: streams.heartrate?.[i] ?? 0,
      power: (streams.watts?.[i] ?? streams.watts_calc?.[i]) ?? 0,
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
  sampledData: SampledPoint[],
  averagePower: number | null | undefined,
): { minElev: number; maxElev: number; overlays: Record<string, { avg: number; max: number }> } | null {
  if (sampledData.length === 0) return null;
  const minElev = Math.min(...sampledData.map((d) => d.altitude));
  const maxElev = Math.max(...sampledData.map((d) => d.altitude));
  const stats: Record<string, { avg: number; max: number }> = {};
  for (const cfg of OVERLAY_CONFIGS) {
    const values = sampledData.map((d) => cfg.getValue(d)).filter((v) => v > 0);
    if (values.length > 0) {
      const canonicalAvg = cfg.key === "power" ? averagePower ?? null : null;
      stats[cfg.key] = {
        avg: canonicalAvg ?? values.reduce((a, b) => a + b, 0) / values.length,
        max: Math.max(...values),
      };
    }
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
      color: cfg.color,
      yAxisID: cfg.yAxisID,
      unit: cfg.unit,
    }));
}
