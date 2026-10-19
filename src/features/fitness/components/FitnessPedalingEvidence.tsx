import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { matchesDiscipline } from "@shared/sport/discipline";
import { useActivityMetrics } from "../../../hooks/useActivityMetrics";
import InfoTip from "../../../components/InfoTip";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Card, Select, Stat, Text, buttonClass } from "../../../theme/components";
import { buildCyclingDynamicsCards } from "../../activity/detail/cyclingDynamicsPresentation";
import "./FitnessPedalingEvidence.css";

interface Props {
  activities: readonly Activity[];
  /** The summary window is not a source for sensor-level pedaling values. */
  metricsMap?: ReadonlyMap<string, ActivityMetrics>;
  locale: string;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export default function FitnessPedalingEvidence({ activities, locale }: Props) {
  const { t } = useTranslation("fitness");
  const rides = useMemo(() => activities.filter(activity => matchesDiscipline(activity.type, "bike") && Number.isFinite(activity.startTime)).sort((a, b) => b.startTime - a.startTime), [activities]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const selected = rides.find(activity => activity.id === chosenId)
    ?? rides.find(activity => finite(activity.summary?.averageCadence) && activity.summary.averageCadence > 0)
    ?? rides.find(activity => finite(activity.summary?.averagePower) && activity.summary.averagePower > 0)
    ?? rides[0] ?? null;
  // A keyed child remounts the existing hook when the activity changes, including its last-known state.
  return <Card className="fitness-pedaling" title={t("pedaling.title")}>
    <Text as="p" variant="bodySmall" tone="secondary">{t("pedaling.scope")}</Text>
    {selected ? <>
      <label className="fitness-pedaling__chooser">
        <Text as="span" variant="caption">{t("pedaling.select")}</Text>
        <Select value={selected.id} onChange={event => setChosenId(event.target.value)}>
          {rides.map(activity => <option key={activity.id} value={activity.id}>{new Date(activity.startTime).toLocaleDateString(locale)} · {t("discipline.bike")}{finite(activity.summary?.distance) ? ` · ${(activity.summary.distance / 1000).toFixed(1)} km` : ""}</option>)}
        </Select>
      </label>
      <SelectedPedaling key={selected.id} activityId={selected.id} />
    </> : <Text as="p" variant="bodySmall" tone="secondary">{t("pedaling.noRides")}</Text>}
  </Card>;
}

function SelectedPedaling({ activityId }: { activityId: string }) {
  const { t } = useTranslation("fitness");
  const { t: a } = useTranslation("activity");
  const result = useActivityMetrics(activityId);
  const metrics = result.metrics;
  const cards: Array<{ label: string; value: string; unit?: string; explanation: string; detail?: string }> = [];
  const add = (key: string, value: number | null | undefined, unit: string, glossary: string, digits = 1) => {
    if (finite(value)) cards.push({ label: a(`analysis.metric.${key}`), value: value.toFixed(digits), unit, explanation: a(`analysis.glossary.${glossary}`) });
  };
  if (metrics) {
    if (finite(metrics.avgCadence)) cards.push({ label: t("pedaling.avgCadence"), value: metrics.avgCadence.toFixed(0), unit: "rpm", explanation: t("pedaling.cadenceDefinition") });
    add("maxRpm", metrics.maxCadence, "rpm", "maxRpm", 0);
    add("avgHr", metrics.avgHr, "bpm", "avgHr", 0);
    add("maxHr", metrics.maxHr, "bpm", "maxHr", 0);
    add("cadenceConsistency", metrics.cyclingMetrics?.cadenceStdDev, "rpm σ", "cadenceConsistency");
    add("coasting", metrics.cyclingMetrics?.coastingPct, "%", "coasting");
    for (const [key, value] of [["coastingTime", metrics.cyclingMetrics?.coastingSec], ["longestCoast", metrics.cyclingMetrics?.longestCoastSec], ["longestZ4", metrics.cyclingMetrics?.longestZ4PlusSec]] as const) {
      if (finite(value)) cards.push({ label: key === "longestZ4" ? a("analysis.metric.longestZ4") : t(`pedaling.${key}`), value: duration(value), unit: "min:sec", explanation: a(`analysis.glossary.${key === "longestZ4" ? "longestZ4" : "coasting"}`) });
    }
    for (const key of ["q1", "q2", "q3", "q4"] as const) {
      const value = metrics.quadrant?.[`${key}Pct`];
      if (finite(value)) cards.push({ label: a(`analysis.metric.${key}`), value: value.toFixed(1), unit: "%", explanation: a("analysis.glossary.quadrant"), detail: a(`analysis.metric.${key}Desc`) });
    }
    // Reuse activity-detail presentation, including the legacy right-side balance convention.
    for (const card of buildCyclingDynamicsCards(metrics)) {
      const labelKey = card.kind === "balance" ? "pedalBalance" : card.kind === "coverage" ? "dynamicsCoverage" : card.kind;
      const glossary = card.kind.startsWith("powerPhase") ? "powerPhase" : labelKey;
      let detail = "";
      if (card.kind === "balance") detail = a("analysis.metric.pedalBalanceDesc", { value: card.detailValue });
      else if (card.kind === "pedalSmoothness" && card.detailValue) detail = a("analysis.metric.pedalSmoothnessCombined", { value: card.detailValue });
      else if (card.kind.startsWith("powerPhase")) {
        const [arc, peak] = card.detailValue?.split("|") ?? [];
        detail = peak ? a("analysis.metric.powerPhasePeakDesc", { arc, peak }) : a("analysis.metric.powerPhaseDesc", { arc });
      } else if (card.kind === "coverage") {
        const [samples, source] = card.detailValue?.split("|") ?? [];
        detail = t("pedaling.coverageDetail", { samples, source: t(`pedaling.source.${source}`) });
      }
      cards.push({ label: a(`analysis.metric.${labelKey}`), value: card.value, unit: card.unit, explanation: a(`analysis.glossary.${glossary}`), detail: detail || undefined });
    }
    if (metrics.decoupling?.basis === "power_hr" || metrics.discipline !== "run" && metrics.decoupling?.basis == null) {
      add("ef", metrics.decoupling?.ef, "W/bpm", "ef", 2);
      add("decoupling", metrics.decoupling?.decouplingPct, "%", "decoupling");
    }
    add("hrDrift", metrics.decoupling?.hrDriftPct, "%", "hrDrift");
  }
  return <>
    <Text as="p" variant="caption" tone="secondary">{t("pedaling.source")}{result.status === "stale" ? ` · ${t("pedaling.stale")}` : ""}</Text>
    {result.status === "loading" ? <Text as="p" variant="bodySmall" role="status">{t("pedaling.loading")}</Text>
      : result.status === "disabled" ? <Text as="p" variant="bodySmall" role="status">{t("pedaling.disabled")}</Text>
        : cards.length ? <div className="fitness-pedaling__metrics">{cards.map(card => <div key={card.label}>
          <Stat compact label={<InfoTip content={card.explanation} title={card.label}>{card.label}</InfoTip>} value={card.value} unit={card.unit} />
          {card.detail && <Text as="p" variant="caption" tone="secondary" className="fitness-pedaling__detail">{card.detail}</Text>}
        </div>)}</div> : <Text as="p" variant="bodySmall" tone="secondary">{t("pedaling.unavailable")}</Text>}
    {cards.length > 0 && <Text as="p" variant="caption" tone="secondary">{t("pedaling.partial")}</Text>}
    <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/activity/${encodeURIComponent(activityId)}?tab=analysis`}>{t("pedaling.openAnalysis")}</LocalizedLink>
  </>;
}
