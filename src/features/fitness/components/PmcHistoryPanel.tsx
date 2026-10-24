import "./fitness-analysis-controls.css";
import { createPortal } from "react-dom";
import InfoTip from "../../../components/InfoTip";
import GlossaryText from "../../../components/common/GlossaryText";
import { TooltipContent } from "../../../theme/components/TooltipContent";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import FitnessChart, { type FitnessChartPoint } from "../../../components/FitnessChart";
import { ToggleControls, ToggleButton, ChartValue, ChartAxisLine, ChartFrame, ChartGridLine, ChartHeader, ChartLegend, ChartTooltip } from "../../../theme/components";
import { PMC_LINE_PALETTE } from "../chartPalette";
import { buildPmcHistory, buildPmcYearComparison, type PmcBucket, type PmcRange, type PmcHistoryPoint } from "../pmcHistory";
import "./PmcHistoryPanel.css";

interface PmcHistoryPanelProps {
  points: readonly PmcHistoryPoint[];
  today: string;
  canonical: boolean;
  controlledRange?: PmcRange;
  onControlledRangeChange?: (range: PmcRange) => void;
  rangeChoices?: readonly PmcRange[];
  ctlColor?: string;
  sourceLabel?: string;
  variant?: "card" | "embedded";
  controlledMode?: "trend" | "years";
  onControlledModeChange?: (mode: "trend" | "years") => void;
  hideModeControls?: boolean;
  /** 긴 공통 계산 설명을 하단의 열린 근거 구간에서 제공하는 화면. */
  suppressMethodNotes?: boolean;
}

type YearSeries = { label: string; buckets: PmcBucket[]; dash?: string };
const RANGES: PmcRange[] = [30, 90, 180, 360, "3y", "all"];
const DASHES = [undefined, "8 4", "2 4", "10 3 2 3", "12 3 2 3 2 3"];
const WIDTH = 800;
const HEIGHT = 240;
const LEFT = 48;
const TOP = 16;
const BOTTOM = 204;
const formatValue = (value: number | null) => value == null ? "—" : value.toFixed(1);

const TSB_TOP = 8;
const TSB_LEFT = 44;

