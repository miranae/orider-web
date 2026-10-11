import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { BIKE_DISTANCE_M, BIKE_DISTANCE_TARGETS, type BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { CyclingDistanceHistoryRequest } from "@shared/types/training-cycling-distance-history";
import { useLocale } from "../../../contexts/LocaleContext";
import { useCyclingDistanceHistory } from "../../../hooks/useCyclingDistanceHistory";
import { Button, Select, Stack, Text } from "../../../theme";
import { formatDistance } from "../../../utils/units";
import { cyclingHistoryTimeMs } from "../../../services/trainingCyclingDistanceHistory";
import { cyclingDistanceHistory, cyclingDistanceHistoryLeaders } from "./cyclingDistanceHistory";
import { formatElapsedBoundary } from "./activityRangeSelection";

/** 저장 분석 이력만 수동 확인한다. 원본 다운로드나 현재 활동의 지표 구독을 만들지 않는다. */
export default function CyclingDistanceHistoryPanel({ activity, selection }: { activity: Activity; selection: CyclingDistanceHistoryRequest }) {
  const { t, i18n } = useTranslation("activity"), { locale, units } = useLocale();
  const id = useId(), [open, setOpen] = useState(false), [distance, setDistance] = useState<BikeDistanceKey>("10km");
  const headIdentity = JSON.stringify([activity.userId, activity.type, activity.startTime, activity.endTime, activity.deletedAt, activity.contentRevision, activity.contentSelectedRevision, activity.source, activity.localSessionId, activity.stravaActivityId, activity.stravaTwinActivityId]);
  const history = useCyclingDistanceHistory(activity.userId, activity.id, activity.deletedAt == null ? selection : null, headIdentity);
  const summary = useMemo(() => cyclingDistanceHistory(history.pages), [history.pages]);
  const limit = selection.rangeBasis === "calendar_year" ? 5 : 10;
  const leaders = useMemo(() => cyclingDistanceHistoryLeaders(summary, distance, limit), [summary, distance, limit]);
  const first = history.pages[0];
  const identity = JSON.stringify([activity.id, selection, first?.readTime, distance]);
  const [leaderReveal, setLeaderReveal] = useState<{ identity: string; count: number } | null>(null);
  const [sourceReveal, setSourceReveal] = useState<{ identity: string; count: number } | null>(null);
  const visibleLeaders = leaderReveal?.identity === identity ? leaderReveal.count : 3;
  const sourceIdentity = JSON.stringify([activity.id, selection, first?.readTime]);
  const visibleSources = sourceReveal?.identity === sourceIdentity ? sourceReveal.count : 50;
  const [openedSources, setOpenedSources] = useState<string | null>(null);
  if (!history.available) return null;
  const date = (value: number, full = false) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit", ...(full ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(value);
  const control = "min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]";
  return <details className="cycling-distance-history border-t border-[var(--line-soft)]" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className={`cursor-pointer py-3 ${control}`}><Text as="span" variant="bodyMedium" weight={600}>{t(selection.rangeBasis === "calendar_year" ? "cyclingDistanceHistory.yearTitle" : "cyclingDistanceHistory.rangeTitle", { year: selection.rangeBasis === "calendar_year" ? selection.year : "" })}</Text></summary>
    {open && <Stack gap="var(--space-3)">
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
        <label htmlFor={id}><Text as="span" variant="bodyMedium">{t("cyclingDistanceHistory.distance")}</Text><Select className={control} id={id} value={distance} onChange={event => setDistance(event.target.value as BikeDistanceKey)}>{BIKE_DISTANCE_TARGETS.map(key => <option key={key} value={key}>{t(`manualBikeEvidence.distances.${key}`)}</option>)}</Select></label>
        <Text as="h4" variant="bodyMedium" weight={600}>{t("cyclingDistanceHistory.leaders", { count: limit, distance: formatDistance(BIKE_DISTANCE_M[distance], units) })}</Text>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.coverage", leaders)}</Text>
        {leaders.underlyingSourceCount > 0 && <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.underlyingSource")}</Text>}
        {leaders.sources.length ? <><ul className="space-y-2">{leaders.sources.slice(0, visibleLeaders).map((row, index) => <li key={row.activityId} data-activity-revision={row.activityRevision} data-metrics-revision={row.metricsRevision}>
          <Text as="p" variant="bodyMedium" weight={600}>{index + 1} · {formatElapsedBoundary(row.elapsedSec)}</Text>
          <a className="activity-growth-source-link text-[length:var(--fs-md)]" href={`/${locale}/activity/${encodeURIComponent(row.activityId)}`}>{date(row.startTime)} · {row.representativeInput.source ?? t("cyclingDistanceHistory.unknownSource")}</a>
        </li>)}</ul>{leaders.sources.length > visibleLeaders && <Button className={control} size="sm" variant="outline" onClick={() => setLeaderReveal({ identity, count: limit })}>{t("cyclingDistanceHistory.showLeaders", { count: Math.min(limit, leaders.sources.length) })}</Button>}</>
          : <Text as="p" variant="bodyMedium" tone="secondary">{t(leaders.unsupported + leaders.unavailable > 0 ? "cyclingDistanceHistory.unknown" : "cyclingDistanceHistory.noObserved")}</Text>}
        <details key={sourceIdentity} className="activity-growth-sources" onToggle={event => setOpenedSources(event.currentTarget.open ? sourceIdentity : null)}><summary><Text variant="bodyMedium">{t("cyclingDistanceHistory.sources", { count: summary.rows.length })}</Text></summary>{openedSources === sourceIdentity && <Stack gap="var(--space-2)">
          <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.sourceStates", summary.states)}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.visibleSources", { shown: Math.min(visibleSources, summary.rows.length), total: summary.rows.length })}</Text>
          {summary.rows.slice(0, visibleSources).map(row => <a key={row.activityId} className="activity-growth-source-link text-[length:var(--fs-md)]" href={`/${locale}/activity/${encodeURIComponent(row.activityId)}`}>{date(row.startTime)} · {row.representativeInput.source ?? t("cyclingDistanceHistory.unknownSource")} · {t(`cyclingDistanceHistory.states.${row.analysis.state}`)}</a>)}
          {visibleSources < summary.rows.length && <Button className={control} size="sm" variant="outline" onClick={() => setSourceReveal({ identity: sourceIdentity, count: visibleSources + 50 })}>{t("cyclingDistanceHistory.moreSources")}</Button>}
        </Stack>}</details>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistanceHistory.basis")}</Text>
      </>}
    </Stack>}
  </details>;
}
