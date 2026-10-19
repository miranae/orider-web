import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import InfoTip from "../../components/InfoTip";
import { ComparisonChart, type ComparisonChartLane } from "../../theme/components";
import { useOriderTheme } from "../../theme";
import { FUNCTIONAL_COLORS } from "../../theme/generated";
import { clockSampleTolerance } from "./groupRideClock";
import type { OverlayDataset } from "../../components/ElevationChart";

export type GroupRideOverlay = OverlayDataset & { elapsedAxisSec?: readonly number[]; borderDash?: number[] };
interface Props {
  data: { distance: number; elevation: number }[];
  baseLabel?: string;
  baseColor?: string;
  xAxis?: "distance" | "elapsed";
  elapsedAxisSec?: readonly number[];
  formatXAxisTick?: (value: number) => string;
  formatRangeValue?: (value: number) => string;
  xAxisLabel?: string;
  overlays?: GroupRideOverlay[];
  activeMetrics: ReadonlySet<string>;
  powerLabel?: string;
  beforePlot?: ReactNode;
  selectedCoordinate: number | null;
  onHoverCoordinate: (coordinate: number | null) => void;
  onViewportChange?: (range: [number, number] | null, fullRange: [number, number]) => void;
  /** 키보드 기준 표본은 페이지가 관리한다. */
  onHoverIndex?: (index: number | null) => void;
}

const EMPTY_OVERLAYS: GroupRideOverlay[] = [];
export default function GroupRidePerformanceChart({ data, baseLabel, baseColor, xAxis = "distance", elapsedAxisSec, formatXAxisTick, formatRangeValue, overlays = EMPTY_OVERLAYS, activeMetrics, powerLabel, beforePlot, selectedCoordinate, onHoverCoordinate, onViewportChange }: Props) {
  const { t } = useTranslation("group");
  const { variant } = useOriderTheme();
  const resolvedBaseColor = baseColor ?? FUNCTIONAL_COLORS.map.recordedTrack;
  const { lanes, globalMin, globalMax } = useMemo(() => {
  const points = (values: readonly (number | null)[], distances?: readonly number[], times?: readonly number[]) => {
    const tolerance = xAxis === "elapsed" ? clockSampleTolerance(times?.map(value => value * 1000)) / 60_000 : Infinity;
    let previous: number | null = null;
    return values.flatMap((value, index) => {
      const coordinate = xAxis === "elapsed" ? times?.[index] == null ? NaN : times[index]! / 60 : distances?.[index] == null ? NaN : distances[index]! / 1000;
      if (!Number.isFinite(coordinate)) { const boundary = previous; previous = null; return [{ x: boundary ?? NaN, y: null }]; }
      const point = { x: coordinate, y: value === null || !Number.isFinite(value) ? null : value };
      const result = previous != null && coordinate - previous > tolerance ? [{ x: (previous + coordinate) / 2, y: null }, point] : [point];
      previous = coordinate;
      return result;
    });
  };
  const elevation = [
    { label: baseLabel, color: resolvedBaseColor, values: points(data.map(point => point.elevation), data.map(point => point.distance), elapsedAxisSec) },
    ...overlays.filter(overlay => overlay.yAxisID === "yElev").map(overlay => ({ label: overlay.label, color: overlay.color, values: points(overlay.data, overlay.distance, overlay.elapsedAxisSec) })),
  ];
  const metricDefinitions = [
    { key: "hr", axis: "yHR", label: t("rides.streamLabels.hr"), unit: "bpm" },
    { key: "power", axis: "yPower", label: powerLabel ?? t("rides.streamLabels.power"), unit: "W" },
    { key: "speed", axis: "ySpeed", label: t("rides.streamLabels.speed"), unit: "km/h" },
    { key: "cadence", axis: "yCadence", label: t("ridePage.overlay.cadence"), unit: "rpm" },
  ];
  const lanes: ComparisonChartLane[] = metricDefinitions.filter(metric => activeMetrics.has(metric.key)).map(metric => ({
    id: metric.key, label: metric.label, unit: metric.unit, lineWeight: "readable", beginAtZero: metric.key !== "hr", sampled: metric.key === "power" || metric.key === "speed",
    samplingPolicy: metric.key === "power" || metric.key === "speed" ? "preserve-runs" : undefined,
    tension: metric.key === "power" || metric.key === "speed" ? 0 : 0.15,
    series: overlays.filter(overlay => overlay.yAxisID === metric.axis).map((overlay, index) => ({ id: overlay.key ?? `${metric.key}-${index}`, label: overlay.label, color: overlay.color, points: points(overlay.data, overlay.distance, overlay.elapsedAxisSec), borderDash: [] })),
  }));
  lanes.push({ id: "elevation", label: t("rides.streamLabels.elevation"), unit: "m", subdued: true, tension: 0.15,
    series: elevation.map((record, index) => ({ id: `elevation-${index}`, label: record.label ?? "", color: record.color, points: record.values })),
  });
  let globalMin = 0;
  let globalMax = xAxis === "elapsed" ? 1 / 60 : 0.1;
  for (const dataset of lanes.flatMap(lane => lane.series.map(record => record.points))) {
    for (const point of dataset) { if (Number.isFinite(point.x)) { globalMin = Math.min(globalMin, point.x); globalMax = Math.max(globalMax, point.x); } }
  }
  return { lanes, globalMin, globalMax };
  }, [data, baseLabel, resolvedBaseColor, xAxis, elapsedAxisSec, overlays, activeMetrics, powerLabel, t]);
  const rangeLabel = useCallback((start: number, end: number) => t("ridePage.chart.currentRange", { start: formatRangeValue?.(start) ?? formatXAxisTick?.(start) ?? start.toFixed(1), end: formatRangeValue?.(end) ?? formatXAxisTick?.(end) ?? end.toFixed(1), unit: xAxis === "elapsed" ? "" : "km" }), [formatRangeValue, formatXAxisTick, t, xAxis]);
  return <ComparisonChart lanes={lanes} domain={[globalMin, globalMax]} minSpan={xAxis === "elapsed" ? 1 / 60 : 0.1} axisKey={xAxis}
    colors={variant.chartColors} formatTick={formatXAxisTick} rangeLabel={rangeLabel}
    selectedCoordinate={selectedCoordinate} onHoverCoordinate={onHoverCoordinate} onViewportChange={onViewportChange}
    labels={{ controls: t("ridePage.chart.zoomControls"), zoomIn: t("ridePage.chart.zoomIn"), zoomOut: t("ridePage.chart.zoomOut"), selectRange: t("ridePage.chart.zoomRange"), selectRangeShort: t("ridePage.chart.rangeControl"), reset: t("ridePage.chart.resetZoom"), rangeHint: t("ridePage.chart.rangeHint"), empty: t("ridePage.chart.metricMissing") }}
    beforePlot={beforePlot}
    description={<p className="club-ride-section-note"><InfoTip tone="accent" content={t("ridePage.chart.samplingHelp")}>{t("ridePage.chart.samplingNote")}</InfoTip></p>} />;
}
