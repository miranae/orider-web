import { useLocation } from "react-router-dom";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useRouteHistoryControls } from "../../../hooks/useRouteHistoryControls";
import ActivityRouteInventoryPanel from "./ActivityRouteInventoryPanel";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { useActivityRouteIndexHistory } from "../../../hooks/useActivityRouteIndexHistory";
import { useLocale } from "../../../contexts/LocaleContext";
import { getDiscipline } from "../../../utils/disciplineFilter";
import { Button, Select, Text } from "../../../theme";
import { routeIndexHistory } from "./activityRouteIndexHistory";
import "./activity-route-index-history.css";
import ActivityMatchedRouteGroupPanel from "./ActivityMatchedRouteGroupPanel";
export default function ActivityRouteIndexHistoryPanel({ activity, observedMetricsIdentity }: { activity: Activity; observedMetricsIdentity: string }) {
  const { t, i18n } = useTranslation("activity"), { units } = useLocale(), id = useId(), location = useLocation();
  const sport = getDiscipline(activity.type), discipline = sport === "run" || sport === "bike" ? sport : null;
  const headIdentity = JSON.stringify([(activity as Activity & { activityRevision?: string }).activityRevision, (activity as Activity & { sourceRevision?: string }).sourceRevision, (activity as Activity & { sourceContentDigest?: string }).sourceContentDigest, activity.contentRevision, activity.contentSelectedRevision, activity.startTime, activity.endTime,
    activity.source, activity.deletedAt, observedMetricsIdentity]);
  const query = useActivityRouteIndexHistory(activity.userId, activity.id, activity.deletedAt == null ? discipline : null, headIdentity);
  const [controls, setControls] = useRouteHistoryControls(activity.userId, activity.id, "index");
  const year = controls.year, [shown, setShown] = useState(5);
  // 받은 결과에만 적용하는 표시 필터다. 원본이나 활동 목록을 조회하지 않는다.
  const data = routeIndexHistory(query.pages, discipline ?? "bike", units, year, i18n.language);
  const latest = query.pages[query.pages.length - 1];
  const measured = data.points.filter(point => point.y !== null).sort((a, b) => a.y! - b.y!);
  const firstTick = measured[0], lastTick = measured[measured.length - 1];
  const ticks = firstTick ? firstTick.y === lastTick?.y ? [firstTick] : [firstTick, lastTick!] : [];
  const date = (time: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
  if (!query.available) return null;
  return <><ActivityRouteInventoryPanel activity={activity} observedMetricsIdentity={observedMetricsIdentity} /><ActivityMatchedRouteGroupPanel activity={activity} observedMetricsIdentity={observedMetricsIdentity} /><section className="route-index-history" aria-label={t("routeIndexHistory.title")}>
    <details open={controls.open} onToggle={event => { const open = event.currentTarget.open; if (open !== controls.open) setControls(value => ({ ...value, open })); }}>
      <summary><Text variant="bodyMedium" weight={600}>{t("routeIndexHistory.title")}</Text></summary>
      <div className="route-index-history-body">
        <Text as="p" variant="bodyMedium" tone="secondary">{t("routeIndexHistory.scope")}</Text>
        <Button size="sm" variant="outline" disabled={query.status === "loading"} loading={query.status === "loading"}
          onClick={() => { setShown(5); void query.start(); }}>{t(query.status === "idle" ? "routeIndexHistory.find" : "routeIndexHistory.restart")}</Button>
        {query.status !== "idle" && <Text as="p" variant="bodyMedium" tone="secondary">{t(`routeIndexHistory.states.${query.status}`)}</Text>}
        {query.pages.length > 0 && <>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("routeIndexHistory.counts", { scanned: data.scanned, count: data.allCount })}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("routeIndexHistory.snapshot", { date: date(latest!.readTime.seconds * 1000 + latest!.readTime.nanoseconds / 1e6) })}</Text>
          {(data.years.length > 1 || year !== null) && <label htmlFor={id}><Text variant="bodyMedium">{t("routeIndexHistory.year")}</Text><Select id={id} value={year ?? ""} onChange={event => { setControls(value => ({ ...value, year: event.target.value ? Number(event.target.value) : null })); setShown(5); }}><option value="">{t("routeIndexHistory.allYears")}</option>{year !== null && !data.years.includes(year) && <option value={year}>{year}</option>}{data.years.map(value => <option key={value} value={value}>{value}</option>)}</Select></label>}
          {data.rows.length > 0 ? <>
            <Text as="h4" variant="bodyMedium" weight={600}>{t(discipline === "run" ? "routeIndexHistory.pace" : "routeIndexHistory.speed")}</Text>
            {data.known >= 2 ? <div className="route-index-history-chart" role="img" aria-label={t("routeIndexHistory.chart", { known: data.known, count: data.rows.length })}>
              <div className="route-index-history-value-axis">{ticks.map(point => <span key={point.row.activityId} style={{ top: `${point.y! / 150 * 100}%` }}>{point.formatted}</span>)}</div>
              <svg viewBox="0 0 360 150" aria-hidden="true"><line x1="20" y1="130" x2="340" y2="130" />{data.points.map(point => point.y !== null && <circle key={point.row.activityId} cx={point.x} cy={point.y} r="4" />)}</svg>
              <div className="route-index-history-axis"><span>{date(data.rows[0]!.startTime)}</span><span>{data.rows.length > 1 ? date(data.rows[data.rows.length - 1]!.startTime) : ""}</span></div>
            </div> : <Text as="p" variant="bodyMedium" tone="secondary">{firstTick ? t("routeIndexHistory.singleAverage", { date: date(firstTick.row.startTime), value: firstTick.formatted }) : t("routeIndexHistory.noAverage")}</Text>}
            <Text as="p" variant="bodyMedium" tone="secondary">{t("routeIndexHistory.averageNote")}</Text>
            <ul>{data.points.slice(0, shown).map(point => <li key={point.row.activityId}>
              <LocalizedLink to={`/activity/${encodeURIComponent(point.row.activityId)}`} state={{ routeInventoryReturn: { uid: activity.userId, pathname: location.pathname, search: location.search, hash: location.hash } }}><time dateTime={new Date(point.row.startTime).toISOString()}>{date(point.row.startTime)}</time><span>{point.formatted}</span></LocalizedLink>
              <Text as="p" variant="bodyMedium" tone="secondary">{point.row.canonicalAverage.state === "available" ? t("routeIndexHistory.computed", { date: date(point.row.canonicalAverage.computedAt) }) : t("routeIndexHistory.averageMissing")}{point.row.canonicalAverage.state === "available" && point.row.canonicalAverage.inputCoverage === "partial_terminal" ? ` · ${t("routeIndexHistory.partialAverage")}` : ""}</Text>
            </li>)}</ul>
            {shown < data.rows.length && <Button size="sm" variant="ghost" onClick={() => setShown(value => value + 5)}>{t("routeIndexHistory.showSources", { shown: Math.min(shown, data.rows.length), count: data.rows.length })}</Button>}
          </> : <Text as="p" variant="bodyMedium" tone="secondary">{t("routeIndexHistory.emptyPage")}</Text>}
          {latest?.nextCursor && query.status !== "loading" && <Button size="sm" variant="outline" onClick={() => void query.loadMore()}>{t("routeIndexHistory.more")}</Button>}
          <Text as="p" variant="bodyMedium" tone="secondary">{t("routeIndexHistory.quality")}</Text>
        </>}
      </div>
    </details>
  </section></>;
}
