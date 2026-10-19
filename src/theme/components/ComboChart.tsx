import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chart as ReactChart } from 'react-chartjs-2';
import { Chart as ChartJS, BarController, LineController, BarElement, PointElement, LineElement, LinearScale, Tooltip, Legend, type ChartData, type ChartDataset, type Plugin } from 'chart.js';
import { color } from 'chart.js/helpers';
import type { ChartColorTokens } from '../tokens/colors';
import { DEFAULT_TYPOGRAPHY } from '../tokens/typography';
import { DEFAULT_DIMENS } from '../tokens/dimens';
import type { ChartSeriesPoint } from '../charts/seriesSampling';
import { CHART_PRESENTATION } from '../charts/chartPresentation';
import { ChartFrame } from './Chart';
import { ToggleButton, ToggleControls } from './ToggleControls';

export interface ComboChartAxis { label: string; unit: string; beginAtZero?: boolean }
export interface ComboChartSeries {
  id: string; label: string; color: string; mark: 'bar' | 'line'; axis: 'left' | 'right';
  points: readonly ChartSeriesPoint[];
}
export interface ComboChartProps {
  series: readonly ComboChartSeries[];
  axes: { left: ComboChartAxis; right?: ComboChartAxis };
  domain: readonly [number, number];
  xLabel: string;
  formatX?: (value: number) => string;
  colors: Pick<ChartColorTokens, 'grid' | 'gridAxis' | 'gridLabel'>;
  visibleSeries: ReadonlySet<string>;
  onToggleSeries: (id: string) => void;
  selectedCoordinate: number | null;
  onSelectCoordinate: (coordinate: number | null) => void;
  labels: { chart: string; legend: string; empty: string; keyboardHint: string };
}

type MixedChart = ChartJS<'bar' | 'line', ChartSeriesPoint[]>;
let chartRegistered = false;
function registerChart() {
  if (chartRegistered) return;
  ChartJS.register(BarController, LineController, BarElement, PointElement, LineElement, LinearScale, Tooltip, Legend);
  chartRegistered = true;
}
const selections = new WeakMap<MixedChart, { x: number | null; color: string }>();
const selectionPlugin: Plugin<'bar' | 'line'> = {
  id: 'comboChartSelection',
  afterDatasetsDraw(chart) {
    const selection = selections.get(chart as MixedChart);
    if (selection?.x == null || selection.x < chart.scales.x!.min || selection.x > chart.scales.x!.max) return;
    const { ctx, chartArea } = chart;
    const x = chart.scales.x!.getPixelForValue(selection.x);
    ctx.save(); ctx.beginPath(); ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top); ctx.clip();
    ctx.strokeStyle = selection.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke(); ctx.restore();
  },
};
const PLUGINS = [selectionPlugin];

