import { useState } from "react";
import "./FtpProgressionCard.css";
import { useTranslation } from "react-i18next";
import type { EstimatedFtpPoint, FtpBreakthrough } from "@shared/training/ftpProgression";
import type { FtpHistoryEntry } from "@shared/training/ftpHistory";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Card, Text, buttonClass } from "../../../theme/components";

export default function FtpProgressionCard({
  points,
  history = [],
  currentFtpW,
  breakthrough,
  embedded = false,
  compact = false,
  showHistory = false,
}: {
  points: EstimatedFtpPoint[];
  history?: FtpHistoryEntry[];
  currentFtpW?: number | null;
  breakthrough: FtpBreakthrough | null;
  embedded?: boolean;
  compact?: boolean;
  showHistory?: boolean;
}) {
  const { t, i18n } = useTranslation("fitness");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const hasEstimatedTrend = points.length >= 2;
  const sortedHistory = [...history].sort((a, b) => a.changedAt - b.changedAt);
  const hasHistory = sortedHistory.length > 0;
  const hasChart = hasEstimatedTrend || hasHistory;
  if (!hasChart && !breakthrough) return null;

  const w = 480;
  const h = 128;
  const xPadding = 8;
  const values = [...points.map((point) => point.ftpW), ...sortedHistory.map((entry) => entry.value)];
  const referenceValues = currentFtpW && currentFtpW > 0 ? [...values, currentFtpW] : values;
  const min = referenceValues.length > 0 ? Math.min(...referenceValues) : 100;
  const max = referenceValues.length > 0 ? Math.max(...referenceValues) : 100;
  const padding = Math.max(5, (max - min) * 0.15);
  const lo = Math.floor((min - padding) / 10) * 10;
  const hi = Math.ceil((max + padding) / 10) * 10;
  const estimatedDates = points.map((point) => Date.parse(`${point.period}-01T00:00:00Z`));
  const timeValues = [...estimatedDates, ...sortedHistory.map((entry) => entry.changedAt)];
  const minTime = timeValues.length > 0 ? Math.min(...timeValues) : 0;
  const maxTime = timeValues.length > 0 ? Math.max(...timeValues) : minTime;
  const sx = (timestamp: number) => minTime === maxTime
    ? w / 2
    : xPadding + Math.max(0, Math.min(1, (timestamp - minTime) / (maxTime - minTime))) * (w - xPadding * 2);
  const sy = (value: number) => h - ((value - lo) / Math.max(hi - lo, 1)) * h;
  const estimatedPath = points.map((point, index) => `${index ? "L" : "M"}${sx(estimatedDates[index]!).toFixed(1)} ${sy(point.ftpW).toFixed(1)}`).join(" ");
  const historyPath = sortedHistory.map((entry, index) => `${index ? "L" : "M"}${sx(entry.changedAt).toFixed(1)} ${sy(entry.value).toFixed(1)}`).join(" ");
  const formatPeriod = (period: string) => new Intl.DateTimeFormat(i18n.language, { year: "2-digit", month: "short" })
    .format(new Date(`${period}-01T00:00:00`));
  const axisTimes = minTime === maxTime ? [minTime] : [minTime, (minTime + maxTime) / 2, maxTime];
  const spansMonths = maxTime - minTime >= 90 * 86400000;
  const formatAxisTime = (timestamp: number) => new Intl.DateTimeFormat(i18n.language, spansMonths
    ? { year: "2-digit", month: "short", timeZone: "UTC" }
    : { month: "numeric", day: "numeric", timeZone: "UTC" }).format(new Date(timestamp));
  const estimatedDescription = points.map((point) => `${formatPeriod(point.period)} ${point.ftpW}W`).join(", ");
  const historyDescription = sortedHistory.map((entry) => `${new Date(entry.changedAt).toLocaleDateString(i18n.language)} ${entry.value}W ${t(`ftpProgression.source.${entry.source}`)}`).join(", ");
  const trendDescription = `${t("ftpProgression.chartLabel")}: ${[
    estimatedDescription && `${t("ftpProgression.autoSeriesLabel")} ${estimatedDescription}`,
    historyDescription && `${t("ftpProgression.historySeriesLabel")} ${historyDescription}`,
  ].filter(Boolean).join("; ")}`;

  const chartPoints = [
    ...points.map((point) => ({ date: `${point.period}-01`, timestamp: Date.parse(`${point.period}-01T00:00:00Z`), value: point.ftpW, label: `${t("ftpProgression.autoSeriesLabel")} · ${t(point.source === "20m" ? "chartDetail.ftpSource20m" : "chartDetail.ftpSource1h")}`, note: t("chartDetail.ftpEstimateNote"), period: point.period })),
    ...sortedHistory.map((entry) => ({ date: new Date(entry.changedAt).toLocaleDateString(i18n.language), timestamp: entry.changedAt, value: entry.value, label: t(`ftpProgression.source.${entry.source}`), note: t("chartDetail.ftpAppliedNote"), period: null })),
  ].sort((a, b) => a.timestamp - b.timestamp);
  const selectedPoint = selectedIndex == null ? null : chartPoints[Math.min(selectedIndex, chartPoints.length - 1)];
  const selectedDayPoints = selectedPoint ? chartPoints.filter(point => new Date(point.timestamp).toISOString().slice(0, 10) === new Date(selectedPoint.timestamp).toISOString().slice(0, 10)) : [];
  const selectPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !chartPoints.length) return;
    const x = (event.clientX - bounds.left) / bounds.width * w;
    let closest = 0;
    chartPoints.forEach((point, index) => { if (Math.abs(sx(point.timestamp) - x) < Math.abs(sx(chartPoints[closest]!.timestamp) - x)) closest = index; });
    setSelectedIndex(closest);
  };

  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between" style={{ gap: "var(--space-4)" }}>
        <div>
          <Text as="h3" variant={compact ? "subtitle" : "title"}>{t(hasHistory ? "ftpProgression.combinedTitle" : "ftpProgression.title")}</Text>
          {!compact && <Text as="p" variant="caption" tone="secondary" style={{ marginTop: "var(--space-1)" }}>{t(hasHistory ? "ftpProgression.combinedDescription" : "ftpProgression.description")}</Text>}
        </div>
        {hasChart && !embedded && (
          <div style={{ textAlign: "right" }}>
            <Text as="div" variant="caption" tone="tertiary">{t(hasHistory ? "ftpProgression.latestApplied" : "ftpProgression.latestAutoEstimate")}</Text>
            <Text variant="mono" style={{ color: hasHistory ? "var(--violet)" : "var(--aqua)" }}>{hasHistory ? sortedHistory[sortedHistory.length - 1]!.value : points[points.length - 1]!.ftpW} W</Text>
          </div>
        )}
      </div>

      {hasChart && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <div className="ftp-progression__legend" style={{ display: "flex", flexWrap: "wrap", gap: compact ? "var(--space-2)" : "var(--space-3)", marginBottom: "var(--space-2)" }}>
            {points.length > 0 && <Text as="span" variant="caption" tone="secondary">● {t("ftpProgression.autoSeriesLabel")}</Text>}
            {hasHistory && <Text as="span" variant="caption" tone="secondary" style={{ color: "var(--violet)" }}>● {t("ftpProgression.historySeriesLabel")}</Text>}
            {currentFtpW != null && currentFtpW > 0 && (
              <Text as="span" variant="caption" tone="secondary">┄ {t("ftpProgression.activeReferenceLabel", { value: currentFtpW })}</Text>
            )}
          </div>
          <div className="ftp-progression__chart">
          <div className="ftp-progression__y-axis" aria-hidden="true"><span>W</span>{[hi, (lo + hi) / 2, lo].map(value => <span key={value}>{value}</span>)}</div>
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" tabIndex={0} aria-label={`${trendDescription}. ${t("chartDetail.navigate")}`} className="ftp-progression__plot"
            onPointerMove={selectPointer} onPointerDown={selectPointer} onPointerLeave={event => { if (event.pointerType === "mouse") setSelectedIndex(null); }}
            onFocus={() => setSelectedIndex(chartPoints.length - 1)} onBlur={() => setSelectedIndex(null)}
            onKeyDown={event => {
              if (event.key === "Escape") setSelectedIndex(null);
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSelectedIndex(index => Math.max(0, Math.min(chartPoints.length - 1, (index ?? chartPoints.length - 1) + (event.key === "ArrowRight" ? 1 : -1)))); }
            }}>
            <desc>{trendDescription}</desc>
            {[hi, (lo + hi) / 2, lo].map(value => <line key={value} x1="0" x2={w} y1={sy(value)} y2={sy(value)} stroke="var(--line-soft)" />)}
            {currentFtpW != null && currentFtpW > 0 && (
              <line x1="0" x2={w} y1={sy(currentFtpW)} y2={sy(currentFtpW)} stroke="var(--ink-4)" strokeDasharray="4 4" />
            )}
            {hasEstimatedTrend && <path d={estimatedPath} stroke="var(--aqua)" strokeWidth="2" fill="none" />}
            {points.map((point, index) => (
              <g key={point.period}>
                <circle cx={sx(estimatedDates[index]!)} cy={sy(point.ftpW)} r="3.5" fill="var(--aqua)" />
              </g>
            ))}
            {sortedHistory.length > 1 && <path d={historyPath} stroke="var(--violet)" strokeWidth="2" fill="none" />}
            {sortedHistory.map((entry) => (
              <circle key={entry.id} cx={sx(entry.changedAt)} cy={sy(entry.value)} r="4" fill="var(--violet)" />
            ))}
          </svg>
          <div className="ftp-progression__x-axis" aria-hidden="true" data-ticks={axisTimes.length}>{axisTimes.map(timestamp => <span key={timestamp}>{formatAxisTime(timestamp)}</span>)}</div>
          </div>
          {selectedPoint && <div role="status" data-ftp-tooltip style={{ padding: "var(--space-3)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", background: "var(--bg-2)", color: "var(--ink-1)", fontSize: "var(--fs-sm)", overflowWrap: "anywhere" }}>
            {selectedDayPoints.map((point, index) => <div key={index} style={{ paddingBlock: "var(--space-1)" }}>
              <strong>{point.period ?? point.date} · {point.value} W</strong>
              <div>{point.label}</div><div>{point.note}</div>
            </div>)}
            {currentFtpW != null && <div>{t("ftpProgression.activeReferenceLabel", { value: currentFtpW })}</div>}
          </div>}
          {!compact && points.length > 0 && <Text as="p" variant="caption" tone="tertiary">{t("ftpProgression.method")}</Text>}
          {hasHistory && (embedded && !showHistory ? <details data-ftp-history style={{ marginTop: "var(--space-2)" }}>
            <summary style={{ color: "var(--ink-2)", fontSize: "var(--fs-sm)", cursor: "pointer", minHeight: 44, paddingBlock: "var(--space-3)", boxSizing: "border-box" }}>{t("ftpProgression.historyDetails")}</summary>
            <div style={{ display: "grid", gap: "var(--space-1)", paddingBottom: "var(--space-2)" }}>
              {sortedHistory.slice(-4).reverse().map((entry) => (
                <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <Text variant="caption" tone="secondary">{new Date(entry.changedAt).toLocaleDateString(i18n.language)} · {t(`ftpProgression.source.${entry.source}`)}</Text>
                  <Text variant="mono" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{entry.value} W</Text>
                </div>
              ))}
            </div>
          </details> :
            <div data-ftp-history style={{ display: "grid", gap: "var(--space-1)", marginTop: "var(--space-3)" }}>
              {sortedHistory.slice(-4).reverse().map((entry) => (
                <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <Text variant="caption" tone="secondary">{new Date(entry.changedAt).toLocaleDateString(i18n.language)} · {t(`ftpProgression.source.${entry.source}`)}</Text>
                  <Text variant="mono" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{entry.value} W</Text>
                </div>
              ))}
            </div>)}
        </div>
      )}

      {breakthrough && !embedded && (
        <div style={{ marginTop: hasChart ? "var(--space-4)" : 0, padding: "var(--space-4)", borderRadius: "var(--r-md)", background: "var(--accent-soft-bg)", border: "1px solid var(--accent-soft-border)" }}>
          <Text as="div" variant="eyebrow" style={{ color: "var(--aqua)" }}>{t("ftpProgression.breakthroughEyebrow")}</Text>
          <Text as="p" variant="bodySmall" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
            {t("ftpProgression.breakthroughBody", {
              current: breakthrough.currentFtpW,
              candidate: breakthrough.candidateFtpW,
              delta: breakthrough.deltaW,
            })}
          </Text>
          <LocalizedLink to="/coach/condition?sport=bike#thresholds" className={buttonClass({ variant: "primary", size: "sm" })}>
            {t("ftpProgression.reviewCta")}
          </LocalizedLink>
        </div>
      )}
    </>
  );

  return embedded
    ? <div style={{ marginTop: "var(--space-4)" }}>{content}</div>
    : <Card padding="none" style={{ marginTop: "var(--space-4)", padding: "var(--space-5)" }}>{content}</Card>;
}
