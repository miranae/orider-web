import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import { RUN_DISTANCE_TARGETS_V2, type ExpandedRunDistanceKey } from "@shared/types/personal-records";
import { useActivityRunDistanceEvidence } from "../../../hooks/useActivityRunDistanceEvidence";
import { useLocale } from "../../../contexts/LocaleContext";
import { Button, Select, Text } from "../../../theme";
import { formatElapsedBoundary } from "./activityRangeSelection";
import type { MetricsLike } from "./metricsPresentation";
import "./activity-run-distance-evidence.css";
export default function ActivityRunDistanceEvidencePanel({ activity, metrics }: { activity: Activity; metrics: MetricsLike | null }) {
  const { t, i18n } = useTranslation("activity"), { locale } = useLocale();
  const id = useId(), [distance, setDistance] = useState<ExpandedRunDistanceKey>("400m");
  // 기존 지표의 관측 변경만 반영한다. 원본 거리 revision을 대신하지 않는다.
  const identity = JSON.stringify([metrics?.computedAt, metrics?.version, metrics?.inputPending, metrics?.inputCoverage, metrics?.sourceLayer]);
  const query = useActivityRunDistanceEvidence(activity, identity);
  if (!query.available) return null;
  const evidence = query.response?.state === "available" ? query.response.evidence : null;
  const fact = evidence?.facts.find(value => value.distance === distance);
  const date = new Intl.DateTimeFormat(i18n.language, { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(activity.startTime);
  return <section className="manual-run-evidence" aria-label={t("manualRunEvidence.title")}>
    <Text as="h3" variant="subtitle">{t("manualRunEvidence.title")}</Text>
    <Text as="p" variant="bodyMedium" tone="secondary">{t("manualRunEvidence.scope")}</Text>
    <Button size="sm" variant="outline" loading={query.state === "loading"} disabled={query.state === "loading"} onClick={() => void query.inspect()}>{t(query.state === "idle" ? "manualRunEvidence.inspect" : "manualRunEvidence.refresh")}</Button>
    {query.state !== "idle" && query.state !== "available" && <Text as="p" variant="bodyMedium" tone="secondary">{t(`manualRunEvidence.states.${query.state}`)}</Text>}
    {query.response?.state === "unavailable" && <Text as="p" variant="bodyMedium" tone="secondary">{t(`manualRunEvidence.reasons.${query.response.reason}`)}</Text>}
    {evidence && <>
      <label htmlFor={id}><Text variant="bodyMedium">{t("manualRunEvidence.distance")}</Text><Select id={id} value={distance} onChange={event => setDistance(event.target.value as ExpandedRunDistanceKey)}>{RUN_DISTANCE_TARGETS_V2.map(key => <option key={key} value={key}>{t(`manualRunEvidence.distances.${key}`)}</option>)}</Select></label>
      <Text as="p" variant="bodyMedium" mono weight={600}>{fact ? t("manualRunEvidence.elapsed", { value: formatElapsedBoundary(fact.elapsedSec) }) : t("manualRunEvidence.notObserved")}</Text>
      {fact && <Text as="p" variant="bodyMedium" tone="secondary">{t("manualRunEvidence.window", { from: formatElapsedBoundary(fact.startOffsetSec), to: formatElapsedBoundary(fact.endOffsetSec) })}</Text>}
      <Text as="p" variant="bodyMedium" tone="secondary">{t("manualRunEvidence.extent", { from: formatElapsedBoundary(evidence.observedStartOffsetSec), to: formatElapsedBoundary(evidence.observedEndOffsetSec), count: evidence.inputPointCount })}</Text>
      <Text as="p" variant="bodyMedium" tone="secondary">{t("manualRunEvidence.snapshot")}</Text>
      <a className="manual-run-evidence-source" href={`/${locale}/activity/${encodeURIComponent(activity.id)}`}>{t("manualRunEvidence.source", { date, layer: t(`manualRunEvidence.layers.${evidence.sourceLayer}`) })}</a>
    </>}
  </section>;
}
