import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import FitnessChart, { type FitnessChartPoint } from "../../../components/FitnessChart";
import { Button, ChartAxisLine, ChartFrame, ChartGridLine, ChartHeader, ChartLegend, ChartTooltip, Select } from "../../../theme/components";
import { PMC_LINE_PALETTE } from "../chartPalette";
import { buildPmcHistory, buildPmcYearComparison, type PmcBucket, type PmcRange, type PmcHistoryPoint } from "../pmcHistory";
import "./PmcHistoryPanel.css";

interface PmcHistoryPanelProps {
  points: readonly PmcHistoryPoint[];
  today: string;
  canonical: boolean;
  controlledRange?: PmcRange;
  onControlledRangeChange?: (range: PmcRange) => void;
  ctlColor?: string;
  sourceLabel?: string;
  variant?: "card" | "embedded";
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
      <ChartAxisLine data-tsb-zero-axis="true" x1={TSB_LEFT} x2={right} y1={y(0)} y2={y(0)} />
      <ChartGridLine x1={TSB_LEFT} x2={right} y1={bottom} y2={bottom} />
      <text x={TSB_LEFT - 8} y={y(0) + 4} textAnchor="end">0</text>
      <text x={TSB_LEFT - 8} y={y(limit) + 4} textAnchor="end">+{limit}</text>
      <text x={TSB_LEFT - 8} y={y(-limit) + 4} textAnchor="end">-{limit}</text>
      {path && <path data-pmc-series="tsb" d={path} fill="none" stroke={PMC_LINE_PALETTE.tsb.color} strokeWidth={PMC_LINE_PALETTE.tsb.strokeWidth} strokeDasharray={PMC_LINE_PALETTE.tsb.dasharray} strokeLinecap={PMC_LINE_PALETTE.tsb.linecap} vectorEffect="non-scaling-stroke" />}
      {buckets.length > 0 && <ChartAxisLine data-tsb-cursor="true" x1={x(displayIndex)} x2={x(displayIndex)} y1={TSB_TOP} y2={bottom} strokeDasharray="2 3" />}
      {displayValue != null && <circle data-tsb-selected-point="true" cx={x(displayIndex)} cy={y(displayValue)} r="4" fill="var(--bg-0)" stroke={PMC_LINE_PALETTE.tsb.color} strokeWidth="2.5" />}
      {labelIndices.map((index) => <text key={index} x={x(index)} y={height - 6} textAnchor={index === 0 ? "start" : index === buckets.length - 1 ? "end" : "middle"}>{buckets[index]?.endDate}</text>)}
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
      onPointerMove={(event) => setHoverIndex(indexFromPointer(event))} onPointerLeave={() => setHoverIndex(null)}
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
    {hoverIndex != null && <ChartTooltip label={labels[hoverIndex] ?? selectionLabel} className={x(hoverIndex) / width < 0.2 ? "pmc-history__tooltip--start" : x(hoverIndex) / width > 0.8 ? "pmc-history__tooltip--end" : undefined} style={{ left: `${x(hoverIndex) / width * 100}%`, top: "var(--space-2)" }}>
      {series.map((line) => line.buckets[hoverIndex]?.ctl == null ? null : <span key={line.label}>{line.label} · CTL {formatValue(line.buckets[hoverIndex]!.ctl)}</span>)}
    </ChartTooltip>}
  </div>;
}

