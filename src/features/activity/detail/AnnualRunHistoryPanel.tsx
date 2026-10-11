import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TrainingAnalysisHistoryRow } from "@shared/types/training-analysis-history";
import { RUN_DISTANCES, type RunDistanceKey } from "@shared/types/personal-records";
import { useAnnualRunHistory } from "../../../hooks/useAnnualRunHistory";
import { useLocale } from "../../../contexts/LocaleContext";
import { Button, Select, Stack, Text } from "../../../theme";
import { annualDistanceLeaders, annualRunHistory } from "./annualRunHistory";
import { formatElapsedBoundary } from "./activityRangeSelection";
import { historyReadTimeMs } from "../../../services/trainingAnalysisHistory";

function AnnualHistorySources({ rows, locale, date }: { rows: TrainingAnalysisHistoryRow[]; locale: string; date: (time: number) => string }) {
  const { t } = useTranslation("activity");
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const visible = rows.slice(0, visibleCount);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer py-3 text-[length:var(--fs-md)] min-h-[calc(var(--dim-button-height)+var(--space-1))]">{t("annualHistory.sources", { count: rows.length })}</summary>
    {open && <Stack gap="var(--space-2)">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.visibleSources", { visible: visible.length, total: rows.length })}</Text>
      {visible.map(row => <a key={row.activityId} className="activity-growth-source-link text-[length:var(--fs-md)]" href={`/${locale}/activity/${encodeURIComponent(row.activityId)}`}><Text variant="bodyMedium">{date(row.startTime)} · {t(`annualHistory.states.${row.analysis.state}`)}</Text></a>)}
      {visibleCount < rows.length && <Button size="sm" onClick={() => setVisibleCount(value => Math.min(value + 50, rows.length))}>{t("annualHistory.moreSources")}</Button>}
    </Stack>}
  </details>;
}

export default function AnnualRunHistoryPanel({ ownerUid, activityId, year }: { ownerUid: string; activityId: string; year: number }) {
  const { t, i18n } = useTranslation("activity");
  const { locale } = useLocale();
  const id = useId();
  const history = useAnnualRunHistory(ownerUid, activityId, year);
  const [distance, setDistance] = useState<RunDistanceKey>("5km");
  const summary = useMemo(() => annualRunHistory(history.pages), [history.pages]);
  if (!history.available) return null;
  const date = (time: number, full = false) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", ...(full ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } as const : {}) }).format(time);
  const first = history.pages[0];
  const leaders = annualDistanceLeaders(summary.representatives, distance);
  return <section className="space-y-3 border-t border-[var(--line-soft)] pt-4" aria-label={t("annualHistory.title", { year })}>
    <Text as="h3" variant="subtitle">{t("annualHistory.title", { year })}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.scope")}</Text>
    {history.status === "idle" && <Button size="sm" onClick={() => void history.start()}>{t("annualHistory.start")}</Button>}
    {history.status === "loading" && <Button size="sm" loading disabled>{t("annualHistory.loading")}</Button>}
    {history.status === "partial" && <><Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.partial")}</Text><Button size="sm" onClick={() => void history.loadMore()}>{t("annualHistory.more")}</Button></>}
    {history.status === "complete" && <Text as="p" variant="bodyMedium">{t("annualHistory.scanComplete")}</Text>}
    {history.status === "capped" && <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.capped")}</Text>}
    {history.status === "error" && <><Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.error")}</Text><Button size="sm" onClick={() => void (history.pages.length ? history.loadMore() : history.start())}>{t("annualHistory.retry")}</Button></>}
    {(history.status === "expired" || history.status === "invalidated") && <><Text as="p" variant="bodyMedium" tone="secondary">{t(history.status === "expired" ? "annualHistory.expired" : "annualHistory.invalidated")}</Text><Button size="sm" onClick={() => void history.restart()}>{t("annualHistory.restart")}</Button></>}
    {history.status === "unsupported" && <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.unsupported")}</Text>}
    {first && <>
      <Text as="p" variant="bodyMedium">{t("annualHistory.snapshot", { from: date(first.range.fromInclusive), to: date(first.range.toExclusive - 1), asOf: date(historyReadTimeMs(first.readTime), true) })}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.counts", { scanned: summary.scanned, candidates: summary.candidateCount, representatives: summary.representatives.length, duplicates: summary.deduplicatedCount })}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.analysisStates", summary.states)}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.channelCoverage", summary.channels)}</Text>
      <label htmlFor={`${id}-distance`}><Text as="span" variant="bodyMedium">{t("annualHistory.distance")}</Text><Select id={`${id}-distance`} className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" value={distance} onChange={event => setDistance(event.target.value as RunDistanceKey)}>{RUN_DISTANCES.map(value => <option key={value} value={value}>{t(`runRecord.dist.${value}`)}</option>)}</Select></label>
      <Text as="h4" variant="bodyMedium" weight={600}>{t("annualHistory.leaders", { count: summary.representatives.filter(row => row.analysis.state === "ready" && row.distanceRecords.state === "observed" && row.distanceRecords.points.some(point => point.distance === distance)).length })}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.timingBasis")}</Text>
      {leaders.length ? <ul className="space-y-2">{leaders.map(row => <li key={row.activityId} data-metrics-revision={row.metricsRevision}><Text as="p" variant="bodyMedium" weight={600}>{formatElapsedBoundary(row.elapsedSec)}</Text><a className="activity-growth-source-link text-[length:var(--fs-md)]" href={`/${locale}/activity/${encodeURIComponent(row.activityId)}`}>{t("annualHistory.source", { date: date(row.startTime) })}</a></li>)}</ul> : <Text as="p" variant="bodyMedium" tone="secondary">{t("annualHistory.noEfforts")}</Text>}
      <AnnualHistorySources key={JSON.stringify([ownerUid, activityId, year, first.readTime])} rows={summary.representatives} locale={locale} date={date} />
    </>}
  </section>;
}