function TsbHistoryChart({ buckets, selectedIndex, hoverIndex, onHover, onSelect, title, width, controllerRef, selectionLabel }: {
  buckets: readonly PmcBucket[];
  selectedIndex: number;
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
  title: string;
  width: number;
  controllerRef: RefObject<SVGSVGElement | null>;
  selectionLabel: string;
}) {
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const height = width <= 576 ? 96 : 112;
  const bottom = height - 24;
  const right = width - 8;
  const values = buckets.map((bucket) => bucket.tsb).filter((value): value is number => value != null);
  const limit = Math.max(10, Math.ceil(Math.max(0, ...values.map(Math.abs)) * 1.1 / 5) * 5);
  const low = -limit;
  const high = limit;
  const x = (index: number) => buckets.length <= 1 ? (TSB_LEFT + right) / 2 : TSB_LEFT + index / (buckets.length - 1) * (right - TSB_LEFT);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - TSB_TOP);
  let connected = false;
  const path = buckets.map((bucket, index) => {
    if (bucket.tsb == null) { connected = false; return ""; }
    const command = connected ? "L" : "M";
    connected = true;
    return `${command}${x(index).toFixed(1)},${y(bucket.tsb).toFixed(1)}`;
  }).join(" ");
  const displayIndex = hoverIndex ?? selectedIndex;
  const displayValue = buckets[displayIndex]?.tsb;
  const indexFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix || !buckets.length) return null;
    const pointer = event.currentTarget.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const localX = pointer.matrixTransform(matrix.inverse()).x;
    return Math.max(0, Math.min(buckets.length - 1, Math.round((localX - TSB_LEFT) / (right - TSB_LEFT) * (buckets.length - 1))));
  };
  const selectKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const next = event.key === "ArrowLeft" ? selectedIndex - 1 : event.key === "ArrowRight" ? selectedIndex + 1 : event.key === "Home" ? 0 : event.key === "End" ? buckets.length - 1 : null;
    if (next == null) return;
    event.preventDefault();
    onSelect(Math.max(0, Math.min(buckets.length - 1, next)));
  };
  const labelIndices = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1].filter((index, position, all) => index >= 0 && all.indexOf(index) === position);
  return <div className="pmc-history__tsb-wrap">
    <span className="pmc-history__tsb-label">{title}</span>
    <svg ref={controllerRef} className="pmc-history__tsb-chart" viewBox={`0 0 ${width} ${height}`} role="slider" tabIndex={0} aria-label={title}
      aria-valuemin={1} aria-valuemax={Math.max(1, buckets.length)} aria-valuenow={selectedIndex + 1} aria-valuetext={selectionLabel} onKeyDown={selectKey}
      onPointerMove={(event) => { if (event.pointerType !== "touch") onHover(indexFromPointer(event)); }}
      onPointerLeave={() => { pointerDownRef.current = null; onHover(null); }}
      onPointerCancel={() => { pointerDownRef.current = null; onHover(null); }}
      onPointerDown={(event) => { pointerDownRef.current = { x: event.clientX, y: event.clientY }; }}
      onPointerUp={(event) => { const start = pointerDownRef.current; pointerDownRef.current = null; if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return; const index = indexFromPointer(event); if (index != null) { onSelect(index); event.currentTarget.focus(); } }}>
      <title>{title}</title>
      <ChartGridLine x1={TSB_LEFT} x2={right} y1={TSB_TOP} y2={TSB_TOP} />
      <ChartAxisLine className="pmc-history__zero-axis" data-tsb-zero-axis="true" x1={TSB_LEFT} x2={right} y1={y(0)} y2={y(0)} />
      <ChartGridLine x1={TSB_LEFT} x2={right} y1={bottom} y2={bottom} />
      <text className="pmc-history__zero-label" x={TSB_LEFT - 8} y={y(0) + 4} textAnchor="end">0</text>
      <text x={TSB_LEFT - 8} y={y(limit) + 4} textAnchor="end">+{limit}</text>
      <text x={TSB_LEFT - 8} y={y(-limit) + 4} textAnchor="end">-{limit}</text>
      {path && <path data-pmc-series="tsb" d={path} fill="none" stroke={PMC_LINE_PALETTE.tsb.color} strokeWidth={PMC_LINE_PALETTE.tsb.strokeWidth} strokeDasharray={PMC_LINE_PALETTE.tsb.dasharray} strokeLinecap={PMC_LINE_PALETTE.tsb.linecap} vectorEffect="non-scaling-stroke" />}
      {buckets.length > 0 && <ChartAxisLine data-tsb-cursor="true" x1={x(displayIndex)} x2={x(displayIndex)} y1={TSB_TOP} y2={bottom} strokeDasharray="2 3" />}
      {displayValue != null && <circle data-tsb-selected-point="true" cx={x(displayIndex)} cy={y(displayValue)} r="4" fill="var(--bg-0)" stroke={PMC_LINE_PALETTE.tsb.color} strokeWidth="2.5" />}
      {labelIndices.map((index) => <text key={index} x={x(index)} y={height - 6} textAnchor={index === 0 ? "start" : index === buckets.length - 1 ? "end" : "middle"}>{width <= 576 ? buckets[index]?.endDate.slice(5) : buckets[index]?.endDate}</text>)}
    </svg>
  </div>;
}