export default function PmcHistoryPanel({ points, today, canonical, controlledRange, onControlledRangeChange, ctlColor = PMC_LINE_PALETTE.ctl.color, sourceLabel, variant = "card" }: PmcHistoryPanelProps) {
  const { t, i18n } = useTranslation("fitness");
  const headingId = useId();
  const [localRange, setLocalRange] = useState<PmcRange>(90);
  const range = controlledRange ?? localRange;
  const [mode, setMode] = useState<"trend" | "years">("trend");
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
  const selectionOptions = mode === "years" ? yearLabels : history.buckets.map((bucket) => `${bucket.startDate} – ${bucket.endDate}`);
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
  const legendItems = yearSeries.map((line) => ({ label: line.label, color: ctlColor, dasharray: line.dash, seriesId: `${line.label}-ctl`, strokeWidth: PMC_LINE_PALETTE.ctl.strokeWidth, strokeLinecap: PMC_LINE_PALETTE.ctl.linecap }));

  return <ChartFrame as="section" variant={variant} className="pmc-history" aria-labelledby={headingId} header={<ChartHeader title={<h2 id={headingId}>{t("history.title")}</h2>} description={t("history.subtitle")} actions={<span role={sourceState ? "status" : undefined} aria-live={sourceState ? "polite" : undefined} className={`pmc-history__source${sourceTone ? ` pmc-history__source--${sourceTone}` : ""}`} data-source-state={sourceState ?? "default"}>{sourceLabel ?? t(sourceKey)}</span>} />}>
    <div className="pmc-history__chart-head">{mode === "years" ? <ChartLegend items={legendItems} /> : <><span className="pmc-history__canonical-chart">{t("history.chart.title")}</span><ChartLegend items={[{ label: t("ctl"), color: ctlColor, seriesId: "ctl", strokeWidth: PMC_LINE_PALETTE.ctl.strokeWidth, strokeLinecap: PMC_LINE_PALETTE.ctl.linecap }, { label: t("atl"), color: PMC_LINE_PALETTE.atl.color, seriesId: "atl", dasharray: PMC_LINE_PALETTE.atl.dasharray, strokeWidth: PMC_LINE_PALETTE.atl.strokeWidth, strokeLinecap: PMC_LINE_PALETTE.atl.linecap }, { label: t("tsb"), color: PMC_LINE_PALETTE.tsb.color, seriesId: "tsb", dasharray: PMC_LINE_PALETTE.tsb.dasharray, strokeWidth: PMC_LINE_PALETTE.tsb.strokeWidth, strokeLinecap: PMC_LINE_PALETTE.tsb.linecap }]} /></>}<span className="pmc-history__unit">{t(`history.unit.${unit}`)}</span></div>
    {!hasChart ? <p role="status" className="pmc-history__empty">{t(years.length === 0 && mode === "years" ? "history.selectYear" : "history.empty")}</p>
      : mode === "trend" ? <div ref={trendPlotRef} className="pmc-history__trend-stack" role="group" aria-label={t("history.chart.trendGroup")}><FitnessChart data={trendData} today={today} ctlColor={ctlColor} selectedIndex={trendSelectedIndex} onSelectedIndexChange={selectIndex} showTodayMarker={unit === "day"} accessibleTitle={t("history.chart.title")} metricQualifier={unit === "day" ? undefined : t(`history.unit.${unit}`)} visibleMetrics={["ctl", "atl"]} tooltipMetrics={["ctl", "atl", "tsb"]} hoveredIndex={trendHoverIndex} onHoveredIndexChange={setTrendHoverIndex} chartWidth={trendWidth} hideLegend hideXLabels onSelectionFocusRequest={() => trendControllerRef.current?.focus()} /><TsbHistoryChart buckets={history.buckets} selectedIndex={trendSelectedIndex} hoverIndex={trendHoverIndex} onHover={setTrendHoverIndex} onSelect={selectIndex} title={t("history.chart.tsbIndependent")} width={trendWidth} controllerRef={trendControllerRef} selectionLabel={trendAriaValue} /></div>
        : <YearComparisonChart series={yearSeries} labels={yearLabels} selectedIndex={selectedIndex} onSelect={selectIndex} title={t("history.chart.fitness")} ctlColor={ctlColor} selectionLabel={selectionLabel} />}
    {firstSelected && <div className="pmc-history__value-strip" aria-live="polite"><strong>{valueStripLabel}</strong>{mode === "years" ? selected.map(({ label, bucket }) => <span key={label}>{label} · {t("ctl")} <b>{formatValue(bucket.ctl)}</b></span>) : (["ctl", "atl", "tsb"] as const).map((metric) => <span key={metric}>{t(metric)} <b>{formatValue(firstSelected.bucket[metric])}</b></span>)}</div>}
    <div className="pmc-history__controls"><div role="group" aria-label={t("history.mode")} className="pmc-history__buttons">{(["trend", "years"] as const).map((value) => <Button size="sm" variant={mode === value ? "outline" : "ghost"} key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`history.mode.${value}`)}</Button>)}</div>{mode === "trend" ? <div role="group" aria-label={t("history.range")} className="pmc-history__buttons pmc-history__ranges">{(controlledRange == null ? RANGES : ["3y", "all"] as const).map((value) => <Button size="sm" variant={range === value ? "outline" : "ghost"} key={value} aria-pressed={range === value} onClick={() => controlledRange == null ? setLocalRange(value) : onControlledRangeChange?.(value)}>{t(`history.range.${value}`)}</Button>)}</div> : <div role="group" aria-label={t("history.years")} className="pmc-history__buttons">{history.availableYears.map((year) => <Button size="sm" variant={years.includes(year) ? "outline" : "ghost"} key={year} aria-pressed={years.includes(year)} onClick={() => setYearChoice(years.includes(year) ? years.filter((value) => value !== year) : [...years, year].sort((a, b) => b - a))}>{year}</Button>)}</div>}</div>
    {selectionOptions.length > 0 && <div className="pmc-history__navigation"><Button size="sm" variant="ghost" aria-label={t("history.previous")} disabled={selectedIndex === 0} onClick={() => selectIndex(selectedIndex - 1)}>←</Button><label>{t("history.selection")}<Select value={selectedIndex} onChange={(event) => selectIndex(Number(event.target.value))}>{selectionOptions.map((label, index) => <option key={index} value={index}>{label}</option>)}</Select></label><Button size="sm" variant="ghost" aria-label={t("history.next")} disabled={selectedIndex === selectionOptions.length - 1} onClick={() => selectIndex(selectedIndex + 1)}>→</Button><Button size="sm" variant="ghost" onClick={() => { setSelectedKey(null); setSelectedMonth(null); }}>{t(unit === "day" ? "history.today" : "history.latest")}</Button></div>}
    <details className="pmc-history__details"><summary>{t("history.details")}</summary><div className="pmc-history__selection"><div className="pmc-history__table-scroll"><table><caption>{t("history.summary")}</caption><thead><tr><th scope="col">{t("history.period")}</th>{(["ctl", "atl", "tsb"] as const).map((metric) => <th scope="col" key={metric}>{metric.toUpperCase()}{unit !== "day" && ` · ${t("history.mean")}`}</th>)}<th scope="col">{t("history.totalLoad")}</th><th scope="col">{t("history.loadStatus")}</th><th scope="col">{t("history.pmcStatus")}</th><th scope="col">{t("history.coverage")}</th></tr></thead><tbody>{selected.map(({ label, bucket }) => <tr key={label}><th scope="row">{label}</th><td>{formatValue(bucket.ctl)}</td><td>{formatValue(bucket.atl)}</td><td>{formatValue(bucket.tsb)}</td><td>{formatValue(bucket.totalLoad)}</td><td>{t(`history.load.${bucket.loadStatus}`)} · {bucket.loadSnapshotDays}/{bucket.expectedDays} {t("history.days")}</td><td>{t(`history.pmc.${bucket.calculationStatus}`)}</td><td>{bucket.observedDays === 0 ? t("history.missing") : `${bucket.observedDays}/${bucket.expectedDays} ${t("history.days")}${bucket.partial ? ` · ${t("history.partial")}` : ""}`}</td></tr>)}</tbody></table></div><p className="pmc-history__note">{t("history.calculation")} {t(canonical ? "history.canonicalNote" : "history.fallbackNote")} {t("history.statusNote")} {t("history.coverageNote")}</p></div></details>
  </ChartFrame>;
}
