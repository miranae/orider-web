import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { BIKE_DISTANCE_TARGETS, type BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { TrainingAnalysisPeriodsResponse } from "@shared/types/training-analysis-periods";
import { useLocale } from "../../../contexts/LocaleContext";
import { Button, Select, Text } from "../../../theme";
import { formatElapsedBoundary } from "./activityRangeSelection";
import "./cycling-distance-period-analysis.css";
/** 이미 받은 기간 응답만 표시한다. 원본·히스토리·GPS를 추가 조회하지 않는다. */
export default function CyclingDistancePeriodAnalysis({ response }: { response: TrainingAnalysisPeriodsResponse | null }) {
  const { t, i18n } = useTranslation("activity"), { locale } = useLocale();
  const id = useId(), [open, setOpen] = useState(false), [distance, setDistance] = useState<BikeDistanceKey>("10km");
  const [sourceLimit, setSourceLimit] = useState(5);
  if (response?.discipline !== "bike") return null;
  const date = (time: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
  const label = (index: number) => { const p = response.periods[index]!; return `${t("cyclingDistancePeriods.period", { count: index + 1 })} · ${date(p.fromInclusive)}–${date(p.toExclusive - 1)}`; };
  return <details className="cycling-distance-periods" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("cyclingDistancePeriods.title")}</summary>
    {open && <div className="cycling-distance-periods-body">
      <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistancePeriods.basis")}</Text>
      <label htmlFor={id}><Text variant="bodyMedium">{t("cyclingDistancePeriods.distance")}</Text><Select id={id} value={distance} onChange={event => { setDistance(event.target.value as BikeDistanceKey); setSourceLimit(5); }}>{BIKE_DISTANCE_TARGETS.map(key => <option key={key} value={key}>{t(`manualBikeEvidence.distances.${key}`)}</option>)}</Select></label>
      <Text as="p" variant="bodyMedium" tone="secondary" className="cycling-distance-periods-scroll-hint">{t("cyclingDistancePeriods.scrollHint")}</Text>
      <div className="cycling-distance-periods-scroll"><table>
        <thead><tr>{["periodColumn", "best", "median", "observed"].map(key => <th key={key} scope="col">{t(`cyclingDistancePeriods.${key}`)}</th>)}</tr></thead>
        <tbody>{response.periods.map((period, index) => { const d = period.cyclingDistanceObservations?.distances.find(point => point.distance === distance); return <tr key={`${period.fromInclusive}:${period.toExclusive}`}><th scope="row">{label(index)}</th><td>{d?.bestTimeSeconds == null ? "—" : formatElapsedBoundary(d.bestTimeSeconds)}</td><td>{d?.medianTimeSeconds == null ? "—" : formatElapsedBoundary(d.medianTimeSeconds)}</td><td>{d ? d.observedEffortActivityCount : "—"}</td></tr>; })}</tbody>
      </table></div>
      {response.periods.map((period, index) => {
        const d = period.cyclingDistanceObservations?.distances.find(point => point.distance === distance);
        return <section key={`${period.fromInclusive}:${period.toExclusive}`} aria-label={label(index)} className="cycling-distance-periods-period">
          <Text as="h4" variant="bodyMedium" weight={600}>{label(index)}</Text>
          {!d ? <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistancePeriods.unknown")}</Text> : <>
            <Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistancePeriods.counts", { candidate: d.candidateActivityCount, supported: d.supportedActivityCount, observed: d.observedEffortActivityCount, empty: d.noObservedEffortActivityCount, unsupported: d.unsupportedActivityCount, unavailable: d.unavailableActivityCount })}</Text>
            {(d.truncated || d.unsupportedActivityCount > 0 || d.unavailableActivityCount > 0) && <Text as="p" variant="bodyMedium" tone="secondary">{t(d.truncated ? "cyclingDistancePeriods.truncated" : "cyclingDistancePeriods.partial")}</Text>}
            {d.observedEffortActivityCount === 0 && <Text as="p" variant="bodyMedium" tone="secondary">{t(d.supportedActivityCount > 0 ? "cyclingDistancePeriods.noObserved" : "cyclingDistancePeriods.noSupport")}</Text>}
            {d.sources.length > 0 && <><Text as="p" variant="bodyMedium" tone="secondary">{t("cyclingDistancePeriods.sourceCount", { shown: Math.min(sourceLimit, d.sources.length), total: d.sources.length })}</Text>
              <ul>{d.sources.slice(0, sourceLimit).map(source => <li key={source.sourceActivityId}><a href={`/${locale}/activity/${encodeURIComponent(source.sourceActivityId)}`}>{date(source.startTime)} · {formatElapsedBoundary(source.elapsedSec)}</a></li>)}</ul>
              {d.sources.length > sourceLimit && <Button size="sm" variant="outline" onClick={() => setSourceLimit(value => value + 5)}>{t("cyclingDistancePeriods.moreSources")}</Button>}
            </>}
          </>}
        </section>;
      })}
    </div>}
  </details>;
}
