import type { Activity } from "@shared/types";
import { getDiscipline } from "../../../utils/disciplineFilter";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RUN_DISTANCE_TARGETS_V2 } from "@shared/types/personal-records";
import type { ExpandedRunDistanceKey } from "@shared/types/personal-records";
import type { RunEffortStageOverlay, StageTimeAdjustedRunEffortPeriod, RunEffortReportedKind } from "@shared/types/run-effort-stage-preferences";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { Button, Input, Select, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useRunEffortStageManagement } from "../../../hooks/useRunEffortStageManagement";
import { formatReportedRunTime, parseReportedRunTime } from "../../../services/runEffortStagePreferences";
import { formatElapsedBoundary } from "./activityRangeSelection";
import RunPeriodComparisonPanel from "./RunPeriodComparisonPanel";

/** 원본이나 계정 전체 기록을 수정하지 않고 적용된 기간의 수동 비교만 다룬다. */
interface RunEffortStageManagementProps { ownerUid: string; appliedResponse: TrainingAnalysisPeriodsResponse; currentActivity?: Activity }
function RunEffortStageManagementScope({ ownerUid, appliedResponse, currentActivity }: RunEffortStageManagementProps) {
  const { t, i18n } = useTranslation("activity");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const current = currentActivity?.userId === ownerUid && currentActivity.deletedAt == null
    && getDiscipline(currentActivity.type) === "run" && typeof currentActivity.id === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(currentActivity.id)
    && Number.isFinite(currentActivity.startTime) && currentActivity.startTime > 0 && Number.isFinite(new Date(currentActivity.startTime).getTime())
    && appliedResponse.periods.some(period => currentActivity.startTime >= period.fromInclusive && currentActivity.startTime < period.toExclusive)
    ? currentActivity : null;
  const candidates = [...new Map([...appliedResponse.periods.flatMap(period => period.activities),
    ...(current ? [{ activityId: current.id, startTime: current.startTime }] : [])].map(activity => [activity.activityId, activity])).values()];
  const selected = candidates.some(activity => activity.activityId === selectedActivityId) ? selectedActivityId : null;
  const [target, setTarget] = useState<ExpandedRunDistanceKey>("5km");
  const [basis, setBasis] = useState<"stored" | "canonical">("stored");
  const tool = useRunEffortStageManagement(ownerUid, appliedResponse.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })), selected, basis);
  if (!tool.owner || appliedResponse.discipline !== "run") return null;
  const date = (time: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
  const rows = new Map<string, { binding: RunEffortStageOverlay["preferenceBindings"][number]; startTime?: number; elapsed?: number }>();
  for (const period of tool.response?.periods ?? []) {
    for (const binding of period.running?.stageEffortOverlay?.preferenceBindings ?? []) {
      const expanded = period.running?.expandedDistanceAnalysis?.distances.find(value => value.distance === target)?.sources.find(source => source.sourceActivityId === binding.activityId);
      const legacy = period.running?.evidence?.activities.find(activity => activity.activityId === binding.activityId);
      const elapsed = expanded?.elapsedSec ?? legacy?.distanceRecords.find(record => record.distance === target)?.elapsedSec;
      const activity = period.activities.find(value => value.activityId === binding.activityId);
      const separateStoredSource = selected && period.stageDerivedRunDistances?.sources.some(source => source.activityId === binding.activityId && source.observedTargets.includes(target));
      if (!separateStoredSource && (elapsed !== undefined || binding.excludedTargets.includes(target))) rows.set(binding.activityId, { binding, startTime: expanded?.startTime ?? legacy?.startTime ?? activity?.startTime, elapsed });
    }
  }
  const storedSources = [...new Map((tool.response?.periods.flatMap(period => period.stageDerivedRunDistances?.sources ?? []) ?? []).map(source => [JSON.stringify([source.activityId, source.derivedRevision]), source])).values()];
  return <details className="activity-growth-evidence text-[length:var(--fs-md)]">
    <summary className="cursor-pointer py-3 font-semibold">{t("runEffortTool.title")}</summary>
    <div className="space-y-4 pt-3">
      <Text as="p" variant="bodyMedium">{t("runEffortTool.scope")}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.limit")}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.alias")}</Text>
      <label className="space-y-2 block"><Text as="span" variant="bodyMedium">{t("runEffortTool.storedSource")}</Text><Select value={selected ?? ""} className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy || tool.pendingRequest} onChange={event => {
        const id = event.target.value; setSelectedActivityId(candidates.some(activity => activity.activityId === id) ? id : null);
      }}><option value="">{t("runEffortTool.canonicalOnly")}</option>{candidates.map(activity => <option key={activity.activityId} value={activity.activityId}>{activity.activityId === current?.id ? `${t("runEffortTool.currentActivity")} · ${date(activity.startTime)}${current.source === "orider" ? " · ORider" : current.source === "strava" ? " · Strava" : ""}` : date(activity.startTime)}</option>)}</Select></label>
      {selected && <label className="space-y-2 block"><Text as="span" variant="bodyMedium">{t("runEffortTool.timeBasis")}</Text><Select value={basis} className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy || tool.pendingRequest} onChange={event => setBasis(event.target.value === "canonical" ? "canonical" : "stored")}>
        <option value="stored">{t("runEffortTool.timeBasisStored")}</option><option value="canonical">{t("runEffortTool.timeBasisCanonical")}</option>
      </Select></label>}
      <Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" size="sm" disabled={!tool.available || tool.busy} onClick={() => void tool.refresh()}>{t("runEffortTool.load")}</Button>
      {!tool.available && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.preparing")}</Text>}
      {tool.busy && <Text as="p" variant="bodyMedium" role="status">{t(tool.state === "mutating" ? "runEffortTool.saving" : "runEffortTool.loading")}</Text>}
      {tool.state === "unsupported" && <Text as="p" variant="bodyMedium" role="status">{t("runEffortTool.unsupported")}</Text>}
      {tool.outcome && <Text as="p" variant="bodyMedium" role="status">{t(tool.confirmedOutcome ? "runEffortTool.choiceConfirmed" : "runEffortTool.storedPending")}</Text>}
      {tool.failure && <div className="space-y-2" role="alert"><Text as="p" variant="bodyMedium">{t(`runEffortTool.failure.${tool.failure.kind}`)}</Text>{tool.failure.storedOutcome && <Text as="p" variant="bodyMedium">{t("runEffortTool.storedPending")}</Text>}{tool.canRetry && <Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" variant="outline" size="sm" disabled={tool.busy} onClick={tool.retry}>{t("runEffortTool.retry")}</Button>}{tool.pendingRequest && <Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" variant="ghost" size="sm" disabled={tool.busy} onClick={tool.cancelPending}>{t("runEffortTool.cancelPending")}</Button>}</div>}
      {tool.cancelledUnknown && <Text as="p" variant="bodyMedium" role="status">{t("runEffortTool.cancelledUnknown")}</Text>}
      {tool.state === "error" && !tool.failure && <Text as="p" variant="bodyMedium" role="alert">{t("runEffortTool.readError")}</Text>}
      {tool.response && <>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.asOf", { date: date(tool.response.asOf) })}</Text>
        <label className="space-y-2 block"><Text as="span" variant="bodyMedium">{t("runEffortTool.target")}</Text><Select value={target} className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" onChange={event => setTarget(event.target.value as ExpandedRunDistanceKey)}>{RUN_DISTANCE_TARGETS_V2.map(distance => <option key={distance} value={distance}>{t(`runRecord.dist.${distance}`)}</option>)}</Select></label>
        {selected && basis === "stored" && <section className="space-y-2" aria-label={t("runEffortTool.storedCalculated")}>
          <Text as="p" variant="bodyMedium" className="font-semibold">{t("runEffortTool.storedCalculated")}</Text>
          {storedSources.map(source => {
            const binding = tool.response!.periods.flatMap(period => period.running?.stageEffortOverlay?.preferenceBindings ?? []).find(value => value.activityId === source.activityId);
            const anchor = source.records[target], excluded = source.excludedTargets.includes(target), observed = source.observedTargets.includes(target);
            const corrected = tool.response!.periods.some(period => {
              const adjusted = period.stageTimeAdjustedEfforts;
              return adjusted?.selected?.activityId === source.activityId && (adjusted.efforts.some(row => row.sourceAuthority.target === target && row.timeCorrection !== null)
                || adjusted.orphanedCorrections.some(row => row.target === target));
            });
            if (!binding) return null;
            return <div key={source.activityId} className="space-y-2">
              {anchor && !excluded ? <Text as="p" variant="dataMedium" weight={600} title={`${formatElapsedBoundary(anchor.startTimeSec)}–${formatElapsedBoundary(anchor.endTimeSec)} · ${formatElapsedBoundary(anchor.exactElapsedSec)}`}>{corrected && <span className="text-[length:var(--fs-md)] font-normal">{t("runEffortTool.timeOriginal")} · </span>}<span>{t(`runRecord.dist.${target}`)}</span> · <span>{formatElapsedBoundary(anchor.elapsedSec)}</span></Text>
                : <Text as="p" variant="bodyMedium">{t(`runRecord.dist.${target}`)} · {observed && excluded ? t("runEffortTool.excluded") : t("runEffortTool.storedNoDistance")}</Text>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <LocalizedLink className="inline-flex min-h-[calc(var(--dim-button-height)+var(--space-1))] items-center underline" to={`/activity/${encodeURIComponent(source.activityId)}`}>{date(source.startTime)}</LocalizedLink>
                {(anchor || observed && excluded) && <Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" variant="outline" size="sm" disabled={!binding.mutationReady || tool.busy || tool.pendingRequest} onClick={() => tool.change(binding, target, !excluded, true)} aria-label={t(excluded ? "runEffortTool.restoreNamed" : "runEffortTool.excludeNamed", { date: date(source.startTime), distance: t(`runRecord.dist.${target}`) })}>{t(excluded ? "runEffortTool.restore" : "runEffortTool.exclude")}</Button>}
              </div>
            </div>;
          })}
          {!storedSources.length && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.storedUnavailable")}</Text>}
          <details className="text-[length:var(--fs-md)]"><summary className="cursor-pointer py-3">{t("runEffortTool.storedBasis")}</summary>
            <div className="space-y-1">
              <Text as="p" variant="bodyMedium" tone="secondary">{t(storedSources.some(source => source.timeBasis === "stored_activity_wall_clock_window") ? "runEffortTool.storedWallClockLimit" : "runEffortTool.storedLimit")}</Text>
              <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.storedUnknown")}</Text>
              <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.storedSeparate")}</Text>
              {storedSources.some(source => source.qualification === "legacy_manifest_revision_and_gcs_token_pinned") && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.storedLegacyLimit")}</Text>}
            </div>
          </details>
        </section>}
        {selected && [...new Map(tool.response.periods.flatMap(period => period.stageTimeAdjustedEfforts?.selected?.activityId === selected
          ? [[period.stageTimeAdjustedEfforts.selected.activityId, period.stageTimeAdjustedEfforts] as const] : [])).values()].map(channel => <RunTimeEditor
          key={JSON.stringify([selected, basis, target, tool.response!.inputDigest])} channel={channel} target={target} tool={tool} showOriginal={basis === "canonical"} />)}
        <details className="text-[length:var(--fs-md)]"><summary className="cursor-pointer py-3 font-semibold">{t("runEffortTool.periodComparison")}</summary>
          <div className="space-y-3 pt-3">{tool.response.periods.map((period, index) => {
            const amount = period.running?.expandedDistanceAnalysis?.distances.find(distance => distance.distance === target)?.excludedEffortActivityCount;
            return amount === 0 ? null : <Text key={index} as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.excludedCount", { period: index + 1, amount: amount ?? "—" })}</Text>;
          })}</div>
          <div className="space-y-3">{[...rows.values()].map(({ binding, startTime, elapsed }) => {
            const excluded = binding.excludedTargets.includes(target);
            const label = startTime === undefined ? t("runEffortTool.timeUnknown") : date(startTime);
            return <section key={binding.activityId} className="space-y-2"><LocalizedLink className="inline-flex items-center underline" style={{ minHeight: "calc(var(--dim-button-height) + var(--space-1))" }} to={`/activity/${encodeURIComponent(binding.activityId)}`}>{label}</LocalizedLink><Text as="p" variant="bodyMedium">{excluded ? t("runEffortTool.excluded") : elapsed !== undefined ? formatElapsedBoundary(elapsed) : "—"}</Text><Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" variant="outline" size="sm" disabled={!binding.mutationReady || tool.busy || tool.pendingRequest} onClick={() => tool.change(binding, target, !excluded)} aria-label={t(excluded ? "runEffortTool.restoreNamed" : "runEffortTool.excludeNamed", { date: label, distance: t(`runRecord.dist.${target}`) })}>{t(excluded ? "runEffortTool.restore" : "runEffortTool.exclude")}</Button>{!binding.mutationReady && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.sourceUnverified")}</Text>}</section>;
          })}</div>
          {!rows.size && !selected && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.noCandidates")}</Text>}
          <RunPeriodComparisonPanel response={tool.response} />
        </details>
      </>}
    </div>
  </details>;
}

function RunTimeEditor({ channel, target, tool, showOriginal }: { channel: StageTimeAdjustedRunEffortPeriod; target: ExpandedRunDistanceKey;
  tool: ReturnType<typeof useRunEffortStageManagement>; showOriginal: boolean }) {
  const { t } = useTranslation("activity");
  const effort = channel.efforts.find(row => row.sourceAuthority.target === target), orphan = channel.orphanedCorrections.find(row => row.target === target);
  const correction = effort?.timeCorrection ?? orphan?.timeCorrection;
  const [draft, setDraft] = useState(() => correction ? formatReportedRunTime(correction.reportedElapsedSeconds) : effort ? formatReportedRunTime(effort.originalElapsedSeconds) : "");
  const [kind, setKind] = useState<RunEffortReportedKind | "">(correction?.reportedKind ?? "");
  const seconds = parseReportedRunTime(draft);
  if (!effort && !orphan) return <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.timeNoSource")}</Text>;
  return <section className="space-y-2" aria-label={t("runEffortTool.timeTitle")}>
    {showOriginal && effort && <Text as="p" variant="dataMedium" weight={600} title={String(effort.originalElapsedSeconds)}>{correction && <span className="text-[length:var(--fs-md)] font-normal">{t("runEffortTool.timeOriginal")} · </span>}{t(`runRecord.dist.${target}`)} · {formatElapsedBoundary(effort.originalElapsedSeconds)}</Text>}
    {correction && <Text as="p" variant="bodyMedium">{t("runEffortTool.timeReported")}: <span className="font-semibold">{formatReportedRunTime(correction.reportedElapsedSeconds)}</span></Text>}
    {correction && effort?.effectiveElapsedSeconds !== null && effort?.effectiveElapsedSeconds !== undefined && <Text as="p" variant="bodyMedium">{t("runEffortTool.timeEffective")}: {formatReportedRunTime(effort.effectiveElapsedSeconds)}</Text>}
    {effort?.excluded && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.timeExcluded")}</Text>}
    {(orphan || effort?.correctionStatus === "source_changed") && <Text as="p" variant="bodyMedium" tone="secondary">{t(orphan ? "runEffortTool.timeOrphan" : "runEffortTool.timeStale")}</Text>}
    <details className="text-[length:var(--fs-md)]"><summary className="cursor-pointer py-3 font-semibold">{t("runEffortTool.timeTitle")}</summary>
      <div className="space-y-3 pt-2">
        <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.timeLimit")}</Text>
        {effort && <>
          <Text as="p" variant="bodyMedium">{t("runEffortTool.timeOriginal")}: {formatElapsedBoundary(effort.originalAnchor?.elapsedSec ?? effort.originalElapsedSeconds)}</Text>
          <label className="space-y-2 block"><Text as="span" variant="bodyMedium">{t("runEffortTool.timeInput")}</Text><Input value={draft} placeholder="0:03:51.125" className="min-h-[calc(var(--dim-button-height)+var(--space-1))] text-[length:var(--fs-md)]" disabled={tool.busy || tool.pendingRequest} onChange={event => setDraft(event.target.value)} /></label>
          {draft && seconds === null && <Text as="p" variant="bodyMedium" role="alert">{t("runEffortTool.timeInvalid")}</Text>}
          <label className="space-y-2 block"><Text as="span" variant="bodyMedium">{t("runEffortTool.timeKind")}</Text><Select value={kind} className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" disabled={tool.busy || tool.pendingRequest} onChange={event => setKind(event.target.value === "chip_time" ? "chip_time" : event.target.value === "timing_correction" ? "timing_correction" : "")}>
            <option value="">{t("runEffortTool.timeKindNone")}</option><option value="chip_time">{t("runEffortTool.timeKindChip")}</option><option value="timing_correction">{t("runEffortTool.timeKindTiming")}</option>
          </Select></label>
          <Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" size="sm" disabled={seconds === null || !channel.selected?.clearReady || tool.busy || tool.pendingRequest} onClick={() => { if (seconds !== null) tool.saveTime(effort, seconds, kind || undefined); }}>{t("runEffortTool.timeSave")}</Button>
        </>}
        {correction && <Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" variant="outline" size="sm" disabled={!channel.selected?.clearReady || tool.busy || tool.pendingRequest} onClick={() => tool.clearTime(channel, target)}>{t("runEffortTool.timeClear")}</Button>}
      </div>
    </details>
  </section>;
}

export default function RunEffortStageManagementPanel(props: RunEffortStageManagementProps) {
  if (props.appliedResponse.discipline !== "run") return null;
  return <RunEffortStageManagementScope key={JSON.stringify([props.ownerUid, props.appliedResponse.periods.map(period => [period.fromInclusive, period.toExclusive])])} {...props} />;
}
