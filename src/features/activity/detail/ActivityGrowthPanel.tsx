import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { useLocale } from "../../../contexts/LocaleContext";
import { useAuth } from "../../../contexts/AuthContext";
import { useActivityGrowthHistory } from "../../../hooks/useActivityGrowthHistory";
import { useActivityMetrics } from "../../../hooks/useActivityMetrics";
import { Button, Card, ChartFrame, Select, Stack, Stat, Text } from "../../../theme";
import "./activity-growth-panel.css";
import { getDiscipline } from "../../../utils/disciplineFilter";
import { activityPeriods, comparableCurves, comparisonRows, sameActivitySport, settledMetrics, summarizePeriod } from "./activityGrowth";
import { hrZoneDistribution, powerZoneDistribution, type MetricsLike } from "./metricsPresentation";

export interface ActivityGrowthPanelProps { activity: Activity; metrics: MetricsLike | null; isOwner: boolean; embedded?: boolean }
function number(value: number | null, digits = 1): string {
  return value == null ? "—" : value.toFixed(digits);
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
  const candidates = history.activities.filter((candidate) => candidate.userId === user?.uid && candidate.id !== activity.id
    && candidate.startTime < activity.startTime && sameActivitySport(activity, candidate));
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  const baseline = useActivityMetrics(selected?.id ?? null);
  const running = getDiscipline(activity.type) === "run";
  const convert = (value: number | null, key: string) => value == null ? null : value * (key === "distanceKm" || (key === "avgSpeedKph" && !running) ? distanceFactor : key === "elevationGainM" ? elevationFactor : key === "avgSpeedKph" && running ? 1 / distanceFactor : 1);
  const format = (raw: number | null, key: string) => { const value = convert(raw, key); return key === "avgSpeedKph" && running ? pace(value)
    : number(value, ["avgHr", "avgPower", "np", "elevationGainM", "movingTimeSec"].includes(key) ? 0 : 1); };
  const unit = (key: string) => key === "avgSpeedKph" ? running ? units === "imperial" ? "/mi" : "/km" : units === "imperial" ? "mph" : "km/h"
    : ({ distanceKm: units === "imperial" ? "mi" : "km", movingTimeSec: "s", avgHr: "bpm", avgPower: "W", np: "W", elevationGainM: units === "imperial" ? "ft" : "m" }[key] ?? "");
  const date = (time: number) => new Date(time).toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" });
  const powerLabel = (source: MetricsLike | null) => source?.isVirtualPower === true ? t("growth.virtualPower")
    : source?.isVirtualPower === false ? t("growth.measuredPower") : t("growth.powerUnknown");
  return <div className="space-y-4">
    <Text as="p" variant="bodySmall" tone="secondary">{t("growth.conditions")}</Text>
    <label className="block space-y-2 activity-growth-selection">
      <Text variant="label">{t("growth.choose")}</Text>
      <Select className="w-full min-w-0" value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
        <option value="">{t("growth.none")}</option>
        {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{date(candidate.startTime)} · {candidate.description || candidate.type}</option>)}
      </Select>
    </label>
    {history.loading && <Text as="p">{t("growth.loading")}</Text>}
    {history.error && <Button size="sm" onClick={history.retry}>{t("growth.retry")}</Button>}
    {!history.loading && !history.error && candidates.length === 0 && <Text as="p">{t("growth.noPrevious")}</Text>}
    {history.hasMore && <Button size="sm" variant="outline" loading={history.loadingMore} onClick={history.loadMore}>{t("growth.loadMore")}</Button>}
    {selected && <>
      <Button size="sm" variant="ghost" onClick={() => setSelectedId("")}>{t("growth.clear")}</Button>
      {baseline.status === "loading" && <Text as="p">{t("growth.loading")}</Text>}
      {baseline.status === "stale" && <Text as="p" tone="warning">{t("growth.stale")}</Text>}
      {!baseline.metrics && baseline.status !== "loading" && <Text as="p">{t("growth.metricsMissing")}</Text>}
      <div className="activity-growth-table-shell">
        <table className="activity-growth-table">
          <thead><tr><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.metric")}</Text></th><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.current")}</Text></th><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{date(selected.startTime)}</Text></th></tr></thead>
          <tbody>{comparisonRows(metrics, baseline.metrics, running).map((row) => <tr key={row.key}>
            <th scope="row"><Text variant="bodySmall" tone="secondary">{t(`growth.metrics.${row.key === "avgSpeedKph" && running ? "pace" : row.key}`)} · {unit(row.key)}</Text></th>
            <td><Text variant="bodyMedium" mono tone="primary">{format(row.value, row.key)}</Text>{row.delta != null && <Text as="p" variant="caption" tone="tertiary">{t("growth.change")} {row.delta > 0 ? "+" : ""}{number(convert(row.delta, row.key), 1)} {row.key === "avgSpeedKph" && running ? units === "imperial" ? "s/mi" : "s/km" : unit(row.key)}</Text>}</td>
            <td><Text variant="bodyMedium" mono tone="secondary">{format(row.baseline, row.key)}</Text></td>
          </tr>)}</tbody>
        </table>
      </div>
      <Text as="p" variant="caption" tone="tertiary">{t("growth.current")}: {powerLabel(metrics)} · {t("growth.previous")}: {powerLabel(baseline.metrics)}</Text>
      {metrics && baseline.metrics && settledMetrics(metrics) && settledMetrics(baseline.metrics) && <>
        {[false, true].map((power) => {
          const points = comparableCurves(metrics, baseline.metrics!, power);
          return points.length > 0 && <section key={String(power)} className="space-y-3"><Text as="h4" variant="bodySmall" weight={600} tone="secondary">{t(power ? "growth.powerCurve" : running ? "growth.paceCurve" : "growth.speedCurve")}</Text>
            <div className="activity-growth-table-shell"><table className="activity-growth-table"><thead><tr><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.metric")}</Text></th><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.current")}</Text></th><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.previous")}</Text></th></tr></thead><tbody>{points.map((point) => <tr key={point.duration}><th scope="row"><Text variant="bodySmall">{point.duration}s</Text></th><td><Text variant="bodySmall" mono tone="primary">{(power ? number(point.value) : running ? pace(point.value > 0 ? 3600 / point.value / distanceFactor : null) : number(point.value * distanceFactor))} {power ? "W" : running ? units === "imperial" ? "/mi" : "/km" : units === "imperial" ? "mph" : "km/h"}</Text></td><td><Text variant="bodySmall" mono tone="secondary">{(power ? number(point.baseline) : running ? pace(point.baseline > 0 ? 3600 / point.baseline / distanceFactor : null) : number(point.baseline * distanceFactor))} {power ? "W" : running ? units === "imperial" ? "/mi" : "/km" : units === "imperial" ? "mph" : "km/h"}</Text></td></tr>)}</tbody></table></div>
          </section>;
        })}
        {[false, true].map((power) => {
          const currentZones = power ? powerZoneDistribution(metrics) : hrZoneDistribution(metrics);
          const previousZones = power ? powerZoneDistribution(baseline.metrics!) : hrZoneDistribution(baseline.metrics!);
          return currentZones && previousZones && <section key={String(power)} className="space-y-3"><Text as="h4" variant="bodySmall" weight={600} tone="secondary">{t(power ? "growth.powerZones" : "growth.hrZones")}</Text><Text as="p" variant="caption" tone="tertiary">{t("growth.zoneNote")}</Text>
            <div className="activity-growth-table-shell"><table className="activity-growth-table"><thead><tr><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.metric")}</Text></th><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.current")}</Text></th><th scope="col"><Text variant="bodySmall" weight={600} tone="secondary">{t("growth.previous")}</Text></th></tr></thead><tbody>{currentZones.map((zone) => <tr key={zone.zone}><th scope="row"><Text variant="bodySmall">Z{zone.zone}</Text></th><td><Text variant="bodySmall" mono tone="primary">{number(zone.percentage)}%</Text></td><td><Text variant="bodySmall" mono tone="secondary">{number(previousZones.find((z) => z.zone === zone.zone)?.percentage ?? null)}%</Text></td></tr>)}</tbody></table></div>
          </section>;
        })}
      </>}
    </>}
  </div>;
}
function Statistics({ activity }: { activity: Activity }) {
  const { units } = useLocale();
  const { t, i18n } = useTranslation("activity");
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [now] = useState(() => new Date());
  const stats = useActivityGrowthHistory("statistics", now.getTime());
  const boundaries = activityPeriods(now.getTime(), period);
  const sources = stats.sourceActivities.filter((candidate) => sameActivitySport(activity, candidate));
  const complete = stats.coverage === "ready";
  const current = summarizePeriod(sources, boundaries.start, boundaries.end, complete);
  const previous = summarizePeriod(sources, boundaries.previousStart, boundaries.previousEnd, complete);
  const weekStart = activityPeriods(now.getTime(), "week").start;
  const trend = Array.from({ length: 6 }, (_, index) => {
    const start = weekStart - (5 - index) * 7 * 86400000;
    return { start, ...summarizePeriod(sources, start, Math.min(start + 7 * 86400000, now.getTime() + 1), complete) };
  });
  const distanceScale = units === "imperial" ? 1609.344 : 1000;
  const chartMax = Math.max(1, ...trend.map((week) => (week.distance ?? 0) / distanceScale));
  const date = (time: number) => new Date(time).toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" });
  return <div className="space-y-4">
    <Stack direction="row" wrap gap="var(--space-2)">{(["week", "month"] as const).map((value) => <Button size="sm" key={value} variant={period === value ? "secondary" : "ghost"} onClick={() => setPeriod(value)} aria-pressed={period === value}>{t(`growth.${value}`)}</Button>)}</Stack>
    <Text as="p" variant="bodySmall" tone="secondary">{t("growth.periodNote")} · {date(boundaries.start)}–{date(now.getTime())} / {date(boundaries.previousStart)}–{date(boundaries.previousEnd - 1)}</Text>
    {stats.coverage === "loading" && <Text as="p">{t("growth.loading")}</Text>}
    {stats.error && <Button size="sm" onClick={stats.retry}>{t("growth.retry")}</Button>}
    {!complete && stats.coverage !== "loading" && <Text as="p" tone="warning">{t("growth.partial", { count: sources.length })}</Text>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--dim-section-gap)]">
      {(["count", "distance", "movingTime", "elevation"] as const).map((key) => {
        const scale = key === "distance" ? units === "imperial" ? 1609.344 : 1000 : key === "movingTime" ? 3600 : key === "elevation" && units === "imperial" ? 0.3048 : 1;
        const a = current[key] == null ? null : current[key]! / scale;
        const b = previous[key] == null ? null : previous[key]! / scale;
        const digits = key === "count" || key === "elevation" ? 0 : 1;
        return <Stack key={key} gap="var(--dim-item-gap)" className="min-w-0">
          <Stat compact label={t(`growth.stats.${key}`, { unit: key === "distance" ? units === "imperial" ? "mi" : "km" : units === "imperial" ? "ft" : "m" })} value={number(a, digits)} />
          <Text as="p" variant="caption" tone="tertiary">{t("growth.previousPeriod")} <Text mono>{number(b, digits)}</Text>{a != null && b != null && <> · {t("growth.change")} <Text mono>{a - b > 0 ? "+" : ""}{number(a - b)}</Text></>}</Text>
        </Stack>;
      })}
    </div>
    <Text as="p" variant="caption" tone="tertiary">{t("growth.missingNote")}</Text>
    {complete && trend.every((week) => week.distance != null) && <ChartFrame variant="embedded" header={<Text as="h4" variant="subtitle">{t("growth.weeklyTrend", { unit: units === "imperial" ? "mi" : "km" })}</Text>}>
      <svg className="activity-growth-trend" viewBox="0 0 360 130" role="img" aria-label={t("growth.weeklyTrend", { unit: units === "imperial" ? "mi" : "km" })}>
        {trend.map((week, index) => {
          const value = week.distance! / distanceScale;
          const height = value / chartMax * 75;
          return <g key={week.start}><rect x={index * 60 + 12} y={100 - height} width={36} height={height} fill="var(--accent)" /><text x={index * 60 + 30} y={90 - height} textAnchor="middle" fill="var(--chart-grid-label)">{number(value)}</text><text x={index * 60 + 30} y={120} textAnchor="middle" fill="var(--chart-grid-label)">{new Date(week.start + 9 * 3600000).getUTCMonth() + 1}/{new Date(week.start + 9 * 3600000).getUTCDate()}</text></g>;
        })}
      </svg>
      <Text as="p" variant="caption" tone="tertiary">{t("growth.trendNote")}</Text>
    </ChartFrame>}
    <details className="activity-growth-sources"><summary><Text variant="bodySmall" weight={600}>{t("growth.sourceActivities")}</Text></summary><Stack gap="var(--space-2)" className="pt-3">{[...current.sources, ...previous.sources].map((source) => <a key={source.id} className="activity-growth-source-link" href={`/activity/${encodeURIComponent(source.id)}`}><Text variant="bodySmall">{date(source.startTime)} · {source.description || source.type}</Text></a>)}</Stack></details>
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
