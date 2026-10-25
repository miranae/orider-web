import { useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useTrainingAnalysisPeriods, type TrainingAnalysisPeriodsSelection } from "../../../hooks/useTrainingAnalysisPeriods";
import { trainingAnalysisPeriodsAvailable } from "../../../services/trainingAnalysisPeriods";
import RunningPaceZonesPanel from "../../../components/activity/RunningPaceZonesPanel";
import CyclingDistancePeriodAnalysis from "./CyclingDistancePeriodAnalysis";
import BikeObservedClimbRecordsPanel from "../../fitness/components/BikeObservedClimbRecordsPanel";
import { useTranslation } from "react-i18next";
import type { TrainingAnalysisPeriodsResponse, PeriodHrZoneGroup, PeriodPowerZoneGroup } from "@shared/types/training-analysis-periods";
import BikeObservedPeriodRecordsPanel from "../../fitness/components/BikeObservedPeriodRecordsPanel";
import { Button, Text } from "../../../theme";
import { formatElapsedBoundary } from "./activityRangeSelection";

function ZoneGroup({ group }: { group: PeriodHrZoneGroup | PeriodPowerZoneGroup }) {
  const { t } = useTranslation("activity");
  const heartRate = "boundaries" in group;
  return <section className="space-y-2">
    <Text as="h5" variant="bodyMedium" weight={600}>{heartRate
      ? `${group.boundaries.reference === "lthr" ? "LTHR" : t("analysis.metric.maxHr")} ${group.boundaries.referenceBpm} bpm`
      : `${group.powerSource === "virtual" ? t("trainingPeriods.virtual") : t("trainingPeriods.measured")} · FTP ${group.ftp} W`}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.groupBasis", { count: group.activityIds.length, time: formatElapsedBoundary(group.observedSeconds) })}</Text>
    {group.observedSeconds === 0 ? <Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.zero")}</Text> : group.seconds.map((seconds, index) => <div key={index} className="flex items-center gap-3">
      <div><Text variant="bodyMedium">Z{index + 1}</Text>{heartRate && <Text as="div" variant="bodyMedium" tone="tertiary">{group.boundaries.zones[index]!.minBpm}{group.boundaries.zones[index]!.maxBpmExclusive == null ? ` ${t("rangeAnalysis.orAbove")}` : `–<${group.boundaries.zones[index]!.maxBpmExclusive}`} bpm</Text>}</div>
      <div className="flex-1 rounded-[var(--r-sm)] overflow-hidden bg-[var(--bg-2)]" aria-hidden="true"><div className="py-1" style={{ width: `${seconds / group.observedSeconds * 100}%`, background: `var(--zone-${Math.min(index + 1, 5)})` }} /></div>
      <Text variant="bodyMedium" mono>{formatElapsedBoundary(seconds)} · {(seconds / group.observedSeconds * 100).toFixed(1)}%</Text>
    </div>)}
  </section>;
}
/** 별도 클릭 시 적용된 기간만 조회한다. 기존 심박/파워 응답과 같은 snapshot이라고 주장하지 않는다. */
function ManualRunningPaceZones({ response, ownerUid }: { response: TrainingAnalysisPeriodsResponse; ownerUid: string }) {
  const { t, i18n } = useTranslation("activity");
  const [selection, setSelection] = useState<TrainingAnalysisPeriodsSelection | null>(null);
  const enabled = trainingAnalysisPeriodsAvailable();
  const result = useTrainingAnalysisPeriods(ownerUid, selection, enabled);
  const date = (value: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const readTime = (value: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  const exactTime = (value: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hourCycle: "h23" } as Intl.DateTimeFormatOptions & { fractionalSecondDigits: 3 }).format(value);
  const noObservedGroups = !!result.response && result.response.periods.every(period => !("groups" in period.zones.pace) || period.zones.pace.groups.length === 0);
  return <section className="space-y-3" aria-label={t("runningPaceZones.periodTitle")}>
    <Text as="h3" variant="subtitle">{t("runningPaceZones.periodTitle")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.manualNote")}</Text>
    <Button size="sm" disabled={!enabled || result.state === "loading"} onClick={() => setSelection(current => ({ request: { discipline: "run", includeRunningPaceZones: true,
      periods: response.periods.map(period => ({ fromInclusive: period.fromInclusive, toExclusive: period.toExclusive })) }, requestId: (current?.requestId ?? 0) + 1 }))}>{t("runningPaceZones.load")}</Button>
    {!enabled && <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.preparing")}</Text>}
    {result.state === "loading" && <Text as="p" variant="bodyMedium" role="status">{t("runningPaceZones.loading")}</Text>}
    {result.state === "error" && <Text as="p" variant="bodyMedium" role="alert">{t("runningPaceZones.error")}</Text>}
    {result.response && <div className="space-y-4"><Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.readAt", { date: readTime(result.response.asOf) })}</Text>{noObservedGroups && <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.noObserved")}</Text>}{result.response.periods.map((period, index) => {
      const pace = period.zones.pace;
      return <section key={index} className="space-y-3"><Text as="h4" variant="bodyMedium" weight={600}>{t(index === 0 ? "runningPaceZones.selectedPeriod" : "runningPaceZones.comparisonPeriod")} · {date(period.fromInclusive)} – {date(period.toExclusive - 1)}</Text>
        {"candidateActivityCount" in pace && <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.coverage", { ...pace })}</Text>}
        <details className="space-y-2"><summary className="cursor-pointer list-item font-semibold min-h-[calc(var(--dim-button-height)+var(--space-1))]">{t("runningPaceZones.periodEvidence")}</summary>
            <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.exactBounds", { from: exactTime(period.fromInclusive), to: exactTime(period.toExclusive) })}</Text>
            {"candidateActivityCount" in pace && <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.unavailableCounts", { ...pace })}</Text>}
            <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.savedCountsNote")}</Text>
          </details>
        {"candidateActivityCount" in pace ? <>
          {pace.truncated && <Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.truncated")}</Text>}
          {pace.groups.length > 0 && <><Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.groupLimit")}</Text>{pace.groups.map((group, groupIndex) => <RunningPaceZonesPanel key={groupIndex} analysis={group} />)}</>}
        </> : <Text as="p" variant="bodyMedium" tone="secondary">{t("runningPaceZones.legacyUnsupported")}</Text>}
      </section>;
    })}</div>}
  </section>;
}
/** 부모의 기간 통계 응답을 표시한다. 이 컴포넌트는 추가 요청을 만들지 않는다. */
export default function TrainingPeriodZonesPanel({ response, ownerUid }: { response: TrainingAnalysisPeriodsResponse | null; ownerUid?: string }) {
  const { t, i18n } = useTranslation("activity");
  const { user } = useAuth();
  const paceOwner = !!ownerUid && user?.uid === ownerUid && !user.isAnonymous;
  const date = (time: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
  if (!response) return null;
  return <><Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.populationBasis")}</Text><CyclingDistancePeriodAnalysis response={response} /><BikeObservedPeriodRecordsPanel response={response} /><BikeObservedClimbRecordsPanel response={response} /><details className="activity-growth-evidence text-[length:var(--fs-md)]">
    <summary className="cursor-pointer py-3 font-semibold">{t("trainingPeriods.title")}</summary>
    <div className="space-y-4 pt-3">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.basis")}</Text>
      {response.periods.map((period, index) => <section key={`${period.fromInclusive}:${period.toExclusive}:${index}`} className="space-y-4" aria-label={t("trainingPeriods.period", { count: index + 1 })}>
        <Text as="h3" variant="subtitle">{t("trainingPeriods.period", { count: index + 1 })} · {date(period.fromInclusive)} – {date(period.toExclusive - 1)}</Text>
        {(period.status === "partial" || period.coverage.truncated) && <Text as="p" variant="bodyMedium" tone="secondary">{t(period.coverage.truncated ? "trainingPeriods.truncated" : "trainingPeriods.partial")}</Text>}
        {(["heartRate", "power"] as const).map(channel => {
          const coverage = period.zones[channel];
          return <section key={channel} className="space-y-3" aria-label={t(`trainingPeriods.${channel}`)}>
            <Text as="h4" variant="bodyMedium" weight={600}>{t(`trainingPeriods.${channel}`)}</Text>
            {channel === "power" && period.zones.power.reason === "not_applicable" ? <Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.powerNotApplicable")}</Text> : <>
              <Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.coverage", { eligible: coverage.eligibleActivityCount, total: coverage.candidateActivityCount, missing: coverage.missingSensorActivityCount, unknown: coverage.contextUnknownActivityCount })}</Text>
              {coverage.groups.length ? <div className="space-y-4">{coverage.groups.map((group, groupIndex) => <ZoneGroup key={groupIndex} group={group} />)}</div> : <Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.missing")}</Text>}
            </>}
          </section>;
        })}
      </section>)}
      {response.discipline === "run" && (paceOwner ? <ManualRunningPaceZones key={JSON.stringify([ownerUid, response.discipline, response.periods.map(period => [period.fromInclusive, period.toExclusive])])} response={response} ownerUid={ownerUid!} /> : <Text as="p" variant="bodyMedium" tone="secondary">{t("trainingPeriods.paceUnavailable")}</Text>)}
    </div>
  </details></>;
}
