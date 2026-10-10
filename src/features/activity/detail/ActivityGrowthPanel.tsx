import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { useLocale } from "../../../contexts/LocaleContext";
import { useAuth } from "../../../contexts/AuthContext";
import { useActivityGrowthHistory } from "../../../hooks/useActivityGrowthHistory";
import { useActivityMetrics } from "../../../hooks/useActivityMetrics";
import { useTrainingAnalysisPeriods } from "../../../hooks/useTrainingAnalysisPeriods";
import { trainingAnalysisPeriodsAvailable } from "../../../services/trainingAnalysisPeriods";
import TrainingPeriodZonesPanel from "./TrainingPeriodZonesPanel";
import { Button, Card, ChartFrame, Input, Select, Stack, Stat, Text } from "../../../theme";
import "./activity-growth-panel.css";
import { getDiscipline } from "../../../utils/disciplineFilter";
import { activityPeriods, comparisonRows, customActivityPeriods, sameActivitySport, settledMetrics, summarizePeriod, type StatisticsPeriod } from "./activityGrowth";
import type { MetricsLike } from "./metricsPresentation";
import { similarRouteCandidates } from "./routeSimilarity";
import { ActivityComparisonVisuals } from "./ActivityComparisonVisuals";

export interface ActivityGrowthPanelProps { activity: Activity; metrics: MetricsLike | null; isOwner: boolean; embedded?: boolean }
function number(value: number | null, digits = 1): string {
  if (value == null) return "—";
  const displayed = value.toFixed(digits);
  return Number(displayed) === 0 ? (0).toFixed(digits) : displayed;
}
function signedNumber(value: number | null, digits = 1): string {
  const displayed = number(value, digits);
  return Number(displayed) > 0 ? `+${displayed}` : displayed;
}
function pace(seconds: number | null): string {
  if (seconds == null) return "—";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
function Comparison({ activity, metrics }: Omit<ActivityGrowthPanelProps, "isOwner">) {
  const { t, i18n } = useTranslation("activity");
  const { user } = useAuth();
  const { units } = useLocale();
  const distanceFactor = units === "imperial" ? 1 / 1.609344 : 1;
  const elevationFactor = units === "imperial" ? 1 / 0.3048 : 1;
  const history = useActivityGrowthHistory("comparison", 0);
  const [selectedId, setSelectedId] = useState("");
  const [routeOnly, setRouteOnly] = useState(false);
  const candidates = history.activities.filter((candidate) => candidate.userId === user?.uid && candidate.id !== activity.id
    && candidate.deletedAt == null && candidate.startTime < activity.startTime && sameActivitySport(activity, candidate));
  const routes = similarRouteCandidates(activity, candidates);
  const choices = routeOnly ? routes.candidates : candidates;
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  const baseline = useActivityMetrics(selected?.id ?? null);
  const running = getDiscipline(activity.type) === "run";
  const convert = (value: number | null, key: string) => value == null ? null : value * (key === "distanceKm" || (key === "avgSpeedKph" && !running) ? distanceFactor : key === "elevationGainM" ? elevationFactor : key === "avgSpeedKph" && running ? 1 / distanceFactor : 1);
  const format = (raw: number | null, key: string) => { const value = convert(raw, key); return key === "avgSpeedKph" && running ? pace(value)
    : number(value, ["avgHr", "avgPower", "np", "elevationGainM", "movingTimeSec"].includes(key) ? 0 : 1); };
  const unit = (key: string) => key === "avgSpeedKph" ? running ? units === "imperial" ? "/mi" : "/km" : units === "imperial" ? "mph" : "km/h"
    : ({ distanceKm: units === "imperial" ? "mi" : "km", movingTimeSec: "s", avgHr: "bpm", avgPower: "W", np: "W", elevationGainM: units === "imperial" ? "ft" : "m" }[key] ?? "");
  const date = (time: number) => new Date(time).toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" });
  const powerLabel = (source: MetricsLike | null) => !source || !settledMetrics(source) || ![source.avgPower, source.np, ...Object.values(source.mmp ?? {})].some((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ? t("growth.visual.powerMissing") : source?.isVirtualPower === true ? t("growth.virtualPower")
    : source?.isVirtualPower === false ? t("growth.measuredPower") : t("growth.powerUnknown");
  return <div className="space-y-4">
    <Text as="p" variant="bodySmall" tone="secondary">{t("growth.conditions")}</Text>
    <Stack direction="row" wrap gap="var(--space-2)">
      <Button size="sm" variant={!routeOnly ? "secondary" : "ghost"} aria-pressed={!routeOnly} onClick={() => setRouteOnly(false)}>{t("growth.route.all")}</Button>
      <Button size="sm" variant={routeOnly ? "secondary" : "ghost"} aria-pressed={routeOnly} onClick={() => setRouteOnly(true)}>{t("growth.route.similar", { count: routes.candidates.length })}</Button>
    </Stack>
    {routeOnly && <Text as="p" variant="bodySmall" tone="secondary">{t("growth.route.note", { count: routes.checked })}</Text>}
    {routeOnly && <Text as="p" variant="bodySmall" tone="secondary">{t(routes.available ? routes.candidates.length ? "growth.route.choose" : "growth.route.empty" : "growth.route.unavailable")}</Text>}
    <label className="block space-y-2 activity-growth-selection">
      <Text variant="label">{t("growth.choose")}</Text>
      <Select className="w-full min-w-0" value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
        <option value="">{t("growth.none")}</option>
        {(selected && !choices.some((candidate) => candidate.id === selected.id) ? [selected, ...choices] : choices).map((candidate) => <option key={candidate.id} value={candidate.id}>{date(candidate.startTime)} · {candidate.description || candidate.type}{routeOnly && !routes.candidates.some((match) => match.id === candidate.id) ? ` · ${t("growth.route.retained")}` : ""}</option>)}
      </Select>
    </label>
    {history.loading && <Text as="p">{t("growth.loading")}</Text>}
    {history.error && <Button size="sm" onClick={history.retry}>{t("growth.retry")}</Button>}
    {!history.loading && !history.error && candidates.length === 0 && <Text as="p">{t("growth.noPrevious")}</Text>}
    {history.hasMore && <Button size="sm" variant="outline" loading={history.loadingMore} onClick={history.loadMore}>{t("growth.loadMore")}</Button>}
    {selected && <>
      <Text as="p" variant="bodySmall" tone="secondary">{t("growth.route.context", { current: number(activity.summary?.pauseTimeSec ?? null, 0), previous: number(selected.summary?.pauseTimeSec ?? null, 0) })}</Text>
      <Button size="sm" variant="ghost" onClick={() => setSelectedId("")}>{t("growth.clear")}</Button>
      {baseline.status === "loading" && <Text as="p">{t("growth.loading")}</Text>}
      {baseline.status === "stale" && <Text as="p" tone="warning">{t("growth.stale")}</Text>}
      {!baseline.metrics && baseline.status !== "loading" && <Text as="p">{t("growth.metricsMissing")}</Text>}
      <div className="activity-growth-table-shell">
        <table className="activity-growth-table">
          <thead><tr><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.metric")}</Text></th><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.current")}</Text></th><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{date(selected.startTime)}</Text></th></tr></thead>
          <tbody>{comparisonRows(metrics, baseline.metrics, running).map((row) => <tr key={row.key}>
            <th scope="row"><Text variant="bodySmall" tone="secondary">{t(`growth.metrics.${row.key === "avgSpeedKph" && running ? "pace" : row.key}`)} · {unit(row.key)}</Text></th>
            <td><Text variant="bodyMedium" mono tone="primary">{format(row.value, row.key)}</Text>{row.delta != null && <Text as="p" variant="caption" tone="tertiary">{t("growth.change")} <span className="whitespace-nowrap">{signedNumber(convert(row.delta, row.key), 1)} {row.key === "avgSpeedKph" && running ? units === "imperial" ? "s/mi" : "s/km" : unit(row.key)}</span></Text>}</td>
            <td><Text variant="bodyMedium" mono tone="secondary">{format(row.baseline, row.key)}</Text></td>
          </tr>)}</tbody>
        </table>
      </div>
      <Text as="p" variant="caption" tone="tertiary">{t("growth.current")}: {powerLabel(metrics)} · {t("growth.previous")}: {powerLabel(baseline.metrics)}</Text>
      {metrics && baseline.metrics && settledMetrics(metrics) && settledMetrics(baseline.metrics) && <>
        <ActivityComparisonVisuals key={selected.id} current={metrics} previous={baseline.metrics} running={running} units={units} />
      </>}
    </>}
  </div>;
}
function Statistics({ activity }: { activity: Activity }) {
  const { units } = useLocale();
  const { user } = useAuth();
  const { t, i18n } = useTranslation("activity");
  const bucketId = useId();
  const [period, setPeriod] = useState<StatisticsPeriod | "custom">("week");
  const [now] = useState(() => new Date());
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [custom, setCustom] = useState<ReturnType<typeof customActivityPeriods>>(null);
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [trendMetric, setTrendMetric] = useState<"distance" | "movingTime" | "elevation" | "count">("distance");
  const customDraft = customActivityPeriods(from, to, now.getTime());
  const boundaries = period === "custom" ? custom ?? activityPeriods(now.getTime(), "week") : activityPeriods(now.getTime(), period);
  const longPeriod = period === "3months" || period === "6months" || period === "12months";
  const weekStart = activityPeriods(boundaries.end - 1, "week").start;
  const discipline = getDiscipline(activity.type);
  const canonicalEnabled = trainingAnalysisPeriodsAvailable() && (discipline === "bike" || discipline === "run" || discipline === "swim");
  const applied = period !== "custom" || custom != null;
  const selection = useMemo(() => applied && (discipline === "bike" || discipline === "run" || discipline === "swim") ? {
    request: { discipline, periods: [
      { fromInclusive: boundaries.start, toExclusive: Math.min(boundaries.end, now.getTime()) },
      { fromInclusive: boundaries.previousStart, toExclusive: boundaries.previousEnd },
    ] }, requestId: 0,
  } : null, [applied, boundaries.end, boundaries.previousEnd, boundaries.previousStart, boundaries.start, discipline, now]);
  const canonical = useTrainingAnalysisPeriods(user?.uid, selection, canonicalEnabled);
  const legacy = useActivityGrowthHistory("statistics", now.getTime(), applied && !canonicalEnabled, {
    fromInclusive: Math.min(boundaries.previousStart, weekStart - 5 * 7 * 86400000), toExclusive: boundaries.end,
  });
  const stats = canonicalEnabled ? {
    sourceActivities: canonical.response?.periods.flatMap((p) => p.activities.map((entry) => ({
      id: entry.activityId, userId: activity.userId, type: activity.type, startTime: entry.startTime,
      summary: { distance: entry.distanceM, movingTimeSec: entry.movingTimeSec, elevationGain: entry.elevationGainM },
    } as unknown as Activity))) ?? [],
    coverage: canonical.state === "loading" ? "loading" : canonical.state === "ready" && canonical.response?.periods.every((p) => !p.coverage.truncated) ? "ready" : "partial",
    error: canonical.state === "error", hasMore: false, canLoadMore: false, loadingMore: false,
    loadMore: () => {}, retry: () => canonical.retry(),
  } : legacy;
  const sources = stats.sourceActivities.filter((candidate) => sameActivitySport(activity, candidate));
  const complete = stats.coverage === "ready";
  const current = summarizePeriod(sources, boundaries.start, boundaries.end, complete);
  const previous = summarizePeriod(sources, boundaries.previousStart, boundaries.previousEnd, complete);
  const trendCount = longPeriod ? Math.min(Number.parseInt(period, 10) * 2, 12) : 6;
  const endDate = new Date(boundaries.end - 1 + 9 * 3600000);
  const monthStart = (offset: number) => Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() + offset, 1) - 9 * 3600000;
  const trend = Array.from({ length: trendCount }, (_, index) => {
    const start = longPeriod ? monthStart(index - trendCount + 1) : weekStart - (trendCount - 1 - index) * 7 * 86400000;
    const end = Math.min(longPeriod ? monthStart(index - trendCount + 2) : start + 7 * 86400000, boundaries.end);
    return { start, end, ...summarizePeriod(sources, start, end, complete) };
  }).filter((bucket) => !canonicalEnabled || bucket.start >= boundaries.previousStart);
  const selectedTrend = trend.find((bucket) => bucket.start === selectedBucket);
  const sourceList = selectedTrend?.sources ?? [...current.sources, ...previous.sources];
  const trendScale = trendMetric === "distance" ? units === "imperial" ? 1609.344 : 1000 : trendMetric === "movingTime" ? 3600 : trendMetric === "elevation" && units === "imperial" ? 0.3048 : 1;
  const chartMax = Math.max(1, ...trend.map((week) => (week[trendMetric] ?? 0) / trendScale));
  const date = (time: number) => new Date(time).toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" });
  const trendTitle = trendMetric === "distance" ? t(longPeriod ? "growth.monthlyTrend" : "growth.weeklyTrend", { count: trend.length, unit: units === "imperial" ? "mi" : "km" }) : t(longPeriod ? "growth.monthlyMetricTrend" : "growth.weeklyMetricTrend", { count: trend.length, metric: t(`growth.stats.${trendMetric}`, { unit: units === "imperial" ? "ft" : "m" }) });
  return <div className="space-y-4">
    <Stack direction="row" wrap gap="var(--space-2)">{(["week", "month", "3months", "6months", "12months", "custom"] as const).map((value) => <Button size="sm" key={value} variant={period === value ? "secondary" : "ghost"} onClick={() => { setPeriod(value); setSelectedBucket(null); }} aria-pressed={period === value}>{t(`growth.${value}`)}</Button>)}</Stack>
    {period === "custom" && <Stack gap="var(--space-2)"><Stack direction="row" wrap gap="var(--space-3)">
      <label><Text as="span" variant="label">{t("growth.fromDate")}</Text><Input type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} /></label>
      <label><Text as="span" variant="label">{t("growth.toDate")}</Text><Input type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} /></label>
      <Button size="sm" disabled={!customDraft} onClick={() => { setCustom(customDraft); setSelectedBucket(null); }}>{t("growth.applyDates")}</Button>
    </Stack><Text as="p" variant="bodySmall" tone="secondary">{t(customDraft ? "growth.customNote" : "growth.invalidDates")}</Text></Stack>}
    {(period !== "custom" || custom) && <Text as="p" variant="bodySmall" tone="secondary">{t(period === "custom" ? "growth.customPeriodNote" : "growth.periodNote")} · {date(boundaries.start)}–{date(boundaries.end - 1)} / {date(boundaries.previousStart)}–{date(boundaries.previousEnd - 1)}</Text>}
    {stats.coverage === "loading" && <Text as="p">{t("growth.loading")}</Text>}
    {stats.error && <Button size="sm" onClick={stats.retry}>{t("growth.retry")}</Button>}
    {!complete && stats.coverage !== "loading" && <Text as="p" tone="warning">{t("growth.partial", { count: sources.length })}</Text>}
    {canonicalEnabled && canonical.response?.periods.some((p) => p.coverage.truncated) && <Text as="p" variant="bodySmall" tone="secondary">{t("trainingPeriods.truncated")}</Text>}
    {canonicalEnabled && canonical.response && <Text as="p" variant="bodySmall" tone="secondary">{t("growth.canonicalPeriodBasis")}</Text>}
    {stats.hasMore && <><Button size="sm" variant="outline" disabled={!stats.canLoadMore} loading={stats.loadingMore} onClick={stats.loadMore}>{t(stats.canLoadMore ? "growth.loadStatistics" : "growth.statisticsLimit")}</Button><Text as="p" variant="caption" tone="tertiary">{t("growth.statisticsReadNote")}</Text></>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--dim-section-gap)]">
      {(["count", "distance", "movingTime", "elevation"] as const).map((key) => {
        const scale = key === "distance" ? units === "imperial" ? 1609.344 : 1000 : key === "movingTime" ? 3600 : key === "elevation" && units === "imperial" ? 0.3048 : 1;
        const a = current[key] == null ? null : current[key]! / scale;
        const b = previous[key] == null ? null : previous[key]! / scale;
        const digits = key === "count" || key === "elevation" ? 0 : 1;
        const coverage = key === "count" ? null : current.fields[key];
        const previousCoverage = key === "count" ? null : previous.fields[key];
        return <Stack key={key} gap="var(--dim-item-gap)" className="min-w-0">
          <Stat compact label={t(`growth.stats.${key}`, { unit: key === "distance" ? units === "imperial" ? "mi" : "km" : units === "imperial" ? "ft" : "m" })} value={number(a, digits)} />
          {coverage?.missingCount != null && coverage.missingCount > 0 && <Text as="p" variant="bodySmall" tone="secondary">{t("growth.observedSubtotal", { value: number(coverage.observed == null ? null : coverage.observed / scale, digits), known: coverage.knownCount, total: current.sources.length })}</Text>}
          <Text as="p" variant="caption" tone="tertiary">{t("growth.previousPeriod")} <Text mono>{number(b, digits)}</Text>{a != null && b != null && <> · {t("growth.change")} <Text mono className="whitespace-nowrap">{signedNumber(a - b)}</Text></>}</Text>
          {previousCoverage?.missingCount != null && previousCoverage.missingCount > 0 && <Text as="p" variant="caption" tone="tertiary">{t("growth.previousObservedSubtotal", { value: number(previousCoverage.observed == null ? null : previousCoverage.observed / scale, digits), known: previousCoverage.knownCount, total: previous.sources.length })}</Text>}
        </Stack>;
      })}
    </div>
    <Text as="p" variant="caption" tone="tertiary">{t("growth.missingNote")} {complete && [current, previous].some((p) => Object.values(p.fields).some((field) => (field.missingCount ?? 0) > 0)) && t("growth.subtotalNote")}</Text>
    <label className="activity-growth-selection block"><Text as="span" variant="label">{t("growth.trendMetric")}</Text><Select value={trendMetric} onChange={(event) => setTrendMetric(event.target.value as typeof trendMetric)}>{(["distance", "movingTime", "elevation", "count"] as const).map((key) => <option key={key} value={key}>{t(`growth.stats.${key}`, { unit: key === "distance" ? units === "imperial" ? "mi" : "km" : units === "imperial" ? "ft" : "m" })}</option>)}</Select></label>
    {complete && trend.every((week) => week[trendMetric] != null) && <ChartFrame variant="embedded" header={<Text as="h4" variant="subtitle">{trendTitle}</Text>}>
      <div className="activity-growth-trend-scroll"><svg className={`activity-growth-trend${trendCount > 6 ? " activity-growth-trend--long" : ""}`} viewBox="0 0 360 130" role="group" aria-label={trendTitle}>
        {trend.map((week, index) => {
          const value = week[trendMetric]! / trendScale;
          const height = value / chartMax * 75;
          const width = 360 / trend.length;
          const choose = () => setSelectedBucket(week.start);
          return <g key={week.start} role="button" tabIndex={0} aria-label={t("growth.inspectBucket", { date: date(week.start), count: week.sources.length })} aria-pressed={selectedBucket === week.start} onClick={choose} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(); } }} className="activity-growth-bucket"><rect x={index * width + width * .2} y={100 - height} width={width * .6} height={height} fill="var(--accent)" /><text x={index * width + width / 2} y={90 - height} textAnchor="middle" fill="var(--chart-grid-label)">{number(value)}</text><text x={index * width + width / 2} y={120} textAnchor="middle" fill="var(--chart-grid-label)">{new Date(week.start + 9 * 3600000).getUTCMonth() + 1}{longPeriod ? "" : `/${new Date(week.start + 9 * 3600000).getUTCDate()}`}</text><rect x={index * width + width * .1} y={20} width={width * .8} height={90} fill="transparent" /></g>;
        })}
      </svg></div>
      <label htmlFor={bucketId} className="activity-growth-selection block"><Text as="span" variant="label">{t("growth.chooseBucket")}</Text><Select id={bucketId} value={selectedTrend?.start ?? ""} onChange={(event) => setSelectedBucket(event.target.value ? Number(event.target.value) : null)}><option value="">{t("growth.clearBucket")}</option>{trend.map((bucket) => <option key={bucket.start} value={bucket.start}>{date(bucket.start)}–{date(bucket.end - 1)} · {t("growth.bucketCount", { count: bucket.sources.length })}</option>)}</Select></label>
      <Text as="p" variant="caption" tone="tertiary">{t(longPeriod ? "growth.monthlyTrendNote" : "growth.trendNote")} {t("growth.bucketHint")}</Text>
    </ChartFrame>}
    {selectedTrend && <Text as="p" variant="bodySmall">{date(selectedTrend.start)}–{date(selectedTrend.end - 1)} · {t("growth.bucketCount", { count: selectedTrend.sources.length })} <Button size="sm" variant="ghost" onClick={() => setSelectedBucket(null)}>{t("growth.clearBucket")}</Button></Text>}
    {canonicalEnabled && <TrainingPeriodZonesPanel response={canonical.response} />}
    <details key={selectedBucket ?? "all"} open={selectedTrend ? true : undefined} className="activity-growth-sources"><summary><Text variant="bodySmall" weight={600}>{t("growth.sourceActivities")}</Text></summary><Stack gap="var(--space-2)" className="pt-3">{sourceList.map((source) => <a key={source.id} className="activity-growth-source-link" href={`/activity/${encodeURIComponent(source.id)}`}><Text variant="bodySmall">{date(source.startTime)} · {source.description || source.type}</Text></a>)}</Stack></details>
  </div>;
}
function GrowthSections(props: ActivityGrowthPanelProps) {
  const { t } = useTranslation("activity");
  const sectionId = useId();
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [comparisonLoaded, setComparisonLoaded] = useState(false);
  const [statisticsLoaded, setStatisticsLoaded] = useState(false);
  const content = <Stack gap="var(--dim-section-gap)" className={props.embedded ? undefined : "activity-growth-content"}>
    <section className="activity-growth-section">
      <Text as="h3" variant="subtitle"><Button variant="ghost" size="sm" className="activity-growth-disclosure" trailingIcon={<ChevronDown />} aria-expanded={comparisonOpen} aria-controls={`${sectionId}-comparison`} onClick={() => { setComparisonLoaded(true); setComparisonOpen((open) => !open); }}>{t("growth.compare")}</Button></Text>
      <div id={`${sectionId}-comparison`} hidden={!comparisonOpen} className="pt-4">{comparisonLoaded && <Comparison activity={props.activity} metrics={props.metrics} />}</div>
    </section>
    <section className="activity-growth-section">
      <Text as="h3" variant="subtitle"><Button variant="ghost" size="sm" className="activity-growth-disclosure" trailingIcon={<ChevronDown />} aria-expanded={statisticsOpen} aria-controls={`${sectionId}-statistics`} onClick={() => { setStatisticsLoaded(true); setStatisticsOpen((open) => !open); }}>{t("growth.statistics")}</Button></Text>
      <div id={`${sectionId}-statistics`} hidden={!statisticsOpen} className="pt-4">{statisticsLoaded && <Statistics activity={props.activity} />}</div>
    </section>
  </Stack>;
  return <section aria-label={t("growth.title")} className="min-w-0">{props.embedded ? content : <Card padding="none" className="min-w-0">{content}</Card>}</section>;
}
export function ActivityGrowthPanel(props: ActivityGrowthPanelProps) {
  const { user } = useAuth();
  return props.isOwner && user?.uid === props.activity.userId
    ? <GrowthSections key={`${user.uid}:${props.activity.id}`} {...props} /> : null;
}
