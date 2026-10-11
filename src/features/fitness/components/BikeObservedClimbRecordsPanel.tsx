import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { Button, Text } from "../../../theme";
import { useLocale } from "../../../contexts/LocaleContext";
import { formatDistance, formatElev } from "../../../utils/units";
import "./bike-observed-climb-records.css";
function ClimbRecords({ response }: { response: TrainingAnalysisPeriodsResponse }) {
  const { t, i18n } = useTranslation("fitness"), { units } = useLocale();
  const id = useId();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const date = (time: number) => new Date(time).toLocaleDateString(i18n.language, { timeZone: "Asia/Seoul" });
  return <details className="bike-observed-climbs">
    <summary><Text variant="bodyMedium" weight={600}>{t("bikeObservedClimbs.title")}</Text></summary>
    <div className="bike-observed-climbs-content">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedClimbs.scope")}</Text>
      <div className="bike-observed-climbs-periods">{response.periods.map((period, index) => {
        const observed = period.cyclingClimbObservations, listId = `${id}-${index}`;
        return <section key={`${period.fromInclusive}:${period.toExclusive}:${index}`} className="space-y-3" aria-label={t("bikeObservedClimbs.period", { period: index + 1 })}>
          <Text as="h4" variant="bodyMedium" weight={600}>{date(period.fromInclusive)} – {date(period.toExclusive - 1)}</Text>
          {!observed ? <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedClimbs.unknown")}</Text> : <>
            <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedClimbs.count", { total: observed.candidateActivityCount, observed: observed.observedActivityCount, empty: observed.noObservedActivityCount, unsupported: observed.unsupportedActivityCount, unavailable: observed.unavailableActivityCount })}</Text>
            {observed.truncated && <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedClimbs.truncated")}</Text>}
            {observed.sources.length ? <ol id={listId} className="bike-observed-climbs-list">{observed.sources.slice(0, expanded[index] ? 5 : 3).map(source => <li key={source.sourceActivityId}>
              <Text as="p" variant="bodyMedium" mono weight={600}>{t("bikeObservedClimbs.gain", { value: formatElev(source.elevationGainM, units) })}</Text>
              <Text as="p" variant="bodyMedium" mono>{t("bikeObservedClimbs.extent", { start: formatDistance(source.startKm * 1000, units), end: formatDistance(source.endKm * 1000, units) })}</Text>
              <Text as="p" variant="bodyMedium" mono>{t("bikeObservedClimbs.shape", { length: formatDistance(source.lengthKm * 1000, units), grade: source.avgGrade.toFixed(1) })}</Text>
              <a className="bike-observed-climbs-source" href={`/${i18n.language.startsWith("ko") ? "ko" : "en"}/activity/${encodeURIComponent(source.sourceActivityId)}`}>{date(source.startTime)} · {t("bikeObservedClimbs.source")}</a>
              <Text as="p" variant="bodyMedium" tone="secondary">{t(`bikeObservedClimbs.layer.${source.sourceLayer}`)}</Text>
            </li>)}</ol> : <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedClimbs.empty")}</Text>}
            {observed.sources.length > 3 && <Button size="sm" variant="ghost" aria-expanded={!!expanded[index]} aria-controls={listId} onClick={() => setExpanded(value => ({ ...value, [index]: !value[index] }))}>{t(expanded[index] ? "bikeObservedClimbs.less" : "bikeObservedClimbs.more", { count: observed.sources.length })}</Button>}
          </>}
        </section>;
      })}</div>
      {response.periods.some(period => (period.cyclingClimbObservations?.sources.length ?? 0) > 0) && <Text as="p" variant="bodyMedium" tone="secondary">{t("bikeObservedClimbs.quality")}</Text>}
    </div>
  </details>;
}
/** 부모의 기존 기간 응답만 소비하며 펼치기에 추가 조회가 없다. */
export default function BikeObservedClimbRecordsPanel({ response }: { response: TrainingAnalysisPeriodsResponse | null }) {
  if (!response || response.discipline !== "bike") return null;
  return <ClimbRecords key={`${response.asOf}:${response.inputDigest}:${response.periods.map(p => `${p.fromInclusive}:${p.toExclusive}`).join("|")}`} response={response} />;
}
