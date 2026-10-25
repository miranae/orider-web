import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { useActivityMatchedRouteGroups } from "../../../hooks/useActivityMatchedRouteGroups";
import { useLocale } from "../../../contexts/LocaleContext";
import { getDiscipline } from "../../../utils/disciplineFilter";
import { Button, Select, Text } from "../../../theme";
import { matchedRoutePresentation } from "./matchedRouteGroupPresentation";
import "./activity-matched-route-group.css";
export default function ActivityMatchedRouteGroupPanel({ activity, observedMetricsIdentity }: { activity: Activity; observedMetricsIdentity: string }) {
  const { t, i18n } = useTranslation("activity"), { units, locale } = useLocale(), id = useId();
  const sport = getDiscipline(activity.type), discipline = sport === "run" || sport === "bike" ? sport : null;
  const [mode, setMode] = useState({ activityId: activity.id, observed: false });
  const observed = activity.source === "orider" && mode.activityId === activity.id && mode.observed;
  const head = JSON.stringify([activity.contentRevision, activity.contentSelectedRevision, activity.startTime, activity.endTime, activity.source, activity.deletedAt, observedMetricsIdentity]);
  const query = useActivityMatchedRouteGroups(activity.userId, activity.id, activity.deletedAt == null ? discipline : null, head, observed ? "observed_native" : "complete");
  const [filter, setFilter] = useState<{ token: string | null; year: number | null }>({ token: null, year: null });
  const latest = query.pages[query.pages.length - 1], summary = latest?.summary, year = filter.token === latest?.groupToken ? filter.year : null;
  // 후보 조회 전 anchor 경로가 부분 표본으로 제외된 응답만 구체적으로 설명한다.
  const partialAnchor = query.status === "unsupported" && latest?.state === "anchor_unsupported" && latest.groupToken === null
    && latest.coverage.indexCohort === "not_inspected" && latest.coverage.sourceValidation === "not_inspected" && latest.omittedCounts.partialGeometry === 1
    && Object.entries(latest.omittedCounts).every(([key, count]) => count === (key === "partialGeometry" ? 1 : 0));
  const data = matchedRoutePresentation(query.pages, discipline ?? "bike", units, year, i18n.language);
  const selectedSummary = year === null ? summary : summary?.years.find(value => value.year === year);
  const measured = data.points.filter(point => point.y !== null).sort((a, b) => a.y! - b.y!);
  const first = measured[0], last = measured[measured.length - 1], ticks = first ? first.y === last?.y ? [first] : [first, last!] : [];
  const date = (time: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
  if (!query.available) return null;
  return <section className="matched-route-group" aria-label={t(observed ? "routeGroup.observedTitle" : "routeGroup.title")}>
    <details><summary><Text variant="bodyMedium" weight={600}>{t(observed ? "routeGroup.observedTitle" : "routeGroup.title")}</Text></summary>
      <div className="matched-route-group-body">
        <Text as="p" variant="bodyMedium" tone="secondary">{t("routeGroup.scope")}</Text>
        {activity.source === "orider" && <label htmlFor={`${id}-mode`}><Text variant="bodyMedium">{t("routeGroup.mode")}</Text><Select id={`${id}-mode`} value={observed ? "observed_native" : "complete"} onChange={event => setMode({ activityId: activity.id, observed: event.target.value === "observed_native" })}><option value="complete">{t("routeGroup.completeMode")}</option><option value="observed_native">{t("routeGroup.observedTitle")}</option></Select></label>}
        {observed && <Text as="p" variant="bodyMedium" tone="secondary">{t("routeGroup.observedScope")}</Text>}
        <Button size="sm" variant="outline" loading={query.status === "loading"} disabled={query.status === "loading"} onClick={() => { setFilter({ token: null, year: null }); void query.start(); }}>{t(query.status === "idle" ? "routeGroup.find" : "routeGroup.refresh")}</Button>
        {query.status !== "idle" && <Text as="p" variant="bodyMedium" tone="secondary">{t(partialAnchor ? "routeGroup.partialGeometry" : `routeGroup.states.${query.status}`)}</Text>}
        {summary && <>
          <Text as="p" variant="bodyMedium" tone="secondary">{t(observed ? "routeGroup.observedCounts" : "routeGroup.counts", { loaded: data.allCount, total: summary.memberCount, known: summary.knownMetricCount, eligible: summary.rankEligibleCount })}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("routeGroup.snapshot", { date: date(latest!.readTime.seconds * 1000 + latest!.readTime.nanoseconds / 1e6) })}</Text>
          {summary.years.length > 1 && <label htmlFor={id}><Text variant="bodyMedium">{t("routeGroup.year")}</Text><Select id={id} value={year ?? ""} onChange={event => setFilter({ token: latest!.groupToken, year: event.target.value ? Number(event.target.value) : null })}><option value="">{t("routeGroup.allYears")}</option>{summary.years.map(value => <option key={value.year} value={value.year}>{value.year}</option>)}</Select></label>}
          {year !== null && selectedSummary && <Text as="p" variant="bodyMedium" tone="secondary">{t("routeGroup.yearCounts", { year, loaded: data.rows.length, total: selectedSummary.memberCount })}</Text>}
          {!observed && <>
          <Text as="h4" variant="bodyMedium" weight={600}>{t(discipline === "run" ? "routeGroup.pace" : "routeGroup.speed")}</Text>
          {data.known >= 2 ? <div className="matched-route-group-chart" role="img" aria-label={t("routeGroup.chart", { count: data.known })}>
            <div className="matched-route-group-value-axis">{ticks.map(point => <span key={point.row.activityId} style={{ top: `${point.y! / 150 * 100}%` }}>{point.formatted}</span>)}</div>
            <svg viewBox="0 0 360 150" aria-hidden="true"><line x1="20" y1="130" x2="340" y2="130" />{data.points.map(point => point.y !== null && <circle key={point.row.activityId} cx={point.x} cy={point.y} r="4" />)}</svg>
            <div className="matched-route-group-axis"><span>{date(data.rows[0]!.startTime)}</span><span>{date(data.rows[data.rows.length - 1]!.startTime)}</span></div>
          </div> : <Text as="p" variant="bodyMedium" tone="secondary">{first ? t("routeGroup.single", { date: date(first.row.startTime), value: first.formatted }) : t("routeGroup.noAverage")}</Text>}
          <Text as="p" variant="bodyMedium" tone="secondary">{t("routeGroup.averageBasis")}</Text>
          {selectedSummary?.trend.state === "insufficient" && <Text as="p" variant="bodyMedium" tone="secondary">{t("routeGroup.noTrend")}</Text>}
          </>}
          <ul>{data.points.map(point => <li key={point.row.activityId}>
            <a href={`/${locale}/activity/${encodeURIComponent(point.row.activityId)}`}><time dateTime={new Date(point.row.startTime).toISOString()}>{date(point.row.startTime)}</time><span>{point.formatted}</span><span>{point.row.isAnchor ? t("routeGroup.anchor") : ""}{!observed && selectedSummary?.fastestActivityIds.includes(point.row.activityId) ? ` · ${t("routeGroup.fastest")}` : ""}</span></a>
            <Text as="p" variant="bodyMedium" tone="secondary">{point.row.canonicalAverage.state === "available" ? t("routeGroup.computed", { date: date(point.row.canonicalAverage.computedAt) }) : t("routeGroup.missing")}{point.row.rankingExclusionReason ? ` · ${t(`routeGroup.exclusions.${point.row.rankingExclusionReason}`)}` : ""}</Text>
          </li>)}</ul>
          {latest?.nextCursor && <Button size="sm" variant="outline" disabled={query.status === "loading"} onClick={() => void query.loadMore()}>{t("routeGroup.more")}</Button>}
          {latest && (latest.coverage.indexCohort !== "exhausted" || latest.coverage.sourceValidation !== "complete_in_cohort") && <Text as="p" variant="bodyMedium" tone="secondary">{t("routeGroup.partial")}</Text>}
          <Text as="p" variant="bodyMedium" tone="secondary">{t("routeGroup.quality")}</Text>
        </>}
      </div>
    </details>
  </section>;
}
