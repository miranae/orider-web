import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend, type Chart, type Plugin } from 'chart.js';
import { color } from 'chart.js/helpers';
import { Plus, Minus, RotateCcw, SquareDashedMousePointer } from 'lucide-react';
import type { ChartColorTokens } from '../tokens/colors';
import { DEFAULT_TYPOGRAPHY } from '../tokens/typography';
import { sampleChartSeries, type ChartSeriesPoint, type ChartSamplingPolicy } from '../charts/seriesSampling';
import { CHART_PRESENTATION, CHART_PRESENTATION_DENSITY } from '../charts/chartPresentation';
import { ChartFrame, ChartLane, ChartPlot, ChartRangeCaption } from './Chart';
import { ControlToolbar, ToolbarButton, ToolbarGroup } from './ControlToolbar';

let chartRegistered = false;
function registerChart() {
  if (chartRegistered) return;
  ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);
  chartRegistered = true;
}

export interface ComparisonChartSeries { id: string; label: string; color: string; points: readonly ChartSeriesPoint[]; borderDash?: number[] }
export interface ComparisonChartLane {
  id: string; label: string; unit: string; series: readonly ComparisonChartSeries[];
  subdued?: boolean; beginAtZero?: boolean; sampled?: boolean; tension?: number; lineWeight?: 'standard' | 'readable';
  /** 기본 conservative 유지. preserve-runs는 평균 bin 예산에 실제 공백 경계 표시점을 추가한다. */
  samplingPolicy?: ChartSamplingPolicy;
}
export interface ComparisonChartLabels {
  controls: string; zoomIn: string; zoomOut: string; selectRange: string; selectRangeShort: string;
  reset: string; rangeHint: string; empty: string;
}
export interface ComparisonChartProps {
  lanes: readonly ComparisonChartLane[];
  domain: readonly [number, number];
  minSpan: number;
  axisKey: string;
  colors: Pick<ChartColorTokens, 'grid' | 'gridAxis' | 'gridLabel'>;
  formatTick?: (value: number) => string;
  rangeLabel: (start: number, end: number) => string;
  selectedCoordinate: number | null;
  onHoverCoordinate: (coordinate: number | null) => void;
  onViewportChange?: (range: [number, number] | null, fullRange: [number, number]) => void;
  labels: ComparisonChartLabels;
  description?: ReactNode;
  beforePlot?: ReactNode;
}

const cursorStates = new WeakMap<Chart<'line'>, { coordinate: number | null; range: [number, number] | null; color: string }>();
const cursor: Plugin<'line'> = {
  id: 'comparisonChartCursor',
  afterDatasetsDraw(chart) {
    const state = cursorStates.get(chart);
    if (!state) return;
    const { ctx, chartArea, scales } = chart;
    ctx.save();
    ctx.beginPath(); ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top); ctx.clip();
    if (state.range) {
      const x1 = scales.x!.getPixelForValue(state.range[0]), x2 = scales.x!.getPixelForValue(state.range[1]);
      ctx.fillStyle = color(state.color).alpha(0.1).rgbString(); ctx.fillRect(Math.min(x1, x2), chartArea.top, Math.abs(x2 - x1), chartArea.bottom - chartArea.top);
    }
    if (state.coordinate != null) {
      const x = scales.x!.getPixelForValue(state.coordinate);
      ctx.strokeStyle = state.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
    }
    ctx.restore();
  },
};
const CURSOR_PLUGINS = [cursor];

