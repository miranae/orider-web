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
}: {
  points: EstimatedFtpPoint[];
  history?: FtpHistoryEntry[];
  currentFtpW?: number | null;
  breakthrough: FtpBreakthrough | null;
  embedded?: boolean;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation("fitness");
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
  const lo = min - padding;
  const hi = max + padding;
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
  const axisPeriods = [...new Set([
    ...points.map((point) => point.period),
    ...sortedHistory.map((entry) => new Date(entry.changedAt).toISOString().slice(0, 7)),
  ])].sort();
  const labelStep = Math.max(1, Math.ceil((axisPeriods.length - 1) / 5));
  const shouldLabel = (index: number) => index === 0 || index === axisPeriods.length - 1 || index % labelStep === 0;
  const estimatedDescription = points.map((point) => `${formatPeriod(point.period)} ${point.ftpW}W`).join(", ");
  const historyDescription = sortedHistory.map((entry) => `${new Date(entry.changedAt).toLocaleDateString(i18n.language)} ${entry.value}W ${t(`ftpProgression.source.${entry.source}`)}`).join(", ");
  const trendDescription = `${t("ftpProgression.chartLabel")}: ${[
    estimatedDescription && `${t("ftpProgression.autoSeriesLabel")} ${estimatedDescription}`,
    historyDescription && `${t("ftpProgression.historySeriesLabel")} ${historyDescription}`,
  ].filter(Boolean).join("; ")}`;

  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between" style={{ gap: "var(--space-4)" }}>
        <div>
          <Text as="h3" variant={compact ? "eyebrow" : "title"}>{t(hasHistory ? "ftpProgression.combinedTitle" : "ftpProgression.title")}</Text>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
            {points.length > 0 && <Text as="span" variant="caption" tone="secondary">● {t("ftpProgression.autoSeriesLabel")}</Text>}
            {hasHistory && <Text as="span" variant="caption" tone="secondary" style={{ color: "var(--violet)" }}>● {t("ftpProgression.historySeriesLabel")}</Text>}
            {currentFtpW != null && currentFtpW > 0 && (
              <Text as="span" variant="caption" tone="secondary">┄ {t("ftpProgression.activeReferenceLabel", { value: currentFtpW })}</Text>
            )}
          </div>
          <svg viewBox={`0 0 ${w} ${h + 24}`} role="img" aria-label={trendDescription} style={{ width: "100%", height: 168 }}>
            <desc>{trendDescription}</desc>
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
            {axisPeriods.map((period, index) => shouldLabel(index) && (
              <text key={period} x={sx(Date.parse(`${period}-01T00:00:00Z`))} y={h + 18} textAnchor={index === 0 ? "start" : index === axisPeriods.length - 1 ? "end" : "middle"} fill="var(--ink-4)" style={{ fontSize: "var(--fs-xs)" }}>
                {formatPeriod(period)}
              </text>
            ))}
          </svg>
          {!compact && points.length > 0 && <Text as="p" variant="caption" tone="tertiary">{t("ftpProgression.method")}</Text>}
          {hasHistory && (
            <div data-ftp-history style={{ display: "grid", gap: "var(--space-1)", marginTop: "var(--space-3)" }}>
              {sortedHistory.slice(-4).reverse().map((entry) => (
                <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <Text variant="caption" tone="secondary">{new Date(entry.changedAt).toLocaleDateString(i18n.language)} · {t(`ftpProgression.source.${entry.source}`)}</Text>
                  <Text variant="mono">{entry.value} W</Text>
                </div>
              ))}
            </div>
          )}
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
          <LocalizedLink to="/settings?section=training" className={buttonClass({ variant: "primary", size: "sm" })}>
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
