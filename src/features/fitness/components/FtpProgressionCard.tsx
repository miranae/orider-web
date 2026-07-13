import { useTranslation } from "react-i18next";
import type { EstimatedFtpPoint, FtpBreakthrough } from "@shared/training/ftpProgression";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Card, Text, buttonClass } from "../../../theme/components";

export default function FtpProgressionCard({
  points,
  currentFtpW,
  breakthrough,
  embedded = false,
}: {
  points: EstimatedFtpPoint[];
  currentFtpW?: number | null;
  breakthrough: FtpBreakthrough | null;
  embedded?: boolean;
}) {
  const { t, i18n } = useTranslation("fitness");
  const hasTrend = points.length >= 2;
  if (!hasTrend && !breakthrough) return null;

  const w = 480;
  const h = 128;
  const xPadding = 8;
  const values = points.map((point) => point.ftpW);
  const referenceValues = currentFtpW && currentFtpW > 0 ? [...values, currentFtpW] : values;
  const min = referenceValues.length > 0 ? Math.min(...referenceValues) : 100;
  const max = referenceValues.length > 0 ? Math.max(...referenceValues) : 100;
  const padding = Math.max(5, (max - min) * 0.15);
  const lo = min - padding;
  const hi = max + padding;
  const sx = (index: number) => points.length <= 1
    ? w / 2
    : xPadding + (index / (points.length - 1)) * (w - xPadding * 2);
  const sy = (value: number) => h - ((value - lo) / Math.max(hi - lo, 1)) * h;
  const path = points.map((point, index) => `${index ? "L" : "M"}${sx(index).toFixed(1)} ${sy(point.ftpW).toFixed(1)}`).join(" ");
  const formatPeriod = (period: string) => new Intl.DateTimeFormat(i18n.language, { year: "2-digit", month: "short" })
    .format(new Date(`${period}-01T00:00:00`));
  const labelStep = Math.max(1, Math.ceil((points.length - 1) / 5));
  const shouldLabel = (index: number) => index === 0 || index === points.length - 1 || index % labelStep === 0;

  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between" style={{ gap: "var(--space-4)" }}>
        <div>
          <Text as="h3" variant="title">{t("ftpProgression.title")}</Text>
          <Text as="p" variant="caption" tone="secondary" style={{ marginTop: "var(--space-1)" }}>
            {t("ftpProgression.description")}
          </Text>
        </div>
        {hasTrend && !embedded && (
          <div style={{ textAlign: "right" }}>
            <Text as="div" variant="caption" tone="tertiary">{t("ftpProgression.latestAutoEstimate")}</Text>
            <Text variant="mono" style={{ color: "var(--aqua)" }}>{points[points.length - 1]!.ftpW} W</Text>
          </div>
        )}
      </div>

      {hasTrend && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <svg viewBox={`0 0 ${w} ${h + 24}`} role="img" aria-label={t("ftpProgression.chartLabel")} style={{ width: "100%", height: 168 }}>
            {currentFtpW != null && currentFtpW > 0 && (
              <line x1="0" x2={w} y1={sy(currentFtpW)} y2={sy(currentFtpW)} stroke="var(--ink-4)" strokeDasharray="4 4" />
            )}
            <path d={path} stroke="var(--aqua)" strokeWidth="2" fill="none" />
            {points.map((point, index) => (
              <g key={point.period}>
                <circle cx={sx(index)} cy={sy(point.ftpW)} r="3.5" fill="var(--aqua)" />
                {shouldLabel(index) && (
                  <text x={sx(index)} y={h + 18} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill="var(--ink-4)" style={{ fontSize: "var(--fs-xs)" }}>
                    {formatPeriod(point.period)}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <Text as="p" variant="caption" tone="tertiary">{t("ftpProgression.method")}</Text>
        </div>
      )}

      {breakthrough && !embedded && (
        <div style={{ marginTop: hasTrend ? "var(--space-4)" : 0, padding: "var(--space-4)", borderRadius: "var(--r-md)", background: "var(--accent-soft-bg)", border: "1px solid var(--accent-soft-border)" }}>
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
