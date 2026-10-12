import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RUN_DISTANCE_TARGETS_V2 } from "@shared/types/personal-records";
import type { ExpandedRunDistanceKey } from "@shared/types/personal-records";
import type { RunEffortStageOverlay } from "@shared/types/run-effort-stage-preferences";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { Button, Select, Text } from "../../../theme";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useRunEffortStageManagement } from "../../../hooks/useRunEffortStageManagement";
import { formatElapsedBoundary } from "./activityRangeSelection";
import RunPeriodComparisonPanel from "./RunPeriodComparisonPanel";

/** 원본이나 계정 전체 기록을 수정하지 않고 적용된 기간의 수동 비교만 다룬다. */
function RunEffortStageManagementScope({ ownerUid, appliedResponse }: { ownerUid: string; appliedResponse: TrainingAnalysisPeriodsResponse }) {
  const { t, i18n } = useTranslation("activity");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const candidates = [...new Map(appliedResponse.periods.flatMap(period => period.activities).map(activity => [activity.activityId, activity])).values()];
  const selected = candidates.some(activity => activity.activityId === selectedActivityId) ? selectedActivityId : null;
  const [target, setTarget] = useState<ExpandedRunDistanceKey>("5km");
  const tool = useRunEffortStageManagement(ownerUid, appliedResponse.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })), selected);
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
      }}><option value="">{t("runEffortTool.canonicalOnly")}</option>{candidates.map(activity => <option key={activity.activityId} value={activity.activityId}>{date(activity.startTime)}</option>)}</Select></label>
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
        {selected && <section className="space-y-2" aria-label={t("runEffortTool.storedCalculated")}>
          <Text as="p" variant="bodyMedium" className="font-semibold">{t("runEffortTool.storedCalculated")}</Text>
          <details className="text-[length:var(--fs-md)]"><summary className="cursor-pointer py-3">{t("runEffortTool.storedBasis")}</summary><Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.storedLimit")}</Text>{storedSources.some(source => source.qualification === "legacy_manifest_revision_and_gcs_token_pinned") && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.storedLegacyLimit")}</Text>}</details>
          {storedSources.map(source => {
            const binding = tool.response!.periods.flatMap(period => period.running?.stageEffortOverlay?.preferenceBindings ?? []).find(value => value.activityId === source.activityId);
            const anchor = source.records[target], excluded = source.excludedTargets.includes(target), observed = source.observedTargets.includes(target);
            if (!binding) return null;
            return <div key={source.activityId} className="space-y-2">
              <LocalizedLink className="inline-flex min-h-[calc(var(--dim-button-height)+var(--space-1))] items-center underline" to={`/activity/${encodeURIComponent(source.activityId)}`}>{date(source.startTime)}</LocalizedLink>
              <Text as="p" variant="bodyMedium" title={anchor ? `${formatElapsedBoundary(anchor.startTimeSec)}–${formatElapsedBoundary(anchor.endTimeSec)} · ${formatElapsedBoundary(anchor.exactElapsedSec)}` : undefined}>{observed && excluded ? t("runEffortTool.excluded") : anchor ? formatElapsedBoundary(anchor.elapsedSec) : t("runEffortTool.storedNoDistance")}</Text>
              {(anchor || observed && excluded) && <Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" variant="outline" size="sm" disabled={!binding.mutationReady || tool.busy || tool.pendingRequest} onClick={() => tool.change(binding, target, !excluded, true)} aria-label={t(excluded ? "runEffortTool.restoreNamed" : "runEffortTool.excludeNamed", { date: date(source.startTime), distance: t(`runRecord.dist.${target}`) })}>{t(excluded ? "runEffortTool.restore" : "runEffortTool.exclude")}</Button>}
            </div>;
          })}
          {!storedSources.length && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.storedUnavailable")}</Text>}
        </section>}
        <div className="space-y-3">{tool.response.periods.map((period, index) => <Text key={index} as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.excludedCount", { period: index + 1, amount: period.running?.expandedDistanceAnalysis?.distances.find(distance => distance.distance === target)?.excludedEffortActivityCount ?? "—" })}</Text>)}</div>
        <div className="space-y-3">{[...rows.values()].map(({ binding, startTime, elapsed }) => {
          const excluded = binding.excludedTargets.includes(target);
          const label = startTime === undefined ? t("runEffortTool.timeUnknown") : date(startTime);
          return <section key={binding.activityId} className="space-y-2"><LocalizedLink className="inline-flex items-center underline" style={{ minHeight: "calc(var(--dim-button-height) + var(--space-1))" }} to={`/activity/${encodeURIComponent(binding.activityId)}`}>{label}</LocalizedLink><Text as="p" variant="bodyMedium">{excluded ? t("runEffortTool.excluded") : elapsed !== undefined ? formatElapsedBoundary(elapsed) : "—"}</Text><Button className="min-h-[calc(var(--dim-button-height)+var(--space-1))]" variant="outline" size="sm" disabled={!binding.mutationReady || tool.busy || tool.pendingRequest} onClick={() => tool.change(binding, target, !excluded)} aria-label={t(excluded ? "runEffortTool.restoreNamed" : "runEffortTool.excludeNamed", { date: label, distance: t(`runRecord.dist.${target}`) })}>{t(excluded ? "runEffortTool.restore" : "runEffortTool.exclude")}</Button>{!binding.mutationReady && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.sourceUnverified")}</Text>}</section>;
        })}</div>
        {!rows.size && !selected && <Text as="p" variant="bodyMedium" tone="secondary">{t("runEffortTool.noCandidates")}</Text>}
        <RunPeriodComparisonPanel response={tool.response} />
      </>}
    </div>
  </details>;
}

export default function RunEffortStageManagementPanel(props: { ownerUid: string; appliedResponse: TrainingAnalysisPeriodsResponse }) {
  if (props.appliedResponse.discipline !== "run") return null;
  return <RunEffortStageManagementScope key={JSON.stringify([props.ownerUid, props.appliedResponse.periods.map(period => [period.fromInclusive, period.toExclusive])])} {...props} />;
}
