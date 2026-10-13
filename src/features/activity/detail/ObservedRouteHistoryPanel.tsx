import { getDiscipline } from "../../../utils/disciplineFilter";
import { formatSimilarRouteValue, type SimilarRouteMetric } from "./similarRouteHistory";
import { formatElapsedBoundary } from "./activityRangeSelection";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { useLocale } from "../../../contexts/LocaleContext";
import { useObservedRouteHistory } from "../../../hooks/useObservedRouteHistory";
import { Button, ChartFrame, Select, Stack, Text } from "../../../theme";
import { formatDistance } from "../../../utils/units";
import { observedRouteHistoryChoices, observedRouteHistoryPartial, observedRouteHistorySummary, observedRouteHistoryYear, observedRouteHistoryTrend, observedRouteAverage, observedRouteAverageTrend } from "./observedRouteHistory";
import "./observed-route-history.css";
function RouteHistoryView({ anchor, activities, observedMetricsIdentity }: { anchor: Activity; activities: readonly Activity[]; observedMetricsIdentity: string }) {
  const { t, i18n } = useTranslation("activity"), { units } = useLocale();
  const choices = observedRouteHistoryChoices(anchor, activities);
  const [metric, setMetric] = useState<SimilarRouteMetric | "canonicalAverage">("canonicalAverage");
  const [picked, setPicked] = useState<string[]>([]), [year, setYear] = useState("all");
  const selected = choices.filter(activity => picked.includes(activity.id));
  const comparison = useObservedRouteHistory(anchor, selected, observedMetricsIdentity);
  const date = (time: number) => new Date(time).toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" });
  const yearOf = (activity: Activity) => observedRouteHistoryYear(activity.startTime);
  const years = [...new Set(choices.map(yearOf).filter((value): value is string => value !== null))].sort((a, b) => Number(b) - Number(a));
  const rows = [...comparison.rows].sort((a, b) => a.activity.startTime - b.activity.startTime || a.activity.id.localeCompare(b.activity.id));
  const visibleRows = rows.filter(row => year === "all" || yearOf(row.activity) === year);
  const chartActivities = rows.some(row => row.result?.state === "available") ? [anchor, ...rows.filter(row => row.result?.state === "available").map(row => row.activity)].filter(a => year === "all" || yearOf(a) === year) : [];
  const averageRows = chartActivities.map(activity => ({ activity, canonicalAverage: activity.id === anchor.id ? comparison.anchorAverage : rows.find(row => row.activity.id === activity.id)?.canonicalAverage }));
  const trend = metric === "canonicalAverage" ? observedRouteAverageTrend(averageRows, units) : observedRouteHistoryTrend(chartActivities, metric, units);
  const running = getDiscipline(anchor.type) === "run";
  const canonicalLabel = t(running ? "observedRouteHistory.averagePace" : "observedRouteHistory.averageSpeed", { unit: units === "imperial" ? running ? "min/mi" : "mph" : running ? "min/km" : "km/h" });
  const formatTrend = (point: typeof trend[number]) => metric === "canonicalAverage" ? observedRouteAverage(averageRows.find(row => row.activity.id === point.activity.id)?.canonicalAverage, point.activity, units).formatted : formatSimilarRouteValue(point.value, metric);
  const maximum = Math.max(1, ...trend.map(point => point.value ?? 0));
  const y = (value: number) => metric === "canonicalAverage" && running ? 35 + value / maximum * 100 : 135 - value / maximum * 100;
  const metricLabel = (key: SimilarRouteMetric | "canonicalAverage") => key === "canonicalAverage" ? canonicalLabel : t(`observedRouteHistory.metrics.${key}`, { unit: units === "imperial" ? "mi" : "km" });
  const partial = rows.filter(row => observedRouteHistoryPartial(row.result)).length;
  const compared = rows.filter(row => row.result?.state === "available").length;
  const lacking = (row: typeof rows[number]) => row.read && (row.reason === "missing_gps" || row.reason === "unknown_axis" || row.reason === "insufficient_observed_length");
  const separation = (meters: number) => `${(units === "imperial" ? meters * 3.280839895 : meters).toFixed(1)} ${units === "imperial" ? "ft" : "m"}`;
  if (!comparison.ownerAvailable) return null;
  return <details className="observed-route-history"><summary><Text variant="bodyMedium" weight={600}>{t("observedRouteHistory.title")}</Text></summary><section className="observed-route-history-content" aria-label={t("observedRouteHistory.title")}>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.scope")}</Text>
    <label className="observed-route-history-filter"><Text variant="bodyMedium">{t("observedRouteHistory.year")}</Text><Select value={year} onChange={event => setYear(event.target.value)}><option value="all">{t("observedRouteHistory.all")}</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</Select></label>
    <fieldset><legend><Text variant="bodyMedium">{t("observedRouteHistory.choose", { count: selected.length })}</Text></legend><div className="observed-route-history-options">{choices.filter(a => year === "all" || yearOf(a) === year).map(a => <label key={a.id}><input type="checkbox" checked={picked.includes(a.id)} disabled={!picked.includes(a.id) && selected.length >= 3} onChange={event => setPicked(values => event.target.checked ? [...values.filter(id => choices.some(choice => choice.id === id)), a.id] : values.filter(id => id !== a.id))} /><Text variant="bodyMedium">{date(a.startTime)} · {a.description || a.id}</Text></label>)}</div></fieldset>
    {!choices.length && <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.noChoices")}</Text>}
    <Button size="sm" disabled={!comparison.enabled || comparison.state === "loading"} loading={comparison.state === "loading"} onClick={() => void comparison.inspect()}>{t("observedRouteHistory.inspect")}</Button>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.budget")}</Text>
    {comparison.state !== "idle" && <>
      <Text as="p" variant="bodyMedium" role="status">{t("observedRouteHistory.counts", { selected: selected.length, read: rows.filter(row => row.read).length, compared, unavailable: rows.filter(row => !lacking(row) && (!row.result || row.result.state === "unavailable")).length, partial, unsupported: rows.filter(lacking).length })}</Text>
      {comparison.anchorState !== "available" && <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.anchorState", { state: t(`observedRouteHistory.states.${comparison.anchorState}`) })}</Text>}
      <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.visible", { visible: visibleRows.length, total: rows.length })}</Text>
      <Stack direction="row" wrap gap="var(--space-2)">{(["canonicalAverage", "distance", "movingTime", "pauseTime"] as const).map(key => <Button key={key} size="sm" variant={metric === key ? "secondary" : "ghost"} aria-pressed={metric === key} onClick={() => setMetric(key)}>{metricLabel(key)}</Button>)}</Stack>
      {metric === "canonicalAverage" && <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.averageBasis")}</Text>}
      {trend.some(point => point.value !== null) ? <ChartFrame className="observed-route-history-trend" variant="embedded" header={<Text variant="bodyMedium">{metricLabel(metric)}</Text>}>
        <svg className="observed-route-history-chart" viewBox="0 0 420 160" role="img" aria-label={t("observedRouteHistory.chart", { metric: metricLabel(metric) })}>
          <line x1={65} x2={385} y1={135} y2={135} stroke="var(--line-soft)" />
          {trend.map((point, index) => {
            const previous = trend[index - 1];
            return <g key={point.activity.id}>
              {point.value !== null && previous?.value != null && <line data-testid="observed-history-segment" x1={previous.x} y1={y(previous.value)} x2={point.x} y2={y(point.value)} stroke="var(--accent)" strokeWidth={2} />}
              {point.value !== null && <circle data-source-id={point.activity.id} cx={point.x} cy={y(point.value)} r={point.activity.id === anchor.id ? 6 : 4} fill="var(--accent)"><title>{date(point.activity.startTime)} · {formatTrend(point)}</title></circle>}
            </g>;
          })}
        </svg>
        <div className="observed-route-history-axis"><Text variant="bodyMedium">{date(trend[0]!.activity.startTime)}</Text><Text variant="bodyMedium">{date(trend[trend.length - 1]!.activity.startTime)}</Text></div>
        <Text as="p" variant="bodyMedium" tone="secondary">{t(metric === "canonicalAverage" ? "observedRouteHistory.averageTrendNote" : "observedRouteHistory.trendNote", { count: trend.length })}</Text>
      </ChartFrame> : <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.noTrend")}</Text>}
      <ol className="observed-route-history-results">{visibleRows.map(row => {
        const result = row.result, summary = observedRouteHistorySummary(row.activity);
        const direction = result && result.state !== "unavailable" ? result.direction === "reverse" ? result.reverse : result.forward : null;
        return <li key={row.activity.id}>
          <a className="observed-route-history-source" href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(row.activity.id)}`}>{date(row.activity.startTime)} · {t("observedRouteHistory.source")}</a>
          <Text as="p" variant="bodyMedium" weight={600}>{result && result.state !== "unavailable" ? t(`observedRouteHistory.guidance.${result.shapeGuidance}`) : t(`observedRouteHistory.states.${row.state}`)}</Text>
          {result && result.state !== "unavailable" && <>
            <Text as="p" variant="bodyMedium">{t(`observedRouteHistory.direction.${result.direction}`)} · {t("observedRouteHistory.ratio", { value: (result.lengthRatio * 100).toFixed(1) })}</Text>
            {direction && <Text as="p" variant="bodyMedium" mono>{t("observedRouteHistory.separation", { mean: separation(direction.meanSeparationM), p95: separation(direction.p95SeparationM) })}</Text>}
            {observedRouteHistoryPartial(result) && <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.partial")}</Text>}
            <details><summary><Text variant="bodyMedium">{t("observedRouteHistory.details")}</Text></summary>{result.diagnostics.map((diagnostic, index) => <Text key={index} as="p" variant="bodyMedium" tone="secondary">{t(index === 0 ? "observedRouteHistory.anchor" : "observedRouteHistory.selected")}: {t("observedRouteHistory.diagnostic", { points: diagnostic.inputPointCount, length: formatDistance(diagnostic.observedLengthM, units), gaps: diagnostic.gapCount, missing: diagnostic.omittedGapElapsedSec.toFixed(1) })} · {t(`observedRouteHistory.coverage.${diagnostic.coverage}`)}</Text>)}</details>
          </>}
          <Text as="p" variant="bodyMedium" mono>{canonicalLabel}: {observedRouteAverage(row.canonicalAverage, row.activity, units).formatted}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{row.canonicalAverage?.state === "available" ? t("observedRouteHistory.averageComputed", { date: new Date(row.canonicalAverage.computedAt).toLocaleString(i18n.language, { timeZone: "Asia/Seoul" }) }) : t("observedRouteHistory.averageMissing")}</Text>
          {row.canonicalAverage?.state === "available" && row.canonicalAverage.inputCoverage === "partial_terminal" && <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.averagePartial")}</Text>}
          <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.summary", { distance: summary.distanceM === null ? "—" : formatDistance(summary.distanceM, units), moving: summary.movingSec === null ? "—" : formatElapsedBoundary(summary.movingSec), pause: summary.pauseSec === null ? "—" : formatElapsedBoundary(summary.pauseSec) })}</Text>
        </li>;
      })}</ol>
      <Stack direction="row" wrap><a className="observed-route-history-source" href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(anchor.id)}`}>{t("observedRouteHistory.anchor")} · {date(anchor.startTime)}</a></Stack>
      <Text as="p" variant="bodyMedium" mono>{t("observedRouteHistory.anchor")} · {canonicalLabel}: {observedRouteAverage(comparison.anchorAverage, anchor, units).formatted}</Text>
      {comparison.anchorAverage?.state === "available" && <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.anchor")} · {t("observedRouteHistory.averageComputed", { date: new Date(comparison.anchorAverage.computedAt).toLocaleString(i18n.language, { timeZone: "Asia/Seoul" }) })}{comparison.anchorAverage.inputCoverage === "partial_terminal" ? ` ${t("observedRouteHistory.averagePartial")}` : ""}</Text>}
      <Text as="p" variant="bodyMedium" tone="secondary">{t("observedRouteHistory.limits")}</Text>
    </>}
  </section></details>;
}
/** 부모가 이미 불러온 목록만 선택한다. 연도 선택은 목록 표시만 바꾼다. */
export default function ObservedRouteHistoryPanel(props: { anchor: Activity; activities: readonly Activity[]; observedMetricsIdentity: string }) {
  return <RouteHistoryView key={`${props.anchor.id}:${props.anchor.userId}`} {...props} />;
}
