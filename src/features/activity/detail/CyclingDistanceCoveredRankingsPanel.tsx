import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { BIKE_DISTANCE_TARGETS, type BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { CyclingDistanceHistoryRequest } from "@shared/types/training-cycling-distance-history";
import type { StageCyclingDistanceCoveredRankingsRequest as Request } from "@shared/types/stage-cycling-distance-covered-rankings";
import { useStageCyclingDistanceCoveredRankings } from "../../../hooks/useStageCyclingDistanceCoveredRankings";
import { cyclingDistanceCoveredRankings } from "./cyclingDistanceCoveredRankings";
import { Button, ChartFrame, Input, Select, Stack, Text } from "../../../theme";
import { useLocale } from "../../../contexts/LocaleContext";
import { formatElapsedBoundary } from "./activityRangeSelection";
function Content({ activity, selection, headIdentity }: { activity: Activity; selection: CyclingDistanceHistoryRequest; headIdentity: string }) {
  const { t, i18n } = useTranslation("activity"), { locale } = useLocale(), id = useId();
  const [now] = useState(() => Date.now()), [target, setTarget] = useState<BikeDistanceKey>("10km");
  const [mode, setMode] = useState<"calendar_year" | "custom" | "lifetime">(selection.rangeBasis === "calendar_year" ? "calendar_year" : "custom");
  const [year, setYear] = useState(selection.rangeBasis === "calendar_year" ? String(selection.year) : String(new Date(now + 32400000).getUTCFullYear()));
  const day = (ms: number) => new Date(ms + 32400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(selection.rangeBasis === "explicit_range" ? day(selection.range.fromInclusive) : `${year}-01-01`);
  const [to, setTo] = useState(selection.rangeBasis === "explicit_range" ? day(selection.range.toExclusive - 1) : day(now));
  const [limit, setLimit] = useState<5 | 10>(selection.rangeBasis === "calendar_year" ? 5 : 10);
  const range: Request["range"] = mode === "calendar_year" ? { rangeBasis: "calendar_year", year: Number(year) } : { rangeBasis: "explicit_range", fromInclusive: mode === "lifetime" ? 0 : Date.parse(`${from}T00:00:00+09:00`), toExclusive: mode === "lifetime" ? now : Math.min(now, Date.parse(`${to}T00:00:00+09:00`) + 86400000) };
  const request: Request = { version: 1, mode: "stage_cycling_distance_covered_rankings_v1", calendarBasis: "Asia/Seoul", range, profile: 10, anchorActivityId: activity.id };
  const tool = useStageCyclingDistanceCoveredRankings(activity, request, headIdentity);
  const projection = useMemo(() => cyclingDistanceCoveredRankings(tool.response, target, limit), [tool.response, target, limit]);
  const date = (ms: number, full = false) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", ...(full ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(ms);
  const link = (activityId: string) => `/${locale}/activity/${encodeURIComponent(activityId)}`;
  const control = "min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]";
  const points = projection.observations, values = points.map(p => p.effectiveElapsedSec), min = Math.min(...values), max = Math.max(...values);
  const scatter = points.map(point => { const x = points.length <= 1 ? 225 : 65 + (point.startTime - points[0]!.startTime) * 320 / Math.max(1, points[points.length - 1]!.startTime - points[0]!.startTime), y = min === max ? 80 : 25 + (point.effectiveElapsedSec - min) * 110 / (max - min); return `M${x},${y}m-3,0a3,3 0 1,0 6,0a3,3 0 1,0 -6,0z`; }).join(" ");
  return <Stack gap="var(--space-3)">
    <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.scope")}</Text>
    <div className="grid gap-[var(--space-3)] sm:grid-cols-2">
      <label className={`block space-y-2 min-w-0 ${mode === "calendar_year" ? "" : "sm:col-span-2"}`} htmlFor={`${id}-range`}><Text as="span" className="block" variant="bodyMedium">{t("cyclingCoveredRankings.range")}</Text><Select id={`${id}-range`} className={control} value={mode} onChange={event => { setMode(event.target.value as typeof mode); setLimit(event.target.value === "calendar_year" ? 5 : 10); }}>{["calendar_year", "custom", "lifetime"].map(key => <option key={key} value={key}>{t(`cyclingCoveredRankings.${key}`)}</option>)}</Select></label>
      {mode === "calendar_year" && <label className="block space-y-2 min-w-0" htmlFor={`${id}-year`}><Text as="span" className="block" variant="bodyMedium">{t("cyclingCoveredRankings.year")}</Text><Input className={control} id={`${id}-year`} type="number" min={1972} max={new Date(now + 32400000).getUTCFullYear()} value={year} onChange={event => setYear(event.target.value)} /></label>}
      {mode === "custom" && <>
        <label className="block space-y-2 min-w-0" htmlFor={`${id}-from`}><Text as="span" className="block" variant="bodyMedium">{t("cyclingCoveredRankings.from")}</Text><Input className={control} id={`${id}-from`} type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="block space-y-2 min-w-0" htmlFor={`${id}-to`}><Text as="span" className="block" variant="bodyMedium">{t("cyclingCoveredRankings.to")}</Text><Input className={control} id={`${id}-to`} type="date" max={day(now)} value={to} onChange={event => setTo(event.target.value)} /></label>
      </>}
    </div>
    <Stack direction="row" wrap gap="var(--space-2)">{([10, 20] as const).map(profile => <Button className={control} size="sm" variant="outline" key={profile} disabled={!tool.available || tool.status === "loading"} onClick={() => void tool.confirm(profile)}>{t("cyclingCoveredRankings.confirm", { count: profile })}</Button>)}{tool.status === "loading" && <Button className={control} size="sm" variant="outline" onClick={tool.cancel}>{t("cyclingCoveredRankings.cancel")}</Button>}{["invalidated", "error", "ready"].includes(tool.status) && <Button className={control} size="sm" variant="outline" disabled={!tool.available} onClick={() => void tool.confirm(tool.response?.requestScope.profile ?? 10)}>{t("cyclingCoveredRankings.recheck")}</Button>}</Stack>
    <details>
      <summary className={`cursor-pointer py-3 ${control}`}><Text as="span" variant="bodyMedium">{t("cyclingCoveredRankings.costDetails")}</Text></summary>
      <Stack gap="var(--space-2)">
        <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.cost")}</Text>
        {tool.response && <>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.technicalAsOf", { source: date(tool.response.readTimes.sourceFinal.seconds * 1000, true), stage: date(tool.response.readTimes.stageFinal.seconds * 1000, true) })}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.technicalStates", tool.response.coverage)}</Text>
          <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.io", { docs: tool.response.io.sourceDocs + tool.response.io.stageDocs, metadata: tool.response.io.metadata })}</Text>
          {tool.response.cohort.queryExhausted && <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.technicalExhausted")}</Text>}
        </>}
      </Stack>
    </details>
    {tool.status === "loading" && <Text as="p" variant="bodyMedium" role="status">{t("cyclingCoveredRankings.loading")}</Text>}
    {["invalidated", "error"].includes(tool.status) && <Text as="p" variant="bodyMedium" role="status">{t(`cyclingCoveredRankings.${tool.status}`)}</Text>}
    {tool.response && <>
      <Text as="p" variant="bodyMedium">{t("cyclingCoveredRankings.coverage", { count: tool.response.cohort.loadedActivityCount, scanned: tool.response.cohort.scannedActivityCount, from: date(tool.response.requestScope.range.fromInclusive), to: date(tool.response.requestScope.range.toExclusive - 1) })}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.asOf", { source: date(tool.response.readTimes.sourceFinal.seconds * 1000, true), stage: date(tool.response.readTimes.stageFinal.seconds * 1000, true) })}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.states", tool.response.coverage)} · {t(tool.response.cohort.queryExhausted ? "cyclingCoveredRankings.exhausted" : "cyclingCoveredRankings.capped")}</Text>
      {!["in_prefix", "included", "not_requested"].includes(tool.response.requestScope.anchor.outcome) && <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.anchorMissing")}</Text>}
      <div className="grid gap-[var(--space-3)] sm:grid-cols-2">
        <label className="block space-y-2 min-w-0" htmlFor={`${id}-target`}><Text as="span" className="block" variant="bodyMedium">{t("manualBikeEvidence.distance")}</Text><Select id={`${id}-target`} className={control} value={target} onChange={event => setTarget(event.target.value as BikeDistanceKey)}>{BIKE_DISTANCE_TARGETS.map(key => <option key={key} value={key}>{t(`manualBikeEvidence.distances.${key}`)}</option>)}</Select></label>
        <label className="block space-y-2 min-w-0" htmlFor={`${id}-limit`}><Text as="span" className="block" variant="bodyMedium">{t("cyclingCoveredRankings.top")}</Text><Select id={`${id}-limit`} className={control} value={limit} onChange={event => setLimit(Number(event.target.value) as 5 | 10)}><option value={5}>Top 5</option><option value={10}>Top 10</option></Select></label>
      </div>
      <Text as="h4" variant="bodyMedium" weight={600}>{t("cyclingCoveredRankings.best")}</Text>
      {projection.winner ? <Text as="p" variant="bodyMedium">{formatElapsedBoundary(projection.winner.effectiveElapsedSec)}</Text> : <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.empty")}</Text>}
      <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.next", { value: projection.nextBest ? formatElapsedBoundary(projection.nextBest.effectiveElapsedSec) : t("cyclingCoveredRankings.noNext") })}</Text>
      <ul className="space-y-2">{projection.leaders.map((rank, index) => <li key={rank.canonicalActivityId}><Text as="p" variant="bodyMedium" weight={600}>{index + 1} · {formatElapsedBoundary(rank.effectiveElapsedSec)}</Text><a className="activity-growth-source-link text-[length:var(--fs-md)]" href={link(rank.effortSourceActivityId!)}>{date(rank.startTime)} · {t(`cyclingCoveredRankings.bases.${rank.basis}`)}</a><Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.preferenceLink")}</Text></li>)}</ul>
      {points.length > 0 && <ChartFrame variant="embedded" header={<Text variant="bodyMedium" weight={600}>{t("cyclingCoveredRankings.progress")}</Text>}><Text as="p" id={`${id}-elapsed-axis`} variant="bodyMedium">{t("cyclingSnapshotPreference.original", { value: `${min}–${max} s` })} · {t("cyclingDistanceHistory.shorter")}</Text><svg className="cycling-distance-history-scatter" viewBox="0 0 420 160" role="img" data-y-axis="elapsedSec" aria-describedby={`${id}-elapsed-axis`} aria-label={t("cyclingCoveredRankings.progress")}><line x1={65} x2={385} y1={135} y2={135} stroke="var(--line-soft)" /><path data-observation-count={points.length} d={scatter} fill="var(--ink-2)" /></svg><div className="cycling-distance-history-axis"><Text variant="bodyMedium">{date(points[0]!.startTime)}</Text><Text variant="bodyMedium">{date(points[points.length - 1]!.startTime)}</Text></div><Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingCoveredRankings.progressNote", { count: points.length })}</Text></ChartFrame>}
    </>}
  </Stack>;
}
export default function CyclingDistanceCoveredRankingsPanel(props: { activity: Activity; selection: CyclingDistanceHistoryRequest; headIdentity: string }) {
  const { t } = useTranslation("activity"), [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer py-3 text-[length:var(--fs-md)]"><Text as="span" variant="bodyMedium" weight={600}>{t("cyclingCoveredRankings.title")}</Text></summary>{open && <Content key={JSON.stringify([props.activity.id, props.selection])} {...props} />}</details>;
}
