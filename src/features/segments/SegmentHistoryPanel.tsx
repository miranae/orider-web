import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SegmentHistoryAttempt } from "@shared/types/segment-history";
import { Button, Stat, Text } from "../../theme/components";
import { LocalizedLink } from "../../components/LocalizedLink";
import { useMySegmentHistory } from "../../hooks/useMySegmentHistory";
import { localeTag } from "../../utils/localeDate";
import "./segmentHistory.css";
export interface SegmentHistorySeed { id: string; activityId: string; elapsedTime: number; startDate?: number; source?: string; averageSpeed?: number; averageWatts?: number | null }
interface Props { initialSelection?: { activityId: string; effortId: string } | null; segmentId: string; seeds: SegmentHistorySeed[]; seedLoading: boolean; seedError: boolean; callableEnabled?: boolean }
const elapsed = (ms: number) => `${Math.floor(ms / 60000)}:${Math.floor(ms / 1000 % 60).toString().padStart(2, "0")}`;
export default function SegmentHistoryPanel({ initialSelection, segmentId, seeds, seedLoading, seedError, callableEnabled = false }: Props) {
  const { t } = useTranslation("segment");
  const [selection, setSelection] = useState<{ activityId: string; effortId: string; nonce: number } | null>(() => initialSelection ? { ...initialSelection, nonce: 1 } : null);
  const history = useMySegmentHistory(segmentId, selection, callableEnabled);
  const response = history.response?.state === "available" ? history.response : null;
  const rows = useMemo(() => [...history.rows].sort((a, b) => (b.startDateMs ?? -1) - (a.startDateMs ?? -1) || a.effortId.localeCompare(b.effortId)), [history.rows]);
  const date = (value?: number | null) => value != null && Number.isFinite(value) && value > 0 ? new Date(value).toLocaleDateString(localeTag()) : t("history.unknownDate");
  const select = (activityId: string, effortId: string) => setSelection(old => ({ activityId, effortId, nonce: (old?.nonce ?? 0) + 1 }));
  const source = (row: SegmentHistoryAttempt) => typeof row.source === "string" && row.source ? row.source : t("history.unknownSource");
  const sensors = (row: SegmentHistoryAttempt) => `${row.averageSpeedKph == null ? "—" : row.averageSpeedKph.toFixed(1)} km/h · ${row.averageHeartrate ?? "—"} bpm · ${row.averageWatts ?? "—"} W${row.isVirtualPower ? ` (${t("history.virtual")})` : ""} · ${row.averageCadence ?? "—"} rpm`;
  const attempt = (row: SegmentHistoryAttempt, current: boolean) => (
    <div className={`segment-history-row${current ? " segment-history-row-current" : ""}`} key={row.effortId} aria-current={current ? "true" : undefined}>
      <div className="segment-history-row-heading"><Text variant="bodySmall">{date(row.startDateMs)}</Text><Text variant="dataSmall">{elapsed(row.elapsedMs)}</Text></div>
      <div className="segment-history-row-meta"><Text variant="caption" tone="tertiary">{source(row)}</Text>{current && <Text variant="label" tone="accent">{t("history.current")}</Text>}<LocalizedLink to={`/activity/${row.activityId}`}>{t("activity.view")}</LocalizedLink></div>
      <Text as="div" variant="caption" tone="tertiary">{sensors(row)}</Text>
      {!current && <div className="segment-history-row-action"><Button size="sm" variant="ghost" onClick={() => select(row.activityId, row.effortId)}>{t("history.select")}</Button></div>}
    </div>
  );
  return <div className="segment-history-panel">
    {!callableEnabled ? <Text as="p" variant="bodySmall" tone="tertiary">{t("history.preparing")}</Text> : !selection && !response ? <Text as="p" variant="bodySmall" tone="tertiary">{t("history.selectHint")}</Text> : null}
    {!response && <>
      <Text as="p" variant="caption" tone="tertiary">{t("history.seedLimit")}</Text>
      {seedLoading ? <Text as="p" role="status">{t("history.loading")}</Text> : seedError ? <Text as="p" role="alert">{t("history.error")}</Text> : !seeds.length ? <Text as="p">{t("empty.noMyRecord")}</Text> : seeds.map(row => <div className="segment-history-row segment-history-seed" key={row.id}>
        <div><Text as="div" variant="bodySmall">{date(row.startDate)}</Text><Text as="div" variant="caption" tone="tertiary">{typeof row.source === "string" && row.source ? row.source : t("history.unknownSource")}</Text><LocalizedLink to={`/activity/${row.activityId}`}>{t("activity.view")}</LocalizedLink></div>
        <div className="segment-history-values"><Text as="div" variant="dataSmall">{elapsed(row.elapsedTime)}</Text><Text as="div" variant="caption" tone="tertiary">{typeof row.averageSpeed === "number" && Number.isFinite(row.averageSpeed) && row.averageSpeed >= 0 ? row.averageSpeed.toFixed(1) : "—"} km/h · {typeof row.averageWatts === "number" && Number.isFinite(row.averageWatts) && row.averageWatts >= 0 ? row.averageWatts : "—"} W</Text>{callableEnabled && <Button size="sm" variant="ghost" onClick={() => select(row.activityId, row.id)}>{t("history.select")}</Button>}</div>
      </div>)}
    </>}
    {history.loading && <Text as="p" role="status">{t("history.loading")}</Text>}
    {history.error && <div role="alert"><Text>{t("history.error")}</Text><Button size="sm" variant="ghost" onClick={history.retry}>{t("history.retry")}</Button></div>}
    {history.response?.state === "changed_input" && <div role="status"><Text>{t("history.changed")}</Text><Button size="sm" variant="ghost" onClick={history.retry}>{t("history.retry")}</Button></div>}
    {response && <>
      {response.currentAttempt && <section className="segment-history-current-card" aria-label={t("history.current")}>
        <Stat compact label={t("history.current")} value={elapsed(response.currentAttempt.elapsedMs)} />
        <Text as="div" variant="caption" tone="tertiary">{date(response.currentAttempt.startDateMs)}</Text>
        <Text as="div" variant="bodySmall" tone="secondary">{sensors(response.currentAttempt)}</Text>
        <div className="segment-history-row-meta"><Text variant="caption" tone="tertiary">{source(response.currentAttempt)}</Text><LocalizedLink to={`/activity/${response.currentAttempt.activityId}`}>{t("activity.view")}</LocalizedLink></div>
      </section>}
      {response.comparison && response.coverage.complete ? <div className="segment-history-comparison">
        <Text as="div" variant="bodySmall">{t("history.previousBest", { time: response.comparison.previousBestSec == null ? t("history.firstAttempt") : elapsed(response.comparison.previousBestSec * 1000) })}</Text>
        {response.comparison.deltaVsPreviousBestSec != null && <Text as="div" variant="dataSmall">{response.comparison.deltaVsPreviousBestSec > 0 ? "+" : ""}{response.comparison.deltaVsPreviousBestSec} s</Text>}
        {response.comparison.currentVsPriorBest && <Text as="div" variant="bodySmall">{t("history.currentVsPrior", { trend: t(`history.trend.${response.comparison.currentVsPriorBest}`) })}</Text>}
        <Text as="div" variant="caption" tone="tertiary">{t("history.analyzed", { count: response.comparison.analyzedAttempts, attempt: response.comparison.attemptNo })}</Text>
      </div> : <Text as="p" variant="bodySmall" tone="tertiary">{response.comparisonUnavailableReason === "invalid_chronology" ? t("history.chronology") : t("history.partial")}</Text>}
      {response.records.state === "authoritative_snapshot" && <>
        <Text as="h3" variant="subtitle">{t("history.records")}</Text>
        {response.records.topThree.map((row, index) => <div className="segment-history-record" key={row.effortId}><Text variant="label">PR #{index + 1}</Text><LocalizedLink to={`/activity/${row.activityId}`}>{elapsed(row.elapsedMs)} · {date(row.startDateMs)}</LocalizedLink><Text variant="caption" tone="tertiary">{typeof row.source === "string" && row.source ? row.source : t("history.unknownSource")}</Text></div>)}
      </>}
      {response.records.rawTotalEfforts != null && <details className="segment-history-basis"><summary>{t("history.basis")}</summary><Text as="p" variant="caption" tone="tertiary">{t("history.rawSnapshot", { count: response.records.rawTotalEfforts, date: date(response.records.authorityUpdatedAtMs) })}</Text></details>}
      <Text as="h3" variant="subtitle">{t("history.timeline")}</Text>
      <Text as="p" variant="caption" tone="tertiary">{t(response.coverage.complete ? "history.loaded" : "history.observedPartial", { count: rows.length })}</Text>
      {rows.map(row => attempt(row, row.effortId === response.currentEffortId))}
      {response.nextCursor && <Button size="sm" variant="ghost" disabled={history.loading} onClick={history.loadMore}>{t("history.more")}</Button>}
    </>}
    <Text as="p" variant="caption" tone="tertiary">{t("history.alignment")}</Text>
  </div>;
}
