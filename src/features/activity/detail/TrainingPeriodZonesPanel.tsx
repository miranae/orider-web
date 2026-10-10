import { useTranslation } from "react-i18next";
import type { TrainingAnalysisPeriodsResponse, PeriodHrZoneGroup, PeriodPowerZoneGroup } from "@shared/types/training-analysis-periods";
import { Text } from "../../../theme";
import { formatElapsedBoundary } from "./activityRangeSelection";

function ZoneGroup({ group }: { group: PeriodHrZoneGroup | PeriodPowerZoneGroup }) {
  const { t } = useTranslation("activity");
  const heartRate = "boundaries" in group;
  return <section className="space-y-2">
    <Text as="h5" variant="bodySmall" weight={600}>{heartRate
      ? `${group.boundaries.reference === "lthr" ? "LTHR" : t("analysis.metric.maxHr")} ${group.boundaries.referenceBpm} bpm`
      : `${group.powerSource === "virtual" ? t("trainingPeriods.virtual") : t("trainingPeriods.measured")} · FTP ${group.ftp} W`}</Text>
    <Text as="p" variant="bodySmall" tone="secondary">{t("trainingPeriods.groupBasis", { count: group.activityIds.length, time: formatElapsedBoundary(group.observedSeconds) })}</Text>
    {group.observedSeconds === 0 ? <Text as="p" variant="bodySmall" tone="secondary">{t("trainingPeriods.zero")}</Text> : group.seconds.map((seconds, index) => <div key={index} className="flex items-center gap-3">
      <div><Text variant="bodySmall">Z{index + 1}</Text>{heartRate && <Text as="div" variant="caption" tone="tertiary">{group.boundaries.zones[index]!.minBpm}{group.boundaries.zones[index]!.maxBpmExclusive == null ? ` ${t("rangeAnalysis.orAbove")}` : `–<${group.boundaries.zones[index]!.maxBpmExclusive}`} bpm</Text>}</div>
      <div className="flex-1 rounded-[var(--r-sm)] overflow-hidden bg-[var(--bg-2)]" aria-hidden="true"><div className="py-1" style={{ width: `${seconds / group.observedSeconds * 100}%`, background: `var(--zone-${Math.min(index + 1, 5)})` }} /></div>
      <Text variant="bodySmall" mono>{formatElapsedBoundary(seconds)} · {(seconds / group.observedSeconds * 100).toFixed(1)}%</Text>
    </div>)}
  </section>;
}
/** 부모의 기간 통계 응답을 표시한다. 이 컴포넌트는 추가 요청을 만들지 않는다. */
export default function TrainingPeriodZonesPanel({ response }: { response: TrainingAnalysisPeriodsResponse | null }) {
  const { t, i18n } = useTranslation("activity");
  const date = (time: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
  if (!response) return null;
  return <details className="activity-growth-evidence text-[length:var(--fs-md)]">
    <summary className="cursor-pointer py-3 font-semibold">{t("trainingPeriods.title")}</summary>
    <div className="space-y-4 pt-3">
      <Text as="p" variant="bodySmall" tone="secondary">{t("trainingPeriods.basis")}</Text>
      {response.periods.map((period, index) => <section key={`${period.fromInclusive}:${period.toExclusive}:${index}`} className="space-y-4" aria-label={t("trainingPeriods.period", { count: index + 1 })}>
        <Text as="h3" variant="subtitle">{t("trainingPeriods.period", { count: index + 1 })} · {date(period.fromInclusive)} – {date(period.toExclusive - 1)}</Text>
        {(period.status === "partial" || period.coverage.truncated) && <Text as="p" variant="bodySmall" tone="secondary">{t(period.coverage.truncated ? "trainingPeriods.truncated" : "trainingPeriods.partial")}</Text>}
        {(["heartRate", "power"] as const).map(channel => {
          const coverage = period.zones[channel];
          return <section key={channel} className="space-y-3" aria-label={t(`trainingPeriods.${channel}`)}>
            <Text as="h4" variant="bodySmall" weight={600}>{t(`trainingPeriods.${channel}`)}</Text>
            {channel === "power" && period.zones.power.reason === "not_applicable" ? <Text as="p" variant="bodySmall" tone="secondary">{t("trainingPeriods.powerNotApplicable")}</Text> : <>
              <Text as="p" variant="bodySmall" tone="secondary">{t("trainingPeriods.coverage", { eligible: coverage.eligibleActivityCount, total: coverage.candidateActivityCount, missing: coverage.missingSensorActivityCount, unknown: coverage.contextUnknownActivityCount })}</Text>
              {coverage.groups.length ? <div className="space-y-4">{coverage.groups.map((group, groupIndex) => <ZoneGroup key={groupIndex} group={group} />)}</div> : <Text as="p" variant="bodySmall" tone="secondary">{t("trainingPeriods.missing")}</Text>}
            </>}
          </section>;
        })}
      </section>)}
      {response.discipline === "run" && <Text as="p" variant="bodySmall" tone="secondary">{t("trainingPeriods.paceUnavailable")}</Text>}
    </div>
  </details>;
}
