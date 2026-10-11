import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import type { Units } from "../../../utils/units";
import { Button, ChartFrame, Stack, Text } from "../../../theme";
import { ROUTE_CANDIDATE_LIMIT } from "./routeSimilarity";
import { formatSimilarRouteValue, similarRouteHistoryRows, similarRouteMetricValue, similarRouteSummary, type SimilarRouteMetric } from "./similarRouteHistory";
import "./similar-route-history.css";

export interface SimilarRouteHistoryPanelProps {
  current: Activity;
  candidates: readonly Activity[];
  checkedCount: number;
  loadedCount: number;
  hasMore: boolean;
  selectedId: string;
  units: Units;
  onCompare: (activityId: string) => void;
}
export default function SimilarRouteHistoryPanel({ current, candidates, checkedCount, loadedCount, hasMore, selectedId, units, onCompare }: SimilarRouteHistoryPanelProps) {
  const { t, i18n } = useTranslation("activity");
  const [metric, setMetric] = useState<SimilarRouteMetric>("movingTime");
  const rows = similarRouteHistoryRows(current, candidates);
  const currentRow = similarRouteSummary(current);
  const metrics = ["distance", "movingTime", "pauseTime"] as const;
  const distanceUnit = units === "imperial" ? "mi" : "km";
  const metricLabel = (key: SimilarRouteMetric) => t(`similarRouteHistory.metrics.${key}`, { unit: distanceUnit });
  const date = (time: number, compact = false) => new Date(time).toLocaleString(i18n.language, {
    timeZone: "Asia/Seoul", ...(compact ? { month: "numeric", day: "numeric" } as const
      : { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" } as const),
  });
  const values = rows.map((row) => similarRouteMetricValue(row, metric, units));
  const maximum = Math.max(1, ...values.filter((value): value is number => value != null));
  const x = (index: number) => rows.length > 1 ? 65 + index * 320 / (rows.length - 1) : 225;
  const y = (value: number) => 135 - value / maximum * 100;
  const labelIndices = new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1]);
  return <section className="similar-route-history" aria-label={t("similarRouteHistory.title")}>
    <Text as="h4" variant="subtitle">{t("similarRouteHistory.title")}</Text>
    <Text as="p" variant="body" tone="secondary">{t("similarRouteHistory.note")}</Text>
    <Text as="p" variant="body" tone="secondary">{t("similarRouteHistory.scope", { loaded: loadedCount, checked: checkedCount, limit: ROUTE_CANDIDATE_LIMIT })}</Text>
    <Text as="p" variant="body" tone="secondary">{t(hasMore ? "similarRouteHistory.moreAvailable" : "similarRouteHistory.loadedOnly")}</Text>
    <div className="similar-route-history-current">
      <Text as="h5" variant="bodyMedium">{t("similarRouteHistory.current")} · {date(current.startTime)}</Text>
      <div className="similar-route-history-values">{metrics.map((key) => <div key={key}><Text as="p" variant="body" tone="secondary">{metricLabel(key)}</Text><Text variant="bodyMedium" mono>{formatSimilarRouteValue(similarRouteMetricValue(currentRow, key, units), key)}</Text></div>)}</div>
    </div>
    {rows.length > 0 && <>
      <Stack direction="row" wrap gap="var(--space-2)">{metrics.map((key) => <Button key={key} size="sm" variant={metric === key ? "secondary" : "ghost"} aria-pressed={metric === key} onClick={() => setMetric(key)}>{metricLabel(key)}</Button>)}</Stack>
      {values.some((value) => value != null) ? <ChartFrame variant="embedded" header={<Stack gap="var(--space-1)"><Text variant="bodyMedium">{metricLabel(metric)}</Text><Text variant="body" tone="secondary">{formatSimilarRouteValue(0, metric)}–{formatSimilarRouteValue(maximum, metric)}</Text></Stack>}>
        <svg className="similar-route-history-chart" viewBox="0 0 420 180" role="img" aria-label={t("similarRouteHistory.chart", { metric: metricLabel(metric) })}>
          <line x1={65} x2={385} y1={135} y2={135} stroke="var(--line-soft)" />
          {values.map((value, index) => {
            const previous = index > 0 ? values[index - 1] : null;
            return <g key={rows[index]!.activity.id}>
              {value != null && previous != null && <line x1={x(index - 1)} y1={y(previous)} x2={x(index)} y2={y(value)} stroke="var(--accent)" strokeWidth={2} />}
              {value != null && <circle cx={x(index)} cy={y(value)} r={rows[index]!.activity.id === selectedId ? 6 : 4} fill={rows[index]!.activity.id === selectedId ? "var(--ink-1)" : "var(--accent)"}><title>{date(rows[index]!.activity.startTime)} · {formatSimilarRouteValue(value, metric)}</title></circle>}
              {labelIndices.has(index) && <text x={x(index)} y={165} textAnchor="middle" fill="var(--ink-2)">{date(rows[index]!.activity.startTime, true)}</text>}
            </g>;
          })}
        </svg>
        <Text as="p" variant="body" tone="secondary">{t("similarRouteHistory.recordOrder")}</Text>
      </ChartFrame> : <Text as="p" variant="body" tone="secondary">{t("similarRouteHistory.noMetric")}</Text>}
      <Text as="p" variant="body" tone="secondary">{t("similarRouteHistory.missing")}</Text>
      <details className="similar-route-history-sources" open>
        <summary><Text variant="bodyMedium">{t("similarRouteHistory.sources", { count: rows.length })}</Text></summary>
        <ol>{rows.map((row) => <li key={row.activity.id} className="similar-route-history-source">
          <a className="activity-growth-source-link" href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(row.activity.id)}`}><Text variant="body">{date(row.activity.startTime)} · {row.activity.description || row.activity.type}</Text></a>
          <div className="similar-route-history-values">{metrics.map((key) => <div key={key}><Text as="p" variant="body" tone="secondary">{metricLabel(key)}</Text><Text variant="bodyMedium" mono>{formatSimilarRouteValue(similarRouteMetricValue(row, key, units), key)}</Text></div>)}</div>
          <Button className="similar-route-history-compare" size="sm" variant={selectedId === row.activity.id ? "secondary" : "outline"} aria-pressed={selectedId === row.activity.id} onClick={() => onCompare(row.activity.id)}>{t("similarRouteHistory.compare")}</Button>
        </li>)}</ol>
      </details>
    </>}
  </section>;
}
