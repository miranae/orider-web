import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { BIKE_DISTANCE_TARGETS, type BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import { useActivityBikeDistanceEvidence } from "../../../hooks/useActivityBikeDistanceEvidence";
import { useLocale } from "../../../contexts/LocaleContext";
import { Button, Select, Text } from "../../../theme";
import { formatElapsedBoundary } from "./activityRangeSelection";
import type { MetricsLike } from "./metricsPresentation";
import "./activity-bike-distance-evidence.css";
export default function ActivityBikeDistanceEvidencePanel({ activity, metrics }: { activity: Activity; metrics: MetricsLike | null }) {
  const { t, i18n } = useTranslation("activity"), { locale } = useLocale();
  const id = useId(), [distance, setDistance] = useState<BikeDistanceKey>("10km");
  // 기존 지표의 관측 변경만 반영한다. 원본 거리 revision을 대신하지 않는다.
  const identity = JSON.stringify([metrics?.computedAt, metrics?.version, metrics?.inputPending, metrics?.inputCoverage, metrics?.sourceLayer]);
  const query = useActivityBikeDistanceEvidence(activity, identity);
  if (!query.available) return null;
  const evidence = query.response?.state === "available" ? query.response.evidence : null;
  const fact = evidence?.facts.find(value => value.distance === distance);
  const date = new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(activity.startTime);
  return <section className="manual-bike-evidence" aria-label={t("manualBikeEvidence.title")}>
    <Text as="h3" variant="subtitle">{t("manualBikeEvidence.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("manualBikeEvidence.scope")}</Text>
    <Button size="sm" variant="outline" loading={query.state === "loading"} disabled={query.state === "loading"} onClick={() => void query.inspect()}>{t(query.state === "idle" ? "manualBikeEvidence.inspect" : "manualBikeEvidence.refresh")}</Button>
    {query.state !== "idle" && query.state !== "available" && <Text as="p" variant="bodyMedium" tone="secondary">{t(`manualBikeEvidence.states.${query.state}`)}</Text>}
    {query.response?.state === "unavailable" && <Text as="p" variant="bodyMedium" tone="secondary">{t(`manualBikeEvidence.reasons.${query.response.reason}`)}</Text>}
    {evidence && <>
      <label htmlFor={id}><Text variant="bodyMedium">{t("manualBikeEvidence.distance")}</Text><Select id={id} value={distance} onChange={event => setDistance(event.target.value as BikeDistanceKey)}>{BIKE_DISTANCE_TARGETS.map(key => <option key={key} value={key}>{t(`manualBikeEvidence.distances.${key}`)}</option>)}</Select></label>
      <Text as="p" variant="bodyMedium" mono weight={600}>{fact ? t("manualBikeEvidence.elapsed", { value: formatElapsedBoundary(fact.elapsedSec) }) : t("manualBikeEvidence.notObserved")}</Text>
      {fact && <Text as="p" variant="bodyMedium" tone="secondary">{t("manualBikeEvidence.window", { from: formatElapsedBoundary(fact.startOffsetSec), to: formatElapsedBoundary(fact.endOffsetSec) })}</Text>}
      <Text as="p" variant="bodyMedium" tone="secondary">{t("manualBikeEvidence.extent", { from: formatElapsedBoundary(evidence.observedStartOffsetSec), to: formatElapsedBoundary(evidence.observedEndOffsetSec), count: evidence.inputPointCount })}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("manualBikeEvidence.snapshot")}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("manualBikeEvidence.provenance", { source: t(`manualBikeEvidence.declaredSources.${evidence.declaredActivitySource ?? "unknown"}`) })}</Text>
      <a className="manual-bike-evidence-source" href={`/${locale}/activity/${encodeURIComponent(activity.id)}`}>{t("manualBikeEvidence.source", { date, layer: t(`manualBikeEvidence.layers.${evidence.sourceLayer}`) })}</a>
    </>}
  </section>;
}
