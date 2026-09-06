import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FitnessPoint } from "../../../utils/fitnessMetrics";
import { buildPmcHistory, buildPmcYearComparison, type PmcBucket, type PmcRange } from "../pmcHistory";
import "./PmcHistoryPanel.css";

interface PmcHistoryPanelProps {
  points: readonly FitnessPoint[];
  today: string;
  canonical: boolean;
  ctlColor?: string;
  sourceLabel?: string;
}

type Metric = "ctl" | "atl" | "tsb";
type ChartSeries = { label: string; buckets: PmcBucket[]; dash?: string };
const RANGES: PmcRange[] = [30, 90, 180, 360, "3y", "all"];
const DASHES = [undefined, "8 4", "2 4", "10 3 2 3", "12 3 2 3 2 3"];
const WIDTH = 800;
const HEIGHT = 200;
const LEFT = 48;
const TOP = 16;
const BOTTOM = 166;
const formatValue = (value: number | null) => value == null ? "—" : value.toFixed(1);

function HistoryChart({ series, metrics, selectedIndex, onSelect, labels, title, ctlColor, selectionLabel }: {
  series: ChartSeries[];
  metrics: Metric[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  labels: string[];
  title: string;
  ctlColor: string;
  selectionLabel: string;
}) {
  const chartRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(WIDTH);
  useEffect(() => {
    if (!chartRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.max(280, entry.contentRect.width));
    });
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const right = width - 20;
  const values = series.flatMap((line) => line.buckets.flatMap((bucket) => metrics.map((metric) => bucket[metric]))).filter((value): value is number => value != null);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const pad = (maximum - minimum) * 0.08;
  const low = minimum - pad;
  const high = maximum + pad;
  const x = (index: number) => labels.length <= 1 ? (LEFT + right) / 2 : LEFT + index / (labels.length - 1) * (right - LEFT);
  const y = (value: number) => BOTTOM - (value - low) / (high - low) * (BOTTOM - TOP);
  const tickSpacing = Math.max(1, ...labels.map((label) => label.length)) * 8 + 16;
  const tickCount = Math.max(2, Math.floor((right - LEFT) / tickSpacing));
  const tickStep = Math.max(1, Math.ceil((labels.length - 1) / (tickCount - 1)));
  const tickIndices = labels.map((_, index) => index).filter((index) => index === 0 || index === labels.length - 1 || (index % tickStep === 0 && x(labels.length - 1) - x(index) >= tickSpacing));
  const color = (metric: Metric) => metric === "ctl" ? ctlColor : metric === "atl" ? "var(--rose)" : "var(--amber)";
  const selectKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const next = event.key === "ArrowLeft" ? selectedIndex - 1 : event.key === "ArrowRight" ? selectedIndex + 1 : event.key === "Home" ? 0 : event.key === "End" ? labels.length - 1 : null;
    if (next == null) return;
    event.preventDefault();
    onSelect(Math.max(0, Math.min(labels.length - 1, next)));
  };
  return <svg ref={chartRef} className="pmc-history__chart" viewBox={`0 0 ${width} ${HEIGHT}`} role="slider" tabIndex={0}
    aria-label={title} aria-valuemin={1} aria-valuemax={Math.max(1, labels.length)} aria-valuenow={selectedIndex + 1}
    aria-valuetext={selectionLabel} onKeyDown={selectKey}
    onPointerDown={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (!bounds.width || !labels.length) return;
      event.currentTarget.focus();
      onSelect(Math.max(0, Math.min(labels.length - 1, Math.round(((event.clientX - bounds.left) / bounds.width * width - LEFT) / (right - LEFT) * (labels.length - 1)))));
    }}>
    <title>{title}</title>
    {[0, 0.5, 1].map((fraction) => {
      const value = low + (high - low) * fraction;
      return <g key={fraction}><line x1={LEFT} x2={right} y1={y(value)} y2={y(value)} className="pmc-history__grid" /><text x={LEFT - 8} y={y(value) + 4} textAnchor="end">{value.toFixed(0)}</text></g>;
    })}
    {metrics.includes("tsb") && <line x1={LEFT} x2={right} y1={y(0)} y2={y(0)} className="pmc-history__zero" />}
    {series.map((line) => metrics.map((metric) => {
      let connected = false;
      const path = line.buckets.map((bucket, index) => {
        const value = bucket[metric];
        if (value == null) { connected = false; return ""; }
        const command = connected ? "L" : "M";
        connected = true;
        return `${command}${x(index)},${y(value)}`;
      }).join(" ");
      return <g key={`${line.label}-${metric}`} data-series={`${line.label}-${metric}`}>
        <path d={path} fill="none" stroke={color(metric)} strokeWidth={2} strokeDasharray={line.dash} />
        {line.buckets.map((bucket, index) => bucket[metric] == null ? null : <circle key={bucket.key} cx={x(index)} cy={y(bucket[metric])} r={index === selectedIndex ? 4 : 1.8} fill={color(metric)} />)}
      </g>;
    }))}
    {labels.length > 0 && <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={TOP} y2={BOTTOM} className="pmc-history__cursor" />}
    {tickIndices.map((index) => <text key={index} x={x(index)} y={190} textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}>{labels[index]}</text>)}
  </svg>;
}