function YearComparisonChart({ series, selectedIndex, onSelect, labels, title, ctlColor, selectionLabel }: {
  series: YearSeries[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  labels: string[];
  title: string;
  ctlColor: string;
  selectionLabel: string;
}) {
  const { t } = useTranslation("fitness");
  const chartRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(WIDTH);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  useEffect(() => {
    if (!chartRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.max(280, entry.contentRect.width));
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const right = width - 20;
  const values = series.flatMap((line) => line.buckets.map((bucket) => bucket.ctl)).filter((value): value is number => value != null);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const pad = Math.max(1, (maximum - minimum) * 0.08);
  const low = minimum - pad;
  const high = maximum + pad;
  const x = (index: number) => labels.length <= 1 ? (LEFT + right) / 2 : LEFT + index / (labels.length - 1) * (right - LEFT);
  const y = (value: number) => BOTTOM - (value - low) / (high - low) * (BOTTOM - TOP);
  const tickSpacing = Math.max(1, ...labels.map((label) => label.length)) * 8 + 16;
  const tickCount = Math.max(2, Math.floor((right - LEFT) / tickSpacing));
  const tickStep = Math.max(1, Math.ceil((labels.length - 1) / (tickCount - 1)));
  const tickIndices = labels.map((_, index) => index).filter((index) => index === 0 || index === labels.length - 1 || (index % tickStep === 0 && x(labels.length - 1) - x(index) >= tickSpacing));
  const displayIndex = hoverIndex ?? selectedIndex;
  const indexFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM();
    if (!matrix || !labels.length) return null;
    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const localX = pointer.matrixTransform(matrix.inverse()).x;
    return Math.max(0, Math.min(labels.length - 1, Math.round((localX - LEFT) / (right - LEFT) * (labels.length - 1))));
  };
  const selectKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const next = event.key === "ArrowLeft" ? selectedIndex - 1 : event.key === "ArrowRight" ? selectedIndex + 1 : event.key === "Home" ? 0 : event.key === "End" ? labels.length - 1 : null;
    if (next == null) return;
    event.preventDefault();
    onSelect(Math.max(0, Math.min(labels.length - 1, next)));
  };
  return <div className="pmc-history__plot-wrap">
    <svg ref={chartRef} className="pmc-history__chart" viewBox={`0 0 ${width} ${HEIGHT}`} role="slider" tabIndex={0}
      aria-label={title} aria-valuemin={1} aria-valuemax={Math.max(1, labels.length)} aria-valuenow={selectedIndex + 1}
      aria-valuetext={selectionLabel} onKeyDown={selectKey}
      onPointerMove={(event) => { if (event.pointerType !== "touch") setHoverIndex(indexFromPointer(event)); }} onPointerLeave={() => setHoverIndex(null)}
      onPointerDown={(event) => { const index = indexFromPointer(event); if (index == null) return; event.currentTarget.focus(); onSelect(index); }}>
      <title>{title}</title>
      {[0, 0.5, 1].map((fraction) => {
        const value = low + (high - low) * fraction;
        return <g key={fraction}><ChartGridLine x1={LEFT} x2={right} y1={y(value)} y2={y(value)} /><text x={LEFT - 8} y={y(value) + 4} textAnchor="end">{value.toFixed(0)}</text></g>;
      })}
      {series.map((line) => {
        let connected = false;
        const path = line.buckets.map((bucket, index) => {
          if (bucket.ctl == null) { connected = false; return ""; }
          const command = connected ? "L" : "M";
          connected = true;
          return `${command}${x(index)},${y(bucket.ctl)}`;
        }).join(" ");
        const selectedValue = line.buckets[displayIndex]?.ctl;
        return <g key={line.label} data-series={`${line.label}-ctl`}>
          <path d={path} fill="none" stroke={ctlColor} strokeWidth={PMC_LINE_PALETTE.ctl.strokeWidth} strokeDasharray={line.dash} strokeLinecap={PMC_LINE_PALETTE.ctl.linecap} vectorEffect="non-scaling-stroke" />
          {selectedValue != null && <circle data-selected-point="true" cx={x(displayIndex)} cy={y(selectedValue)} r={4} fill="var(--bg-1)" stroke={ctlColor} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />}
        </g>;
      })}
      {labels.length > 0 && <line x1={x(displayIndex)} x2={x(displayIndex)} y1={TOP} y2={BOTTOM} className="pmc-history__cursor" />}
      {tickIndices.map((index) => <text key={index} x={x(index)} y={230} textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}>{labels[index]}</text>)}
    </svg>
    {hoverIndex != null && <ChartTooltip label={labels[hoverIndex] ?? selectionLabel} placement={x(hoverIndex) / width < 0.2 ? "start" : x(hoverIndex) / width > 0.8 ? "end" : "center"} style={{ left: `${x(hoverIndex) / width * 100}%`, top: "var(--space-2)" }}>
      {series.map((line) => {
        const bucket = line.buckets[hoverIndex];
        if (!bucket) return null;
        return <span key={line.label} className="pmc-history__year-tooltip-entry"><strong>{line.label} · CTL {formatValue(bucket.ctl)} · {t("history.mean")}</strong><span>{bucket.startDate} – {bucket.endDate}</span><span>ATL {formatValue(bucket.atl)} · TSB {formatValue(bucket.tsb)}</span><span>{t("chartDetail.load")}: {bucket.loadStatus === "unconfirmed" ? "—" : formatValue(bucket.totalLoad)}</span><span>{t(`history.load.${bucket.loadStatus}`)} · {bucket.loadSnapshotDays}/{bucket.expectedDays} {t("history.days")}</span><span>{t(`history.pmc.${bucket.calculationStatus}`)} · {bucket.observedDays}/{bucket.expectedDays} {t("history.days")}{bucket.partial ? ` · ${t("history.partial")}` : ""}</span></span>;
      })}
    </ChartTooltip>}
  </div>;
}

