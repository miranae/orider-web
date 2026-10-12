import CyclingDistanceCoveredRankingsPanel from "./CyclingDistanceCoveredRankingsPanel";
import { stageCyclingPreferenceAvailable } from "../../../services/stageCyclingDistanceEffortPreference";
import "./cycling-distance-history.css";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { BIKE_DISTANCE_M, BIKE_DISTANCE_TARGETS, type BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { CyclingDistanceHistoryRequest, CyclingDistanceHistoryRow } from "@shared/types/training-cycling-distance-history";
import { useLocale } from "../../../contexts/LocaleContext";
import { useCyclingDistanceHistory } from "../../../hooks/useCyclingDistanceHistory";
import { Button, ChartFrame, Select, Stack, Text } from "../../../theme";
import { formatDistance } from "../../../utils/units";
import { cyclingHistoryTimeMs } from "../../../services/trainingCyclingDistanceHistory";
import { cyclingDistanceHistory, cyclingDistanceHistoryLeaders, cyclingDistanceHistoryTrend, cyclingHistoryTotalLeaders, cyclingHistoryValueText, type CyclingHistoryTotalBasis, type CyclingHistoryTotalMetric } from "./cyclingDistanceHistory";

/** 저장 분석 이력만 수동 확인한다. 원본 다운로드나 현재 활동의 지표 구독을 만들지 않는다. */
export default function CyclingDistanceHistoryPanel({ activity, selection }: { activity: Activity; selection: CyclingDistanceHistoryRequest }) {
  const { t, i18n } = useTranslation("activity"), { locale, units } = useLocale();
  const id = useId(), [open, setOpen] = useState(false), [distance, setDistance] = useState<BikeDistanceKey>("10km");
  const [category, setCategory] = useState<"effort" | CyclingHistoryTotalMetric>("effort"), [basis, setBasis] = useState<CyclingHistoryTotalBasis>("canonical_metrics");
  const headIdentity = JSON.stringify([activity.userId, activity.type, activity.startTime, activity.endTime, activity.deletedAt, activity.contentRevision, activity.contentSelectedRevision, activity.source, activity.localSessionId, activity.stravaActivityId, activity.stravaTwinActivityId]);
  const history = useCyclingDistanceHistory(activity.userId, activity.id, activity.deletedAt == null ? { ...selection, includeActivityTotals: true } : null, headIdentity);
  const summary = useMemo(() => cyclingDistanceHistory(history.pages), [history.pages]);
  const limit = selection.rangeBasis === "calendar_year" ? 5 : 10;
  const leaders = useMemo(() => cyclingDistanceHistoryLeaders(summary, distance, limit), [summary, distance, limit]);
  const totals = useMemo(() => cyclingHistoryTotalLeaders(summary, category === "effort" ? "distanceM" : category, basis, limit), [summary, category, basis, limit]);
  const chartSources = useMemo<Array<CyclingDistanceHistoryRow & { chartValue: number; canonicalActivityId: string }>>(() => category === "effort" ? leaders.allSources.map(source => ({ ...source, chartValue: source.elapsedSec })) : totals.allSources.map(source => ({ ...source, chartValue: source.value })), [category, leaders, totals]);
  const trend = useMemo(() => cyclingDistanceHistoryTrend(chartSources, source => source.chartValue), [chartSources]);
  const first = history.pages[0];
  const identity = JSON.stringify([activity.id, selection, first?.readTime, distance, category, basis]);
  const [leaderReveal, setLeaderReveal] = useState<{ identity: string; count: number } | null>(null);
  const [sourceReveal, setSourceReveal] = useState<{ identity: string; count: number } | null>(null);
  const visibleLeaders = leaderReveal?.identity === identity ? leaderReveal.count : 3;
  const sourceIdentity = JSON.stringify([activity.id, selection, first?.readTime]);
  const visibleSources = sourceReveal?.identity === sourceIdentity ? sourceReveal.count : 50;
  const [openedSources, setOpenedSources] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<{ identity: string; activityId: string } | null>(null);
  const foundIndex = selectedSource?.identity === identity ? trend.points.findIndex(point => point.source.activityId === selectedSource.activityId) : -1;
  const selectedIndex = foundIndex < 0 ? trend.points.length - 1 : foundIndex, selectedPoint = trend.points[selectedIndex];
  const effortProvenance = (row: CyclingDistanceHistoryRow) => t("cyclingDistanceHistory.provenance", {
    source: t(`manualBikeEvidence.declaredSources.${row.distanceObservations.provenance?.declaredActivitySource ?? "unknown"}`),
    status: t(`cyclingDistanceHistory.provenanceStatuses.${row.distanceObservations.provenance?.status ?? "legacy_normalized"}`),
  });
  const chooseSource = (index: number) => { const point = trend.points[index]; if (point) setSelectedSource({ identity, activityId: point.source.activityId }); };
  const sourceKeys = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = event.key === "ArrowLeft" ? Math.max(0, selectedIndex - 1) : event.key === "ArrowRight" ? Math.min(trend.points.length - 1, selectedIndex + 1) : event.key === "Home" ? 0 : event.key === "End" ? trend.points.length - 1 : null;
    if (index !== null) { event.preventDefault(); chooseSource(index); }
  };
  if (!history.available) return null;
  const date = (value: number, full = false) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit", ...(full ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(value);
  const valueText = (value: number) => cyclingHistoryValueText(value, category === "effort" ? "elapsed" : category, units);
  const ranked = category === "effort" ? leaders.sources.map(source => ({ ...source, chartValue: source.elapsedSec })) : totals.sources.map(source => ({ ...source, chartValue: source.value }));
  const scatter = trend.points.map(point => `M${point.x},${point.y}m-3,0a3,3 0 1,0 6,0a3,3 0 1,0 -6,0z`).join(" ");
  const control = "min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]";
  return <details className="cycling-distance-history border-t border-[var(--line-soft)]" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={`cursor-pointer py-3 ${control}`}><Text as="span" variant="bodyMedium" weight={600}>{t(selection.rangeBasis === "calendar_year" ? "cyclingDistanceHistory.yearTitle" : "cyclingDistanceHistory.rangeTitle", { year: selection.rangeBasis === "calendar_year" ? selection.year : "" })}</Text></summary>
    {open && <Stack gap="var(--space-3)">
      {stageCyclingPreferenceAvailable() && <CyclingDistanceCoveredRankingsPanel activity={activity} selection={selection} headIdentity={headIdentity} />}
      <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.scope")}</Text>
      {history.status === "idle" && <Button className={control} size="sm" onClick={() => void history.start()}>{t("cyclingDistanceHistory.start")}</Button>}
      {history.status === "loading" && <Button className={control} size="sm" disabled loading>{t("cyclingDistanceHistory.loading")}</Button>}
      {history.status === "partial" && <><Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.partial")}</Text><Button className={control} size="sm" onClick={() => void history.loadMore()}>{t("cyclingDistanceHistory.more")}</Button></>}
      {history.status === "complete" && <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.complete")}</Text>}
      {history.status === "capped" && <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.capped")}</Text>}
      {history.status === "error" && <><Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.error")}</Text><Button className={control} size="sm" onClick={() => void (first ? history.loadMore() : history.start())}>{t("cyclingDistanceHistory.retry")}</Button></>}
      {(history.status === "expired" || history.status === "invalidated") && <><Text as="p" variant="bodyMedium" tone="secondary">{t(`cyclingDistanceHistory.${history.status}`)}</Text><Button className={control} size="sm" onClick={() => void history.restart()}>{t("cyclingDistanceHistory.restart")}</Button></>}
      {history.status === "unsupported" && <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.unsupported")}</Text>}
      {first && <>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.snapshot", { from: date(first.range.fromInclusive), to: date(Math.max(first.range.fromInclusive, first.range.toExclusive - 1)), asOf: date(cyclingHistoryTimeMs(first.readTime), true) })}</Text>
        <Text as="p" variant="bodyMedium">{t("cyclingDistanceHistory.counts", { scanned: summary.scanned, candidates: summary.candidateCount, groups: summary.groups.length, duplicates: summary.duplicateCount, skipped: summary.skipped })}</Text>
        <label htmlFor={`${id}-category`}><Text as="span" variant="bodyMedium">{t("cyclingDistanceHistory.category")}</Text><Select className={control} id={`${id}-category`} value={category} onChange={event => setCategory(event.target.value as typeof category)}>{(["effort", "distanceM", "elevationGainM"] as const).map(key => <option key={key} value={key}>{t(`cyclingDistanceHistory.categories.${key}`)}</option>)}</Select></label>
        {category === "effort" ? <label htmlFor={id}><Text as="span" variant="bodyMedium">{t("cyclingDistanceHistory.distance")}</Text><Select className={control} id={id} value={distance} onChange={event => setDistance(event.target.value as BikeDistanceKey)}>{BIKE_DISTANCE_TARGETS.map(key => <option key={key} value={key}>{t(`manualBikeEvidence.distances.${key}`)}</option>)}</Select></label>
          : <label htmlFor={`${id}-basis`}><Text as="span" variant="bodyMedium">{t("cyclingDistanceHistory.basisSelect")}</Text><Select className={control} id={`${id}-basis`} value={basis} onChange={event => setBasis(event.target.value as CyclingHistoryTotalBasis)}>{(["canonical_metrics", "activity_summary"] as const).map(key => <option key={key} value={key}>{t(`cyclingDistanceHistory.bases.${key}`)}</option>)}</Select></label>}
        <Text as="h4" variant="bodyMedium" weight={600}>{category === "effort" ? t("cyclingDistanceHistory.leaders", { count: limit, distance: formatDistance(BIKE_DISTANCE_M[distance], units) }) : t("cyclingDistanceHistory.totalLeaders", { count: limit, metric: t(`cyclingDistanceHistory.categories.${category}`) })}</Text>
        <Text as="p" variant="bodyMedium" tone="secondary">{t(category === "effort" ? "cyclingDistanceHistory.coverage" : "cyclingDistanceHistory.totalCoverage", category === "effort" ? leaders : totals)}</Text>
        {(category === "effort" ? leaders : totals).underlyingSourceCount > 0 && <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.underlyingSource")}</Text>}
        {selectedPoint && <ChartFrame className="cycling-distance-history-trend" variant="embedded" header={<Text variant="bodyMedium" weight={600}>{t("cyclingDistanceHistory.trendTitle")}</Text>}>
          <Text as="p" variant="bodyMedium" tone="secondary">{valueText(trend.minimum!)}–{valueText(trend.maximum!)} · {t(category === "effort" ? "cyclingDistanceHistory.shorter" : "cyclingDistanceHistory.larger")}</Text>
          <svg className="cycling-distance-history-scatter" viewBox="0 0 420 160" role="img" aria-label={t("cyclingDistanceHistory.trendTitle")} aria-describedby={`${id}-trend-note`}>
            <line x1={65} x2={385} y1={135} y2={135} stroke="var(--line-soft)" />
            <path data-observation-count={trend.points.length} d={scatter} fill="var(--ink-2)" />
            <circle data-source-id={selectedPoint.source.activityId} cx={selectedPoint.x} cy={selectedPoint.y} r={5} fill="var(--ink-0)" />
          </svg>
          <div className="cycling-distance-history-axis"><Text variant="bodyMedium">{date(trend.points[0]!.source.startTime)}</Text><Text variant="bodyMedium">{date(trend.points[trend.points.length - 1]!.source.startTime)}</Text></div>
          <Text as="p" id={`${id}-trend-note`} variant="bodyMedium" tone="secondary">{t(category === "effort" ? "cyclingDistanceHistory.trendNote" : "cyclingDistanceHistory.totalTrendNote", { count: trend.points.length })}</Text>
          <Text as="p" variant="bodyMedium" role="status" aria-live="polite" aria-atomic="true">{t("cyclingDistanceHistory.selectedSource", { index: selectedIndex + 1, total: trend.points.length })} · {valueText(selectedPoint.value)}</Text>
          <a className="activity-growth-source-link text-[length:var(--fs-md)]" data-selected-source href={`/${locale}/activity/${encodeURIComponent(selectedPoint.source.activityId)}`}><time dateTime={new Date(selectedPoint.source.startTime).toISOString()}>{date(selectedPoint.source.startTime, true)}</time>{" "}<span>·{"\u00a0"}{category === "effort" ? effortProvenance(selectedPoint.source) : selectedPoint.source.representativeInput.source ?? t("cyclingDistanceHistory.unknownSource")}</span></a>
          <Stack direction="row" wrap gap="var(--space-2)"><Button className={control} variant="outline" size="sm" disabled={selectedIndex <= 0} onKeyDown={sourceKeys} onClick={() => chooseSource(selectedIndex - 1)}>{t("cyclingDistanceHistory.previousSource")}</Button><Button className={control} variant="outline" size="sm" disabled={selectedIndex >= trend.points.length - 1} onKeyDown={sourceKeys} onClick={() => chooseSource(selectedIndex + 1)}>{t("cyclingDistanceHistory.nextSource")}</Button></Stack>
        </ChartFrame>}
        {ranked.length ? <><ul className="space-y-2">{ranked.slice(0, visibleLeaders).map((row, index) => <li key={row.activityId} data-activity-revision={row.activityRevision} data-metrics-revision={row.metricsRevision}>
          <Text as="p" variant="bodyMedium" weight={600}>{index + 1} · {valueText(row.chartValue)}</Text>
          <a className="activity-growth-source-link text-[length:var(--fs-md)]" href={`/${locale}/activity/${encodeURIComponent(row.activityId)}`}>{date(row.startTime)} · {category === "effort" ? effortProvenance(row) : row.representativeInput.source ?? t("cyclingDistanceHistory.unknownSource")}</a>
        </li>)}</ul>{ranked.length > visibleLeaders && <Button className={control} size="sm" variant="outline" onClick={() => setLeaderReveal({ identity, count: limit })}>{t("cyclingDistanceHistory.showLeaders", { count: Math.min(limit, ranked.length) })}</Button>}</>
          : <Text as="p" variant="bodyMedium" tone="secondary">{t(category !== "effort" ? "cyclingDistanceHistory.totalsUnknown" : leaders.unsupported + leaders.unavailable > 0 ? "cyclingDistanceHistory.unknown" : "cyclingDistanceHistory.noObserved")}</Text>}
        <details key={sourceIdentity} className="activity-growth-sources" onToggle={event => setOpenedSources(event.currentTarget.open ? sourceIdentity : null)}><summary><Text variant="bodyMedium">{t("cyclingDistanceHistory.sources", { count: summary.rows.length })}</Text></summary>{openedSources === sourceIdentity && <Stack gap="var(--space-2)">
          <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.sourceStates", summary.states)}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.visibleSources", { shown: Math.min(visibleSources, summary.rows.length), total: summary.rows.length })}</Text>
          {summary.rows.slice(0, visibleSources).map(row => <a key={row.activityId} className="activity-growth-source-link text-[length:var(--fs-md)]" href={`/${locale}/activity/${encodeURIComponent(row.activityId)}`}>{date(row.startTime)} · {row.representativeInput.source ?? t("cyclingDistanceHistory.unknownSource")} · {t(`cyclingDistanceHistory.states.${row.analysis.state}`)}</a>)}
          {visibleSources < summary.rows.length && <Button className={control} size="sm" variant="outline" onClick={() => setSourceReveal({ identity: sourceIdentity, count: visibleSources + 50 })}>{t("cyclingDistanceHistory.moreSources")}</Button>}
        </Stack>}</details>
        <Text as="p" variant="bodyMedium" tone="secondary">{t(category === "effort" ? "cyclingDistanceHistory.basis" : "cyclingDistanceHistory.totalsBasis")}</Text>
      </>}
    </Stack>}
  </details>;
}
