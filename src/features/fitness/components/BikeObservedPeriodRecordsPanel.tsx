import "./fitness-analysis-controls.css";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { Button, DropdownSelect, Stack, Text } from "../../../theme";
import { useLocale } from "../../../contexts/LocaleContext";
import { formatDistance, formatElev } from "../../../utils/units";
import { bikeObservedPeriodRecords, type BikeObservedBasis, type BikeObservedMetric } from "./bikeObservedPeriodRecords";
import "./bike-observed-period-records.css";
function BikeRecordsView({ response }: { response: TrainingAnalysisPeriodsResponse }) {
  const { t, i18n } = useTranslation("fitness");
  const { units } = useLocale();
  const id = useId();
  const [metric, setMetric] = useState<BikeObservedMetric>("distanceM");
  const [basis, setBasis] = useState<BikeObservedBasis>("all");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const date = (time: number) => new Date(time).toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" });
  return <section className="fitness-analysis-controls bike-observed-records" aria-label={t("bikeObservedRecords.title")}>
    <Text as="h3" variant="subtitle">{t("bikeObservedRecords.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedRecords.scope")}</Text>
    <Stack direction="row" wrap gap="var(--space-2)">{(["distanceM", "elevationGainM"] as const).map(value => <Button key={value} size="sm" variant={metric === value ? "secondary" : "ghost"} aria-pressed={metric === value} onClick={() => { setMetric(value); setExpanded({}); }}>{t(`bikeObservedRecords.metrics.${value}`)}</Button>)}</Stack>
    <label className="bike-observed-records-basis" htmlFor={id}><Text variant="bodyMedium">{t("bikeObservedRecords.chooseBasis")}</Text><DropdownSelect id={id} label={t("bikeObservedRecords.chooseBasis")} value={String(basis)} onChange={next => { setBasis(next as BikeObservedBasis); setExpanded({}); }} options={(["all", "canonical_metrics", "activity_summary"] as const).map((value) => ({ value: String(value), label: t(`bikeObservedRecords.basis.${value}`) }))} /></label>
    <div className="bike-observed-records-periods">{response.periods.map((period, index) => {
      const listId = `${id}-period-${index}`;
      const result = bikeObservedPeriodRecords(period, metric, basis), visible = expanded[index] ? result.records : result.records.slice(0, 3);
      return <section key={`${period.fromInclusive}:${period.toExclusive}:${index}`} className="space-y-3" aria-label={t("bikeObservedRecords.period", { period: index + 1 })}>
        <Text as="h4" variant="bodyMedium" weight={600}>{date(period.fromInclusive)} – {date(period.toExclusive - 1)}</Text>
        <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedRecords.count", { count: result.observedCount })}</Text>
        {(period.status === "partial" || period.coverage.truncated) && <Text as="p" variant="bodyMedium" tone="secondary">{t(period.coverage.truncated ? "bikeObservedRecords.truncated" : "bikeObservedRecords.partial", { limit: period.coverage.scanLimit })}</Text>}
        {visible.length ? <ol id={listId} className="bike-observed-records-list">{visible.map(activity => <li key={activity.activityId}><Text as="p" variant="bodyMedium" mono weight={600}>{metric === "distanceM" ? formatDistance(activity.distanceM!, units) : formatElev(activity.elevationGainM!, units)}</Text><a className="bike-observed-records-source" href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(activity.activityId)}`}>{date(activity.startTime)}</a><Text as="p" variant="bodyMedium" tone="secondary">{t(`bikeObservedRecords.basis.${activity.sourceBasis[metric]}`)}</Text></li>)}</ol> : <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedRecords.empty")}</Text>}
        {result.records.length > 3 && <Button size="sm" variant="ghost" aria-expanded={!!expanded[index]} aria-controls={listId} onClick={() => setExpanded(value => ({ ...value, [index]: !value[index] }))}>{t(expanded[index] ? "bikeObservedRecords.less" : "bikeObservedRecords.more", { count: result.records.length })}</Button>}
      </section>;
    })}</div>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedRecords.note")}</Text>
  </section>;
}
/** 기존 기간 응답만 소비한다. 선택·펼치기는 추가 조회를 하지 않는다. */
export default function BikeObservedPeriodRecordsPanel({ response }: { response: TrainingAnalysisPeriodsResponse | null }) {
  if (!response || response.discipline !== "bike") return null;
  return <BikeRecordsView key={`${response.asOf}:${response.inputDigest}:${response.periods.map(period => `${period.fromInclusive}:${period.toExclusive}`).join("|")}`} response={response} />;
}