/** 두 단위까지 서로 다른 mark로 비교한다. 원본 정렬·평균·고정 값 영역은 호출자가 소유한다. */
export function ComboChart({ series, axes, domain, xLabel, formatX, colors, visibleSeries, onToggleSeries, selectedCoordinate, onSelectCoordinate, labels }: ComboChartProps) {
  registerChart();
  const chart = useRef<MixedChart | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [fontFamily, setFontFamily] = useState('system-ui');
  useEffect(() => {
    if (!frame.current) return;
    const family = getComputedStyle(frame.current).getPropertyValue('--font-sans').trim();
    if (family) setFontFamily(family);
  }, []);
  const visible = useMemo(() => series.filter(item => visibleSeries.has(item.id) && (item.axis === 'left' || axes.right)), [series, visibleSeries, axes.right]);
  const coordinates = useMemo(() => [...new Set(visible.flatMap(item => item.points.filter(point => Number.isFinite(point.x) && point.x >= domain[0] && point.x <= domain[1]).map(point => point.x)))].sort((a, b) => a - b), [visible, domain]);
  const hasData = useMemo(() => visible.some(item => item.points.some(point => Number.isFinite(point.x) && point.x >= domain[0] && point.x <= domain[1] && point.y != null && Number.isFinite(point.y))), [visible, domain]);
  const data = useMemo<ChartData<'bar' | 'line', ChartSeriesPoint[]>>(() => ({ datasets: visible.map((item): ChartDataset<'bar' | 'line', ChartSeriesPoint[]> => {
    const common = { id: item.id, label: `${item.label} (${axes[item.axis]!.unit})`, data: Array.from(item.points), yAxisID: item.axis, borderColor: color(item.color).alpha(CHART_PRESENTATION.lineOpacity).rgbString(), borderWidth: 1.5 };
    return item.mark === 'bar' ? { ...common, type: 'bar', backgroundColor: color(item.color).alpha(CHART_PRESENTATION.lineOpacity).rgbString(), maxBarThickness: DEFAULT_DIMENS.paddingL, order: 1 } : { ...common, type: 'line', backgroundColor: 'transparent', fill: false, tension: 0, pointRadius: 0, pointHoverRadius: 0, spanGaps: false, order: 0 };
  }) }), [visible, axes]);
  const xPresentation = useMemo(() => {
    const span = domain[1] - domain[0];
    const targetStep = Math.max(Number.EPSILON, span / 4);
    const magnitude = 10 ** Math.floor(Math.log10(targetStep));
    const step = ([1, 1.5, 2, 3, 5, 10].find(value => value * magnitude >= targetStep) ?? 10) * magnitude;
    const barCoordinates = [...new Set(visible.filter(item => item.mark === 'bar').flatMap(item => item.points.filter(point => Number.isFinite(point.x) && point.x >= domain[0] && point.x <= domain[1]).map(point => point.x)))].sort((a, b) => a - b);
    let closestStep = Infinity;
    for (let index = 1; index < barCoordinates.length; index++) closestStep = Math.min(closestStep, barCoordinates[index]! - barCoordinates[index - 1]!);
    // 눈금 간격에 따른 큰 offset 대신 원본 표본 간격만큼 막대 끝 여백을 확보한다.
    const padding = barCoordinates.length ? Math.min(span * 0.02, closestStep / 2) : 0;
    return { min: domain[0] - padding, max: domain[1] + padding, step };
  }, [visible, domain]);
  const options = useMemo(() => ({
    responsive: true, maintainAspectRatio: false, animation: false as const, events: [],
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { type: 'linear' as const, min: xPresentation.min, max: xPresentation.max, offset: false, grid: { display: false }, title: { display: true, text: xLabel, color: colors.gridLabel, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.bodySmall.size } }, ticks: { maxTicksLimit: 5, stepSize: xPresentation.step, includeBounds: false, color: colors.gridLabel, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.caption.size }, callback: (value: number | string) => Number(value) < domain[0] || Number(value) > domain[1] ? '' : formatX?.(Number(value)) ?? Number(value).toFixed(0) } },
      left: { type: 'linear' as const, position: 'left' as const, display: visible.some(item => item.axis === 'left'), beginAtZero: axes.left.beginAtZero ?? true, title: { display: true, text: `${axes.left.label} (${axes.left.unit})`, color: colors.gridLabel, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.bodySmall.size } }, grid: { color: colors.grid }, ticks: { color: colors.gridLabel, maxTicksLimit: 5, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.caption.size } } },
      right: { type: 'linear' as const, position: 'right' as const, display: Boolean(axes.right) && visible.some(item => item.axis === 'right'), beginAtZero: axes.right?.beginAtZero ?? false, title: { display: true, text: axes.right ? `${axes.right.label} (${axes.right.unit})` : '', color: colors.gridLabel, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.bodySmall.size } }, grid: { drawOnChartArea: false }, ticks: { color: colors.gridLabel, maxTicksLimit: 5, font: { family: fontFamily, size: DEFAULT_TYPOGRAPHY.caption.size } } },
    },
  }), [xPresentation, domain, axes, visible, colors, formatX, xLabel, fontFamily]);
  useEffect(() => { if (chart.current) { selections.set(chart.current, { x: selectedCoordinate, color: colors.gridAxis }); chart.current.draw(); } }, [selectedCoordinate, colors.gridAxis, data]);
  const nearest = (target: number) => {
    if (!coordinates.length) return null;
    let low = 0, high = coordinates.length - 1;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (coordinates[middle]! < target) low = middle + 1; else high = middle; }
    return low > 0 && Math.abs(coordinates[low - 1]! - target) <= Math.abs(coordinates[low]! - target) ? coordinates[low - 1]! : coordinates[low]!;
  };
  const pointerSelect = (clientX: number) => {
    const instance = chart.current;
    if (!instance) return;
    const pixel = clientX - instance.canvas.getBoundingClientRect().left;
    if (pixel < instance.chartArea.left || pixel > instance.chartArea.right) return;
    const value = instance.scales.x!.getValueForPixel(pixel);
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const next = nearest(value);
    if (next != null && next !== selectedCoordinate) onSelectCoordinate(next);
  };
  return <ChartFrame variant="embedded">
    <ToggleControls aria-label={labels.legend}>{series.map(item => <ToggleButton key={item.id} selected={visibleSeries.has(item.id)} onClick={() => onToggleSeries(item.id)}>
      <span className="ds-combo-chart__mark" data-mark={item.mark} style={{ '--ds-series-color': item.color } as CSSProperties} aria-hidden="true" />{item.label} ({axes[item.axis]?.unit ?? '—'})
    </ToggleButton>)}</ToggleControls>
    <p id={hintId} className="ds-chart-range-caption">{labels.keyboardHint}</p>
    <div ref={frame} className="ds-combo-chart__plot" role="group" aria-label={labels.chart} aria-describedby={hintId} tabIndex={0}
      onPointerDown={event => { if (event.pointerType === 'touch') event.currentTarget.focus({ preventScroll: true }); pointerSelect(event.clientX); }}
      onPointerMove={event => pointerSelect(event.clientX)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Escape') { onSelectCoordinate(null); return; }
        if (!coordinates.length) return;
        const current = selectedCoordinate == null ? -1 : coordinates.indexOf(nearest(selectedCoordinate)!);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? coordinates.length - 1 : current < 0 ? event.key === 'ArrowLeft' ? coordinates.length - 1 : 0 : Math.max(0, Math.min(coordinates.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)));
        onSelectCoordinate(coordinates[index]!);
      }}>
      <ReactChart<'bar' | 'line', ChartSeriesPoint[]> ref={chart} type="bar" role="img" aria-label={`${labels.chart} · ${xLabel} · ${formatX?.(domain[0]) ?? domain[0]}–${formatX?.(domain[1]) ?? domain[1]} · ${axes.left.label} (${axes.left.unit})${axes.right ? ` · ${axes.right.label} (${axes.right.unit})` : ''}`} data={data} options={options} plugins={PLUGINS} datasetIdKey="id" />
      {!hasData && <p className="ds-chart-lane__empty">{labels.empty}</p>}
    </div>
  </ChartFrame>;
}