/** 준비된 좌표만 그린다. 권한·단위·시계·공백 판단과 원본 수치 비교는 호출자가 소유한다. */
export function ComparisonChart({ lanes, domain: fullDomain, minSpan: requestedMinSpan, axisKey, colors, formatTick, rangeLabel, selectedCoordinate, onHoverCoordinate, onViewportChange, labels, description, beforePlot }: ComparisonChartProps) {
  registerChart();
  const chartFrame = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, Chart<'line'> | null>>({});
  const [plotWidth, setPlotWidth] = useState(800);
  const [fontFamily, setFontFamily] = useState('system-ui');
  const [viewport, setViewport] = useState<{ key: string; range: [number, number] } | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [dragRange, setDragRange] = useState<[number, number] | null>(null);
  const rangeStart = useRef<number | null>(null);
  const pendingCoordinate = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const queueCoordinate = useCallback((coordinate: number) => {
    pendingCoordinate.current = coordinate;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; if (pendingCoordinate.current != null) onHoverCoordinate(pendingCoordinate.current); });
  }, [onHoverCoordinate]);
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); frame.current = null; pendingCoordinate.current = null; }, [axisKey]);
  useEffect(() => {
    const element = chartFrame.current;
    if (!element) return;
    const family = getComputedStyle(element).getPropertyValue('--font-sans').trim();
    if (family) setFontFamily(family);
    const measure = () => { const width = element.getBoundingClientRect().width - CHART_PRESENTATION.axisWidth; if (width > 0) setPlotWidth(previous => Math.abs(previous - width) >= CHART_PRESENTATION_DENSITY.resizeStep ? width : previous); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const globalMin = fullDomain[0], globalMax = fullDomain[1];
  const minSpan = Math.min(globalMax - globalMin, requestedMinSpan);
  const domain = useMemo<[number, number]>(() => viewport?.key === axisKey ? [Math.max(globalMin, Math.min(viewport.range[0], globalMax - minSpan)), Math.min(globalMax, Math.max(viewport.range[1], globalMin + minSpan))] : [globalMin, globalMax], [viewport, globalMin, globalMax, minSpan, axisKey]);
  useEffect(() => { onViewportChange?.(domain[0] === globalMin && domain[1] === globalMax ? null : [domain[0], domain[1]], [globalMin, globalMax]); }, [domain[0], domain[1], globalMin, globalMax, onViewportChange]);
  useEffect(() => { setViewport(null); setRangeMode(false); setDragRange(null); rangeStart.current = null; }, [axisKey]);
  const zoom = (factor: number) => {
    const span = Math.min(globalMax - globalMin, Math.max(minSpan, (domain[1] - domain[0]) * factor));
    const center = selectedCoordinate != null && selectedCoordinate >= domain[0] && selectedCoordinate <= domain[1] ? selectedCoordinate : (domain[0] + domain[1]) / 2;
    const left = Math.max(globalMin, Math.min(center - span / 2, globalMax - span));
    setViewport({ key: axisKey, range: [left, left + span] });
  };
  const coordinateAt = (key: string, clientX: number) => {
    const chart = refs.current[key];
    if (!chart) return null;
    const x = clientX - chart.canvas.getBoundingClientRect().left;
    if (x < chart.chartArea.left || x > chart.chartArea.right) return null;
    const value = chart.scales.x!.getValueForPixel(x);
    return Number.isFinite(value) ? value : null;
  };
  const panels = useMemo(() => lanes.map(lane => ({ ...lane, chartData: { datasets: lane.series.map(series => ({
    id: series.id, label: series.label,
    data: lane.sampled ? sampleChartSeries(series.points, domain, plotWidth, lane.samplingPolicy) : Array.from(series.points),
    borderColor: color(series.color).alpha(lane.subdued ? CHART_PRESENTATION.backgroundLineOpacity : CHART_PRESENTATION.lineOpacity).rgbString(),
    borderDash: series.borderDash, backgroundColor: 'transparent', fill: CHART_PRESENTATION.fill,
    borderWidth: lane.subdued ? 1 : lane.lineWeight === 'readable' ? CHART_PRESENTATION.readableLineWidth : 1.5, pointRadius: 0, pointHoverRadius: 0, spanGaps: false, tension: lane.tension ?? CHART_PRESENTATION.lineTension,
  })) } })), [lanes, domain, plotWidth]);
  const refCallbacks = useMemo(() => Object.fromEntries(panels.map(panel => [panel.id, (chart: Chart<'line'> | undefined | null) => { refs.current[panel.id] = chart ?? null; }])), [panels]);
  const chartOptions = useMemo(() => Object.fromEntries(panels.map(panel => [panel.id, {
    responsive: true, maintainAspectRatio: false, animation: false as const, events: [],
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { type: 'linear' as const, min: domain[0], max: domain[1], grid: { display: false }, ticks: { maxTicksLimit: 6, color: colors.gridLabel, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.caption.size }, callback: (value: string | number) => formatTick?.(Number(value)) ?? Number(value).toFixed(1) }, title: { display: false } },
      y: { type: 'linear' as const, beginAtZero: panel.beginAtZero ?? false, afterFit: (scale: { width: number }) => { scale.width = CHART_PRESENTATION.axisWidth; }, grid: { color: panel.subdued ? 'transparent' : colors.grid }, ticks: { maxTicksLimit: 4, color: colors.gridLabel, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.caption.size } } },
    },
  }])), [panels, domain, colors, formatTick, fontFamily]);
  useEffect(() => {
    for (const chart of Object.values(refs.current)) if (chart) { cursorStates.set(chart, { coordinate: selectedCoordinate, range: dragRange, color: colors.gridAxis }); chart.draw(); }
  }, [selectedCoordinate, dragRange, panels, domain, colors.gridAxis]);
  const caption = rangeLabel(domain[0], domain[1]);
  return <div ref={chartFrame}><ChartFrame variant="embedded">
    <ControlToolbar aria-label={labels.controls}>
      <ToolbarGroup>
        <ToolbarButton iconOnly aria-label={labels.zoomIn} title={labels.zoomIn} disabled={domain[1] - domain[0] <= minSpan} onClick={() => zoom(0.5)}><Plus aria-hidden="true" /></ToolbarButton>
        <ToolbarButton iconOnly aria-label={labels.zoomOut} title={labels.zoomOut} disabled={domain[0] === globalMin && domain[1] === globalMax} onClick={() => zoom(2)}><Minus aria-hidden="true" /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarButton aria-label={labels.selectRange} aria-pressed={rangeMode} onClick={() => { setRangeMode(value => !value); setDragRange(null); rangeStart.current = null; }}><SquareDashedMousePointer aria-hidden="true" />{labels.selectRangeShort}</ToolbarButton>
      <ToolbarButton iconOnly aria-label={labels.reset} title={labels.reset} disabled={domain[0] === globalMin && domain[1] === globalMax && !rangeMode && dragRange == null} onClick={() => { setViewport(null); setRangeMode(false); setDragRange(null); rangeStart.current = null; }}><RotateCcw aria-hidden="true" /></ToolbarButton>
    </ControlToolbar>
    <ChartRangeCaption>{caption}</ChartRangeCaption>
    {description}
    {rangeMode && <ChartRangeCaption aria-live="off" role="status">{labels.rangeHint}</ChartRangeCaption>}
    {beforePlot}
    {panels.map(panel => <ChartLane key={panel.id} title={panel.label} unit={panel.unit} subdued={panel.subdued} aria-label={`${panel.label} (${panel.unit})`}>
      <ChartPlot tone={panel.subdued ? 'background' : 'metric'} gesture={rangeMode ? 'none' : 'pan-y'} empty={!panel.chartData.datasets.some(dataset => dataset.data.some(point => point.y != null)) ? labels.empty : undefined}
        onPointerDown={event => { const coordinate = coordinateAt(panel.id, event.clientX); if (coordinate == null) return; if (!rangeMode) { queueCoordinate(coordinate); return; } rangeStart.current = coordinate; setDragRange([coordinate, coordinate]); event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault(); }}
        onPointerMove={event => { const coordinate = coordinateAt(panel.id, event.clientX); if (coordinate == null) return; if (rangeMode && rangeStart.current != null) setDragRange([rangeStart.current, coordinate]); else if (!rangeMode) queueCoordinate(coordinate); }}
        onPointerUp={event => { if (!rangeMode || rangeStart.current == null) return; const coordinate = coordinateAt(panel.id, event.clientX); if (coordinate != null && Math.abs(coordinate - rangeStart.current) >= minSpan) setViewport({ key: axisKey, range: [Math.max(globalMin, Math.min(coordinate, rangeStart.current)), Math.min(globalMax, Math.max(coordinate, rangeStart.current))] }); rangeStart.current = null; setDragRange(null); setRangeMode(false); }}
        onPointerCancel={() => { rangeStart.current = null; setDragRange(null); }}>
        <Line role="img" aria-label={`${panel.label} (${panel.unit}) · ${caption}`} ref={refCallbacks[panel.id]} data={panel.chartData} datasetIdKey="id" plugins={CURSOR_PLUGINS} options={chartOptions[panel.id]} />
      </ChartPlot>
    </ChartLane>)}
  </ChartFrame></div>;
}