export function PmcHistoryMethodNotes({ canonical }: { canonical: boolean }) {
  const { t } = useTranslation("fitness");
  return (
      <dl className="pmc-history__method-notes">
        <div><dt>{t("history.noteLabels.load")}</dt><dd className="pmc-history__note">{t("history.statusNote")}</dd></div>
        <div><dt>{t("history.noteLabels.coverage")}</dt><dd className="pmc-history__note">{t("history.coverageNote")}</dd></div>
        <div><dt>{t("history.noteLabels.history")}</dt><dd className="pmc-history__note">{t("history.calculation")} {t(canonical ? "history.canonicalNote" : "history.fallbackNote")}</dd></div>
      </dl>
  );
}

export default function PmcHistoryPanel({ points, today, canonical, controlledRange, onControlledRangeChange, rangeChoices = RANGES, ctlColor = PMC_LINE_PALETTE.ctl.color, sourceLabel, variant = "card", controlledMode, onControlledModeChange, hideModeControls = false, suppressMethodNotes = false }: PmcHistoryPanelProps) {
  const { t, i18n } = useTranslation("fitness");
  const headingId = useId();
  const [localRange, setLocalRange] = useState<PmcRange>(90);
  const range = controlledRange ?? localRange;
  const [localMode, setLocalMode] = useState<"trend" | "years">("trend");
  const mode = controlledMode ?? localMode;
  const setMode = (next: "trend" | "years") => controlledMode == null ? setLocalMode(next) : onControlledModeChange?.(next);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [yearChoice, setYearChoice] = useState<number[] | null>(null);
  const [trendHoverIndex, setTrendHoverIndex] = useState<number | null>(null);
  const trendPlotRef = useRef<HTMLDivElement>(null);
  const trendControllerRef = useRef<SVGSVGElement>(null);
  const [trendWidth, setTrendWidth] = useState(WIDTH);
  useEffect(() => {
    const plot = trendPlotRef.current;
    if (!plot || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => { if (entry && entry.contentRect.width > 0) setTrendWidth(Math.max(280, entry.contentRect.width)); });
    observer.observe(plot);
    return () => observer.disconnect();
  }, []);
  const history = useMemo(() => buildPmcHistory(points, range, today), [points, range, today]);
  const currentYear = Number(today.slice(0, 4));
  const years = yearChoice == null ? history.availableYears.filter((year) => year === currentYear || year === currentYear - 1) : yearChoice.filter((year) => history.availableYears.includes(year));
  const comparison = useMemo(() => buildPmcYearComparison(points, years, today), [points, years, today]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const monthLabel = (month: number) => new Date(Date.UTC(2000, month, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  const yearSeries: YearSeries[] = comparison.series.map((entry, index) => ({ label: String(entry.year), buckets: entry.buckets, dash: index < DASHES.length ? DASHES[index] : `${12 + index * 2} 3 2 3` }));
  const yearLabels = Array.from({ length: 12 }, (_, month) => monthLabel(month));
  const foundIndex = history.buckets.findIndex((bucket) => bucket.key === selectedKey);
  const trendSelectedIndex = foundIndex < 0 ? Math.max(0, history.buckets.length - 1) : foundIndex;
  const selectedIndex = mode === "years" ? selectedMonth ?? Number(today.slice(5, 7)) - 1 : trendSelectedIndex;
  const selectIndex = (index: number) => mode === "years" ? setSelectedMonth(index) : setSelectedKey(history.buckets[index]?.key ?? null);
  const selected = mode === "years"
    ? yearSeries.flatMap((line) => line.buckets[selectedIndex] ? [{ label: line.label, bucket: line.buckets[selectedIndex]! }] : [])
    : history.buckets[selectedIndex] ? [{ label: t("history.stored"), bucket: history.buckets[selectedIndex]! }] : [];
  const firstSelected = selected[0];
  const selectionLabel = mode === "years" ? yearLabels[selectedIndex] ?? t("history.empty") : firstSelected ? `${firstSelected.bucket.startDate} – ${firstSelected.bucket.endDate}` : t("history.empty");
  const unit = mode === "years" ? "month" : history.unit;
  const valueStripLabel = mode === "trend" && unit !== "day" ? `${selectionLabel} · ${t(`history.unit.${unit}`)}` : selectionLabel;
  const trendAriaValue = firstSelected ? `${valueStripLabel}. ${t("ctl")} ${formatValue(firstSelected.bucket.ctl)}. ${t("atl")} ${formatValue(firstSelected.bucket.atl)}. ${t("tsb")} ${formatValue(firstSelected.bucket.tsb)}` : selectionLabel;
  const calculationStatuses = new Set(points.map((point) => point.calculationStatus).filter(Boolean));
  const sourceState = calculationStatuses.has("failed") ? "failed" : calculationStatuses.has("stale") ? "stale" : calculationStatuses.has("pending") ? "pending" : null;
  const sourceTone = sourceState === "failed" ? "danger" : sourceState === "stale" ? "warning" : sourceState === "pending" ? "progress" : null;
  const sourceKey = sourceState ? `history.source.${sourceState}` : points.length && points.every(point => point.calculationStatus === "server") ? "history.canonical" : points.length && points.every(point => point.calculationStatus === "derived") ? "history.derived" : points.some(point => point.calculationStatus) ? "history.estimated" : "history.fallback";
  const hasChart = mode === "years"
    ? yearSeries.some((line) => line.buckets.some((bucket) => bucket.observedDays > 0))
    : history.buckets.some((bucket) => bucket.observedDays > 0);
  const trendData: FitnessChartPoint[] = history.buckets.map((bucket) => ({ date: bucket.endDate, ctl: bucket.ctl, atl: bucket.atl, tsb: bucket.tsb, dailyLoad: bucket.totalLoad }));
  const hoverBucket = mode === "trend" && trendHoverIndex !== null ? history.buckets[trendHoverIndex] : null;
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 8, top: 8, width: 320 });
  useLayoutEffect(() => {
    if (!hoverBucket || !trendPlotRef.current) return;
    const rect = trendPlotRef.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const height = tooltipRef.current?.getBoundingClientRect().height ?? 320;
    setTooltipPosition({ width, left: Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12)), top: Math.max(12, Math.min(rect.top + 24, window.innerHeight - height - 12)) });
  }, [hoverBucket]);
  const legendItems = yearSeries.map((line) => ({ label: line.label, color: ctlColor, dasharray: line.dash, seriesId: `${line.label}-ctl`, strokeWidth: PMC_LINE_PALETTE.ctl.strokeWidth, strokeLinecap: PMC_LINE_PALETTE.ctl.linecap }));

  return <ChartFrame data-testid="K1-2" as="section" variant={variant} className="fitness-analysis-controls pmc-history" aria-labelledby={headingId} header={<ChartHeader title={<h2 id={headingId}>{t(mode === "years" ? "history.mode.years" : "history.chart.title")}</h2>} actions={<span role={sourceState ? "status" : undefined} aria-live={sourceState ? "polite" : undefined} className={`pmc-history__source${sourceTone ? ` pmc-history__source--${sourceTone}` : ""}`} data-testid="K1-2-8" data-source-state={sourceState ?? "default"}>{sourceLabel ?? t(sourceKey)}</span>} />}>
    {(!hideModeControls || mode === "years") && <div className="pmc-history__controls">{!hideModeControls && <ToggleControls variant="axis" data-testid="K1-2-2" aria-label={t("history.mode")}>{(["trend", "years"] as const).map((value) => <ToggleButton key={value} selected={mode === value} onClick={() => setMode(value)}>{t(`history.mode.${value}`)}</ToggleButton>)}</ToggleControls>}{mode === "years" && <ToggleControls variant="metric" aria-label={t("history.years")}>{history.availableYears.map((year) => <ToggleButton showCheck key={year} selected={years.includes(year)} onClick={() => setYearChoice(years.includes(year) ? years.filter((value) => value !== year) : [...years, year].sort((a, b) => b - a))}>{year}</ToggleButton>)}</ToggleControls>}</div>}
    <div className="pmc-history__chart-head"><ChartLegend items={mode === "years" ? legendItems : [{ label: <GlossaryText>{t("ctl")}</GlossaryText>, color: ctlColor, seriesId: "ctl", strokeWidth: PMC_LINE_PALETTE.ctl.strokeWidth, strokeLinecap: PMC_LINE_PALETTE.ctl.linecap }, { label: <GlossaryText>{t("atl")}</GlossaryText>, color: PMC_LINE_PALETTE.atl.color, seriesId: "atl", dasharray: PMC_LINE_PALETTE.atl.dasharray, strokeWidth: PMC_LINE_PALETTE.atl.strokeWidth, strokeLinecap: PMC_LINE_PALETTE.atl.linecap }, { label: <GlossaryText>{t("tsb")}</GlossaryText>, color: PMC_LINE_PALETTE.tsb.color, seriesId: "tsb", dasharray: PMC_LINE_PALETTE.tsb.dasharray, strokeWidth: PMC_LINE_PALETTE.tsb.strokeWidth, strokeLinecap: PMC_LINE_PALETTE.tsb.linecap }]} />
      {mode === "trend" && <ToggleControls variant="axis" aria-label={t("history.range")} data-testid="K1-2-1"><span className="pmc-history__unit">{t(`history.unit.${unit}`)}</span>{rangeChoices.map((value) => <ToggleButton key={value} selected={range === value} onClick={() => controlledRange == null ? setLocalRange(value) : onControlledRangeChange?.(value)}>{t(`history.range.${value}`)}</ToggleButton>)}</ToggleControls>}

    </div>
    {!hasChart ? <p role="status" className="pmc-history__empty">{t(years.length === 0 && mode === "years" ? "history.selectYear" : "history.empty")}</p>
      : mode === "trend" ? <div ref={trendPlotRef} data-testid="K1-2-3" className="pmc-history__trend-stack" role="group" aria-label={t("history.chart.trendGroup")}><FitnessChart data={trendData} today={today} ctlColor={ctlColor} selectedIndex={trendSelectedIndex} onSelectedIndexChange={selectIndex} showTodayMarker={unit === "day"} accessibleTitle={t("history.chart.title")} metricQualifier={unit === "day" ? undefined : t(`history.unit.${unit}`)} visibleMetrics={["ctl", "atl"]} tooltipMetrics={["ctl", "atl", "tsb"]} hoveredIndex={trendHoverIndex} onHoveredIndexChange={setTrendHoverIndex} chartWidth={trendWidth} chartHeight={trendWidth <= 576 ? 208 : 232} hideTooltip hideLegend hideXLabels showEndLabels onSelectionFocusRequest={() => trendControllerRef.current?.focus()} /><TsbHistoryChart buckets={history.buckets} selectedIndex={trendSelectedIndex} hoverIndex={trendHoverIndex} onHover={setTrendHoverIndex} onSelect={selectIndex} title={t("history.chart.tsbIndependent")} width={trendWidth} controllerRef={trendControllerRef} selectionLabel={trendAriaValue} /></div>
        : <YearComparisonChart series={yearSeries} labels={yearLabels} selectedIndex={selectedIndex} onSelect={selectIndex} title={t("history.chart.fitness")} ctlColor={ctlColor} selectionLabel={selectionLabel} />}
    {firstSelected && <div className="pmc-history__value-strip" aria-live="polite"><strong><span className="pmc-history__selection-context">{t("condition.history.selection")}</span> {valueStripLabel}{mode === "years" ? ` · ${t("history.mean")}` : ""}</strong>{mode === "trend" && <div className="pmc-history__values">{(["ctl", "atl", "tsb"] as const).map((metric) => <span key={metric} data-pmc-metric={metric} style={{ borderInlineStartColor: metric === "ctl" ? ctlColor : PMC_LINE_PALETTE[metric].color }}><ChartValue primary={formatValue(firstSelected.bucket[metric])} secondary={<GlossaryText>{t(metric)}</GlossaryText>} /></span>)}</div>}</div>}
    <section data-testid="K1-2-7" className="pmc-history__details" aria-label={t("history.details")}>
      <div className="pmc-history__evidence">{selected.map(({ label, bucket }) => <div key={label} className="pmc-history__evidence-period">
        {mode === "years" && <strong>{label} · {bucket.startDate} – {bucket.endDate}</strong>}
        {mode === "years" && <div role="group" aria-label={`${label} · ${selectionLabel} · ${t("history.mean")}`} className="pmc-history__values pmc-history__year-metrics">{(["ctl", "atl", "tsb"] as const).map(metric => <span key={metric} data-pmc-metric={metric} style={{ borderInlineStartColor: metric === "ctl" ? ctlColor : PMC_LINE_PALETTE[metric].color }}><ChartValue primary={formatValue(bucket[metric])} secondary={<GlossaryText>{t(metric)}</GlossaryText>} /></span>)}</div>}
        <dl className="pmc-history__evidence-grid">
          <div><dt>{t("chartDetail.load")}</dt><dd>{bucket.loadStatus === "unconfirmed" ? "—" : formatValue(bucket.totalLoad)}</dd></div>
          <div><dt><InfoTip title={t("history.loadStatus")} content={t("history.statusNote")}>{t("history.loadStatus")}</InfoTip></dt><dd>{t(`history.load.${bucket.loadStatus}`)} · {bucket.loadSnapshotDays}/{bucket.expectedDays} {t("history.days")}</dd></div>
          <div><dt>{t("history.pmcStatus")}</dt><dd>{t(`history.pmc.${bucket.calculationStatus}`)}</dd></div>
          <div><dt><InfoTip title={t("history.coverage")} content={t("history.coverageNote")}>{t("history.coverage")}</InfoTip></dt><dd>{bucket.observedDays === 0 ? t("history.missing") : `${bucket.observedDays}/${bucket.expectedDays} ${t("history.days")}${bucket.partial ? ` · ${t("history.partial")}` : ""}`}</dd></div>
        </dl>
      </div>)}</div>
      {!suppressMethodNotes && <PmcHistoryMethodNotes canonical={canonical} />}
    </section>
    {hasChart && firstSelected && firstSelected.bucket.observedDays === 0 && <p className="pmc-history__note" role="status">{t(["pending", "stale", "failed"].includes(firstSelected.bucket.calculationStatus) ? `history.pmc.${firstSelected.bucket.calculationStatus}` : "history.selectedEmpty")}</p>}
    {hoverBucket && createPortal(<TooltipContent ref={tooltipRef} role="tooltip" title={hoverBucket.startDate === hoverBucket.endDate ? hoverBucket.endDate : `${hoverBucket.startDate} – ${hoverBucket.endDate}`} data-pmc-tooltip="true" style={{ position: "fixed", ...tooltipPosition, zIndex: 100, pointerEvents: "none", maxHeight: "calc(100dvh - 24px)", overflowY: "auto" }}>
      <span className="flex flex-col gap-2">
        {(["ctl", "atl", "tsb"] as const).map(metric => <span key={metric} data-pmc-tooltip-metric={metric.toUpperCase()} className="flex items-baseline justify-between gap-3"><span>{t(metric)}{unit !== "day" ? ` · ${t(`history.unit.${unit}`)}` : ""}</span><b style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)" }}>{formatValue(hoverBucket[metric])}</b></span>)}
        <span style={{ borderTop: "1px solid var(--line-soft)", paddingTop: "var(--space-2)" }}>{t(unit === "day" ? "history.tooltip.day" : "history.tooltip.mean", { count: hoverBucket.observedDays, load: hoverBucket.loadStatus === "unconfirmed" ? "—" : formatValue(hoverBucket.totalLoad) })}</span>
        <span>{t("history.loadStatus")}: {t(`history.load.${hoverBucket.loadStatus}`)} · {hoverBucket.loadSnapshotDays}/{hoverBucket.expectedDays} {t("history.days")}</span>
        <span>{t("history.pmcStatus")}: {t(`history.pmc.${hoverBucket.calculationStatus}`)}</span>
        <span>{t("history.coverage")}: {hoverBucket.observedDays}/{hoverBucket.expectedDays} {t("history.days")}{hoverBucket.partial ? ` · ${t("history.partial")}` : ""}</span>
        <span>{t("history.calculation")}</span>
      </span>
    </TooltipContent>, document.body)}


  </ChartFrame>;
}