export default function PmcHistoryPanel({ points, today, canonical, ctlColor = "var(--lime)", sourceLabel }: PmcHistoryPanelProps) {
  const { t, i18n } = useTranslation("fitness");
  const headingId = useId();
  const [range, setRange] = useState<PmcRange>(90);
  const [mode, setMode] = useState<"trend" | "years">("trend");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [yearChoice, setYearChoice] = useState<number[] | null>(null);
  const history = useMemo(() => buildPmcHistory(points, range, today), [points, range, today]);
  const currentYear = Number(today.slice(0, 4));
  const years = yearChoice == null ? history.availableYears.filter((year) => year === currentYear || year === currentYear - 1) : yearChoice.filter((year) => history.availableYears.includes(year));
  const comparison = useMemo(() => buildPmcYearComparison(points, years, today), [points, years, today]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const monthLabel = (month: number) => new Date(Date.UTC(2000, month, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  const series: ChartSeries[] = mode === "trend" ? [{ label: t("history.stored"), buckets: history.buckets }] : comparison.series.map((entry, index) => ({ label: String(entry.year), buckets: entry.buckets, dash: index < DASHES.length ? DASHES[index] : `${12 + index * 2} 3 2 3` }));
  const labels = mode === "years" ? Array.from({ length: 12 }, (_, month) => monthLabel(month)) : history.buckets.map((bucket) => history.unit === "month" ? bucket.key.slice(2, 7).replace("-", ".") : bucket.startDate.slice(5));
  const foundIndex = history.buckets.findIndex((bucket) => bucket.key === selectedKey);
  const selectedIndex = mode === "years" ? selectedMonth ?? Number(today.slice(5, 7)) - 1 : foundIndex < 0 ? Math.max(0, history.buckets.length - 1) : foundIndex;
  const selectIndex = (index: number) => mode === "years" ? setSelectedMonth(index) : setSelectedKey(history.buckets[index]?.key ?? null);
  const selected = series.flatMap((line) => {
    const bucket = line.buckets[selectedIndex];
    return bucket ? [{ label: line.label, bucket }] : [];
  });
  const firstSelected = selected[0];
  const selectionLabel = mode === "years" ? labels[selectedIndex] ?? t("history.empty") : firstSelected ? `${firstSelected.bucket.startDate} – ${firstSelected.bucket.endDate}` : t("history.empty");
  const selectionOptions = mode === "years" ? labels : history.buckets.map((bucket) => `${bucket.startDate} – ${bucket.endDate}`);
  const unit = mode === "years" ? "month" : history.unit;
  return <section className="pmc-history" aria-labelledby={headingId}>
    <header className="pmc-history__header"><div><h2 id={headingId}>{t("history.title")}</h2><p>{t("history.subtitle")}</p></div><span className="pmc-history__source">{sourceLabel ?? t(canonical ? "history.canonical" : "history.fallback")}</span></header>
    <div className="pmc-history__controls">
      <div role="group" aria-label={t("history.mode")} className="pmc-history__buttons">
        {(["trend", "years"] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`history.mode.${value}`)}</button>)}
      </div>
      {mode === "trend" ? <div role="group" aria-label={t("history.range")} className="pmc-history__buttons pmc-history__ranges">{RANGES.map((value) => <button type="button" key={value} aria-pressed={range === value} onClick={() => setRange(value)}>{t(`history.range.${value}`)}</button>)}</div> : <div role="group" aria-label={t("history.years")} className="pmc-history__buttons">{history.availableYears.map((year) => <button type="button" key={year} aria-pressed={years.includes(year)} onClick={() => setYearChoice(years.includes(year) ? years.filter((value) => value !== year) : [...years, year].sort((a, b) => b - a))}>{year}</button>)}</div>}
    </div>
    <p className="pmc-history__note">{t(`history.unit.${unit}`)} · {t("history.calculation")}</p>
    {mode === "years" && <div className="pmc-history__legend">{series.map((line) => <span key={line.label}><svg width="32" height="12" aria-hidden="true"><line x1="0" x2="32" y1="6" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray={line.dash} /></svg>{line.label}</span>)}</div>}
    {points.length === 0 || !series.some((line) => line.buckets.some((bucket) => bucket.observedDays > 0)) ? <p role="status">{t(years.length === 0 && mode === "years" ? "history.selectYear" : "history.empty")}</p> : <>
      <div className="pmc-history__legend"><span style={{ color: ctlColor }}>{t("ctl")}</span>{mode === "trend" && <span className="pmc-history__atl">{t("atl")}</span>}</div>
      <HistoryChart series={series} metrics={mode === "years" ? ["ctl"] : ["ctl", "atl"]} labels={labels} selectedIndex={selectedIndex} onSelect={selectIndex} title={t(mode === "years" ? "history.chart.fitness" : "history.chart.load")} ctlColor={ctlColor} selectionLabel={selectionLabel} />
      <div className="pmc-history__legend"><span className="pmc-history__tsb">{t("tsb")}</span></div>
      <HistoryChart series={series} metrics={["tsb"]} labels={labels} selectedIndex={selectedIndex} onSelect={selectIndex} title={t("history.chart.form")} ctlColor={ctlColor} selectionLabel={selectionLabel} />
    </>}
    {labels.length > 0 && <div className="pmc-history__navigation"><button type="button" aria-label={t("history.previous")} disabled={selectedIndex === 0} onClick={() => selectIndex(selectedIndex - 1)}>←</button><label>{t("history.selection")}<select value={selectedIndex} onChange={(event) => selectIndex(Number(event.target.value))}>{selectionOptions.map((label, index) => <option key={index} value={index}>{label}</option>)}</select></label><button type="button" aria-label={t("history.next")} disabled={selectedIndex === labels.length - 1} onClick={() => selectIndex(selectedIndex + 1)}>→</button><button type="button" onClick={() => { setSelectedKey(null); setSelectedMonth(null); }}>{t("history.today")}</button></div>}
    <div className="pmc-history__selection" aria-live="polite"><h3>{selectionLabel}</h3><div className="pmc-history__table-scroll"><table><caption>{t("history.summary")}</caption><thead><tr><th scope="col">{t("history.period")}</th>{(["ctl", "atl", "tsb"] as const).map((metric) => <th scope="col" key={metric}>{metric.toUpperCase()}{unit !== "day" && ` · ${t("history.mean")}`}</th>)}<th scope="col">{t("history.totalLoad")}</th><th scope="col">{t("history.coverage")}</th></tr></thead><tbody>{selected.map(({ label, bucket }) => <tr key={label}><th scope="row">{label}</th><td>{formatValue(bucket.ctl)}</td><td>{formatValue(bucket.atl)}</td><td>{formatValue(bucket.tsb)}</td><td>{formatValue(bucket.totalLoad)}</td><td>{bucket.observedDays === 0 ? t("history.missing") : `${bucket.observedDays}/${bucket.expectedDays} ${t("history.days")}${bucket.partial ? ` · ${t("history.partial")}` : ""}`}</td></tr>)}</tbody></table></div></div>
    <p className="pmc-history__note">{t(canonical ? "history.canonicalNote" : "history.fallbackNote")} {t("history.coverageNote")}</p>
  </section>;
}
