import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend, type Chart, type Plugin } from 'chart.js';
import { color } from 'chart.js/helpers';
import type { ChartColorTokens } from '../tokens/colors';
import { DEFAULT_TYPOGRAPHY } from '../tokens/typography';
import { chartSamplingGrid, sampleChartSeries, type ChartSamplingGrid, type ChartSeriesPoint, type ChartSamplingPolicy } from '../charts/seriesSampling';
import { panChartRange } from '../charts/chartViewport';
import { CHART_PRESENTATION, CHART_PRESENTATION_DENSITY } from '../charts/chartPresentation';
import { ChartFrame, ChartLane, ChartPlot, ChartRangeCaption } from './Chart';
import { ChartRangeControls, type ChartRangeMode } from './ChartRangeControls';

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
  controls: string; selectRange: string; selectRangeShort: string; panRange: string; panHint: string; panUnavailable: string;
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

const cursorStates = new WeakMap<Chart<'line'>, { coordinate: number | null; range: [number, number] | null; color: string; interactionColor: string }>();
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
      ctx.fillStyle = state.interactionColor; ctx.globalAlpha = 0.16; ctx.fillRect(Math.min(x1, x2), chartArea.top, Math.abs(x2 - x1), chartArea.bottom - chartArea.top);
      ctx.globalAlpha = 1; ctx.strokeStyle = state.interactionColor; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath();
      for (const x of [x1, x2]) { ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); }
      ctx.stroke();
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
  const [interactionColor, setInteractionColor] = useState(colors.gridAxis);
  useEffect(() => {
    const element = chartFrame.current;
    if (!element) return;
    // 부모 테마 provider의 passive effect가 루트 토큰을 갱신한 다음 읽는다.
    const pending = requestAnimationFrame(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent-text)';
      element.appendChild(probe);
      setInteractionColor(getComputedStyle(probe).color || colors.gridAxis);
      probe.remove();
    });
    return () => cancelAnimationFrame(pending);
  }, [colors.gridAxis, colors.gridLabel]);
  const [viewport, setViewport] = useState<{ key: string; range: [number, number] } | null>(null);
  const [mode, setMode] = useState<'inspect' | 'select' | 'pan'>('inspect');
  const [panLock, setPanLock] = useState<{ axis: string; lanes: readonly ComparisonChartLane[]; width: number; span: number; grid: ChartSamplingGrid; y: Record<string, { min: number; max: number }> } | null>(null);
  const panFrame = useRef<number | null>(null);
  const pendingPan = useRef<number | null>(null);
  const cancelPanFrame = useCallback(() => { if (panFrame.current != null) cancelAnimationFrame(panFrame.current); panFrame.current = null; pendingPan.current = null; }, []);
  const [dragRange, setDragRange] = useState<[number, number] | null>(null);
  const drag = useRef<{ pointerId: number; target: HTMLDivElement; mode: 'select' | 'pan'; axis: string; domain: [number, number]; bounds: [number, number]; clientX: number; left: number; width: number } | null>(null);
  const clearDrag = useCallback((rollback = false) => {
    cancelPanFrame();
    const previous = drag.current;
    drag.current = null;
    if (previous) {
      if (previous.target.hasPointerCapture?.(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId);
      if (rollback && previous.mode === 'pan') setViewport({ key: previous.axis, range: previous.domain });
    }
    setDragRange(null);
  }, [cancelPanFrame]);
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
  useEffect(() => { clearDrag(); setViewport(null); setMode('inspect'); }, [axisKey, clearDrag]);
  useEffect(() => { clearDrag(); }, [globalMin, globalMax, clearDrag]);
  useEffect(() => () => { cancelPanFrame(); const previous = drag.current; drag.current = null; if (previous?.target.hasPointerCapture?.(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId); }, [cancelPanFrame]);
  const narrowed = domain[0] !== globalMin || domain[1] !== globalMax;
  const activePanLock = panLock?.axis === axisKey && panLock.lanes === lanes && panLock.width === plotWidth && Math.abs(panLock.span - (domain[1] - domain[0])) < Math.max(1, panLock.span) * 1e-9 ? panLock : null;
  useEffect(() => { clearDrag(); setPanLock(null); setMode(current => current === 'pan' ? 'inspect' : current); }, [axisKey, lanes, plotWidth, clearDrag]);
  const capturePanLock = () => {
    const y: Record<string, { min: number; max: number }> = {};
    for (const lane of lanes) {
      const scale = refs.current[lane.id]?.scales.y;
      const actualMin = scale && Number.isFinite(scale.min) ? scale.min : Infinity;
      const actualMax = scale && Number.isFinite(scale.max) ? scale.max : -Infinity;
      let min = actualMin, max = actualMax;
      for (const series of lane.series) for (const point of series.points) {
        if (!Number.isFinite(point.x) || point.y == null || !Number.isFinite(point.y)) continue;
        min = Math.min(min, point.y); max = Math.max(max, point.y);
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
      const span = max - min || Math.max(1, Math.abs(max) * .1);
      const step = 10 ** Math.floor(Math.log10(span)) / 2;
      if (min < actualMin) min = lane.beginAtZero && min >= 0 ? 0 : Math.floor((min - span * .05) / step) * step;
      if (max > actualMax) max = lane.beginAtZero && max <= 0 ? 0 : Math.ceil((max + span * .05) / step) * step;
      if (min === max) { min -= step; max += step; }
      y[lane.id] = { min, max };
    }
    setPanLock({ axis: axisKey, lanes, width: plotWidth, span: domain[1] - domain[0], grid: chartSamplingGrid(domain, plotWidth, globalMin), y });
  };
  useEffect(() => { if (!narrowed && mode === 'pan') { clearDrag(); setMode('inspect'); } }, [narrowed, mode, clearDrag]);
  const changeMode = (next: ChartRangeMode) => {
    clearDrag(true);
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null; pendingCoordinate.current = null;
    if (next === 'pan' && !activePanLock) capturePanLock();
    setMode(next);
  };
  const pointerDown = (key: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false || drag.current) return;
    const coordinate = coordinateAt(key, event.clientX);
    if (coordinate == null) return;
    if (mode === 'inspect') { queueCoordinate(coordinate); return; }
    if (mode === 'pan' && !activePanLock) capturePanLock();
    const chart = refs.current[key]!;
    const width = chart.chartArea.right - chart.chartArea.left;
    if (width <= 0 || (mode === 'pan' && !narrowed)) return;
    drag.current = { pointerId: event.pointerId, target: event.currentTarget, mode, axis: axisKey, domain: [...domain], bounds: [globalMin, globalMax], clientX: event.clientX, left: chart.canvas.getBoundingClientRect().left + chart.chartArea.left, width };
    if (mode === 'select') setDragRange([coordinate, coordinate]);
    event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault();
  };
  const dragCoordinate = (current: NonNullable<typeof drag.current>, clientX: number) => current.domain[0] + Math.max(0, Math.min(1, (clientX - current.left) / current.width)) * (current.domain[1] - current.domain[0]);
  const pointerMove = (key: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current) {
      if (event.pointerId !== current.pointerId) return;
      if (current.mode === 'pan') {
        pendingPan.current = event.clientX;
        if (panFrame.current == null) panFrame.current = requestAnimationFrame(() => {
          panFrame.current = null;
          if (drag.current !== current || pendingPan.current == null) return;
          const clientX = pendingPan.current; pendingPan.current = null;
          setViewport({ key: current.axis, range: panChartRange(current.domain, clientX - current.clientX, current.width, current.bounds) });
        });
      }
      else setDragRange([dragCoordinate(current, current.clientX), dragCoordinate(current, event.clientX)]);
    } else if (mode === 'inspect' && event.isPrimary !== false) {
      const coordinate = coordinateAt(key, event.clientX); if (coordinate != null) queueCoordinate(coordinate);
    }
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (current.mode === 'select') {
      const from = dragCoordinate(current, current.clientX), to = dragCoordinate(current, event.clientX);
      if (Math.abs(to - from) >= minSpan) setViewport({ key: current.axis, range: [Math.min(from, to), Math.max(from, to)] });
      setMode('inspect');
    } else setViewport({ key: current.axis, range: panChartRange(current.domain, event.clientX - current.clientX, current.width, current.bounds) });
    clearDrag();
  };
  const coordinateAt = (key: string, clientX: number) => {
    const chart = refs.current[key];
    if (!chart) return null;
    const x = clientX - chart.canvas.getBoundingClientRect().left;
    if (x < chart.chartArea.left || x > chart.chartArea.right) return null;
    const value = chart.scales.x!.getValueForPixel(x);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const panels = useMemo(() => lanes.map(lane => ({ ...lane, chartData: { datasets: lane.series.map(series => ({
    id: series.id, label: series.label,
    data: lane.sampled ? sampleChartSeries(series.points, domain, plotWidth, lane.samplingPolicy, activePanLock?.grid) : Array.from(series.points),
    borderColor: color(series.color).alpha(lane.subdued ? CHART_PRESENTATION.backgroundLineOpacity : CHART_PRESENTATION.lineOpacity).rgbString(),
    borderDash: series.borderDash, backgroundColor: 'transparent', fill: CHART_PRESENTATION.fill,
    borderWidth: lane.subdued ? 1 : lane.lineWeight === 'readable' ? CHART_PRESENTATION.readableLineWidth : 1.5, pointRadius: 0, pointHoverRadius: 0, spanGaps: false, tension: lane.tension ?? CHART_PRESENTATION.lineTension,
  })) } })), [lanes, domain, plotWidth, activePanLock]);
  const refCallbacks = useMemo(() => Object.fromEntries(panels.map(panel => [panel.id, (chart: Chart<'line'> | undefined | null) => { refs.current[panel.id] = chart ?? null; }])), [panels]);
  const chartOptions = useMemo(() => Object.fromEntries(panels.map(panel => [panel.id, {
    responsive: true, maintainAspectRatio: false, animation: false as const, events: [],
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { type: 'linear' as const, min: domain[0], max: domain[1], grid: { display: false }, ticks: { maxTicksLimit: 6, color: colors.gridLabel, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.caption.size }, callback: (value: string | number) => formatTick?.(Number(value)) ?? Number(value).toFixed(1) }, title: { display: false } },
      y: { type: 'linear' as const, ...(mode === 'pan' ? activePanLock?.y[panel.id] : undefined), beginAtZero: panel.beginAtZero ?? false, afterFit: (scale: { width: number }) => { scale.width = CHART_PRESENTATION.axisWidth; }, grid: { color: panel.subdued ? 'transparent' : colors.grid }, ticks: { maxTicksLimit: 4, color: colors.gridLabel, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.caption.size } } },
    },
  }])), [panels, domain, colors, formatTick, fontFamily, mode, activePanLock]);
  useEffect(() => {
    for (const chart of Object.values(refs.current)) if (chart) { cursorStates.set(chart, { coordinate: selectedCoordinate, range: dragRange, color: colors.gridAxis, interactionColor }); chart.draw(); }
  }, [selectedCoordinate, dragRange, panels, domain, colors.gridAxis, interactionColor]);
  const caption = rangeLabel(domain[0], domain[1]);
  return <div ref={chartFrame} onKeyDown={event => { if (event.key !== 'Escape' || (mode === 'inspect' && !drag.current)) return; event.preventDefault(); event.stopPropagation(); clearDrag(true); setMode('inspect'); }}><ChartFrame variant="embedded">
    <ChartRangeControls mode={mode} canPan={narrowed} canReset={narrowed || mode !== 'inspect' || dragRange != null} labels={labels}
      onModeChange={changeMode} onReset={() => { clearDrag(); setViewport(null); setMode('inspect'); }}
      onPanKeyDown={event => {
        if (mode !== 'pan' || !narrowed || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); clearDrag(true);
        const span = domain[1] - domain[0];
        const range: [number, number] = event.key === 'Home' ? [globalMin, globalMin + span] : event.key === 'End' ? [globalMax - span, globalMax] : panChartRange(domain, event.key === 'ArrowLeft' ? 25 : -25, 100, [globalMin, globalMax]);
        setViewport({ key: axisKey, range });
      }} />
    <ChartRangeCaption>{caption}</ChartRangeCaption>
    {description}
    {(mode !== 'inspect' || !narrowed) && <ChartRangeCaption aria-live="off">{mode === 'select' ? labels.rangeHint : mode === 'pan' ? labels.panHint : labels.panUnavailable}</ChartRangeCaption>}
    {beforePlot}
    {panels.map(panel => <ChartLane key={panel.id} title={panel.label} unit={panel.unit} subdued={panel.subdued} aria-label={`${panel.label} (${panel.unit})`}>
      <ChartPlot tone={panel.subdued ? 'background' : 'metric'} gesture={mode !== 'inspect' ? 'none' : 'pan-y'} empty={!panel.chartData.datasets.some(dataset => dataset.data.some(point => point.y != null)) ? labels.empty : undefined}
        onPointerDown={event => pointerDown(panel.id, event)}
        onPointerMove={event => pointerMove(panel.id, event)}
        onPointerUp={pointerUp}
        onPointerCancel={event => { if (event.pointerId === drag.current?.pointerId) clearDrag(true); }}
        onLostPointerCapture={event => { if (event.pointerId === drag.current?.pointerId) clearDrag(true); }}>
        <Line role="img" aria-label={`${panel.label} (${panel.unit}) · ${caption}`} ref={refCallbacks[panel.id]} data={panel.chartData} datasetIdKey="id" plugins={CURSOR_PLUGINS} options={chartOptions[panel.id]} />
      </ChartPlot>
    </ChartLane>)}
  </ChartFrame></div>;
}
