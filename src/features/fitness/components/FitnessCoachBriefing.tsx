import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { FitnessPoint } from "../../../utils/fitnessMetrics";
import { forecastFitnessChoice48Hours, type ActivityImpactEntry, type Fitness48HourForecast } from "../activityImpact";
import { deriveActivityStimulus } from "../activityStimulus";
import DetailsSection from "../../../components/redesign/DetailsSection";
import { Button, Card, Chip, Text } from "../../../theme/components";
import "./FitnessCoachBriefing.css";

type ImpactMode = "marginal" | "actual";
type TrainingChoice = "rest" | "recovery" | "endurance";

interface FitnessCoachBriefingProps {
  impacts: ActivityImpactEntry[];
  selectedActivityId: string | null;
  onSelectActivity: (activityId: string) => void;
  forecast: Fitness48HourForecast | null;
  current: { ctl: number; atl: number; tsb: number };
  decisionSlot: ReactNode;
  locale: string;
  canonicalAvailable: boolean;
  pendingActivity?: Activity | null;
  metricsMap?: ReadonlyMap<string, ActivityMetrics>;
  discipline: "bike" | "run" | "swim";
}

const CHOICE_LOAD: Record<TrainingChoice, number> = { rest: 0, recovery: 20, endurance: 45 };

function signed(value: number): string {
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}

function activityTypeLabel(type: string, t: (key: string) => string): string {
  if (/ride|cycl/i.test(type)) return t("discipline.bike");
  if (/run/i.test(type)) return t("discipline.run");
  if (/swim/i.test(type)) return t("discipline.swim");
  return type;
}

function activityLabel(entry: ActivityImpactEntry, locale: string, t: (key: string) => string): string {
  const date = new Date(`${entry.date}T00:00:00.000Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  const distanceKm = entry.activity.summary.distance / 1000;
  return `${date} · ${activityTypeLabel(entry.activity.type, t)}${distanceKm > 0 ? ` · ${distanceKm.toFixed(1)} km` : ""}`;
}

function pendingActivityLabel(activity: Activity, locale: string, t: (key: string) => string): string {
  const date = new Date(activity.startTime).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const distanceKm = activity.summary.distance / 1000;
  return `${date} · ${activityTypeLabel(activity.type, t)}${distanceKm > 0 ? ` · ${distanceKm.toFixed(1)} km` : ""}`;
}

function previousUtcDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
}

function formatDuration(seconds: number, locale: string): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return locale.startsWith("ko") ? `${minutes}분` : `${minutes} min`;
  return locale.startsWith("ko") ? `${hours}시간 ${remainingMinutes}분` : `${hours}h ${remainingMinutes}m`;
}

function MetricDelta({ label, value, color }: { label: string; value: number | null; color: string }) {
  return <div><Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)" }}>{label}</Text><Text variant="dataLarge" style={{ color }}>{value == null ? "—" : signed(value)}</Text></div>;
}

function coachConclusion(tsb: number): { key: "recover" | "easy" | "ready"; tone: "warning" | "accent" | "success" } {
  if (tsb <= -20) return { key: "recover", tone: "warning" };
  if (tsb <= -8) return { key: "easy", tone: "accent" };
  return { key: "ready", tone: "success" };
}

function initialTrainingChoice(tsb: number): TrainingChoice {
  if (tsb <= -20) return "rest";
  if (tsb <= -8) return "recovery";
  return "endurance";
}

export default function FitnessCoachBriefing({ impacts, selectedActivityId, onSelectActivity, forecast, current, decisionSlot, locale, canonicalAvailable, pendingActivity, metricsMap, discipline }: FitnessCoachBriefingProps) {
  const { t } = useTranslation("fitness");
  const [mode, setMode] = useState<ImpactMode>("marginal");
  const [trainingChoice, setTrainingChoice] = useState<TrainingChoice>(() => initialTrainingChoice(current.tsb));
  const [showG1Notice, setShowG1Notice] = useState(false);
  const selectedPending = pendingActivity?.id === selectedActivityId ? pendingActivity : null;
  const selected = selectedPending ? null : impacts.find((entry) => entry.activity.id === selectedActivityId) ?? impacts[0] ?? null;
  const selectedActivity = selected?.activity ?? selectedPending;
  const conclusion = coachConclusion(current.tsb);
  const delta = selected ? mode === "marginal" ? selected.marginalImpact : selected.actualDayChange : null;
  const stimulus = selectedActivity ? deriveActivityStimulus(selectedActivity, metricsMap?.get(selectedActivity.id)) : null;
  useEffect(() => {
    setTrainingChoice(initialTrainingChoice(current.tsb));
    setShowG1Notice(false);
  }, [current.atl, current.ctl, current.tsb, discipline, pendingActivity?.id]);
  const choiceForecast = useMemo(() => {
    if (pendingActivity) return null;
    const firstRestPoint = forecast?.rest[0];
    if (!firstRestPoint) return null;
    const currentPoint: FitnessPoint = { date: previousUtcDay(firstRestPoint.date), ctl: current.ctl, atl: current.atl, tsb: current.tsb, dailyLoad: 0 };
    return forecastFitnessChoice48Hours(currentPoint, CHOICE_LOAD[trainingChoice]);
  }, [current.atl, current.ctl, current.tsb, forecast, pendingActivity, trainingChoice]);

  return (
    <section aria-labelledby="fitness-coach-title">
      <Card padding="none" style={{ padding: "var(--space-5)", marginBottom: "var(--space-4)" }}>
        <div className="fitness-coach__summary">
          <div className="fitness-coach__summary-copy">
            <Chip variant={conclusion.tone} dot>{t("coach.eyebrow")}</Chip>
            <Text as="h2" variant="title" id="fitness-coach-title" style={{ margin: "var(--space-3) 0 var(--space-2)" }}>{t(`coach.conclusion.${conclusion.key}.title`)}</Text>
            <Text as="p" variant="body" tone="secondary" style={{ margin: 0 }}>{t(`coach.conclusion.${conclusion.key}.body`)}</Text>
          </div>
          <div className="fitness-coach__current-metrics">
            <div><Text as="div" variant="eyebrow">{t("coach.metric.ctl")}</Text><Text variant="dataMedium" style={{ color: "var(--lime)" }}>{current.ctl.toFixed(1)}</Text></div>
            <div><Text as="div" variant="eyebrow">{t("coach.metric.atl")}</Text><Text variant="dataMedium" style={{ color: "var(--rose)" }}>{current.atl.toFixed(1)}</Text></div>
            <div><Text as="div" variant="eyebrow">{t("coach.metric.tsb")}</Text><Text variant="dataMedium" style={{ color: "var(--amber)" }}>{signed(current.tsb)}</Text></div>
          </div>
        </div>
      </Card>

      <div className="fitness-coach__primary-grid">
        <Card padding="none" style={{ padding: "var(--space-5)" }}>
          <div className="fitness-coach__impact-heading">
            <div>
              <Text as="div" variant="eyebrow">{t("coach.impact.eyebrow")}</Text>
              <Text as="h3" variant="title" style={{ margin: "var(--space-2) 0 var(--space-1)" }}>
                {selected ? activityLabel(selected, locale, t) : selectedPending ? pendingActivityLabel(selectedPending, locale, t) : canonicalAvailable ? t("coach.impact.empty") : t("coach.impact.unavailable")}
              </Text>
              {selected && <Text variant="caption" tone="tertiary">{t("coach.impact.load", { load: selected.attributedLoad.toFixed(0) })}</Text>}
            </div>
            <div role="group" aria-label={t("coach.impact.modeLabel")} className="fitness-coach__mode">
              <button type="button" onClick={() => setMode("marginal")} aria-pressed={mode === "marginal"}>{t("coach.impact.modeMarginal")}</button>
              <button type="button" onClick={() => setMode("actual")} aria-pressed={mode === "actual"}>{t("coach.impact.modeActual")}</button>
            </div>
          </div>
          <div className="fitness-coach__delta-grid">
            <MetricDelta label={t("coach.metric.ctl")} value={delta?.ctl ?? null} color="var(--lime)" />
            <MetricDelta label={t("coach.metric.atl")} value={delta?.atl ?? null} color="var(--rose)" />
            <MetricDelta label={t("coach.metric.tsb")} value={delta?.tsb ?? null} color="var(--amber)" />
          </div>
          <Text as="p" variant="caption" tone="tertiary" style={{ margin: "var(--space-3) 0 0" }}>
            {selectedPending ? t("coach.impact.pending") : mode === "marginal" ? t("coach.impact.marginalHelp") : t("coach.impact.actualHelp")}
          </Text>
          {stimulus && (
            <div className="fitness-coach__stimulus">
              <div>
                <Text as="div" variant="eyebrow">{t("coach.stimulus.eyebrow")}</Text>
                <Text as="div" variant="title" style={{ marginTop: "var(--space-2)" }}>{t(`coach.stimulus.type.${stimulus.workoutType}`)}</Text>
              </div>
              <div className="fitness-coach__evidence">
                <Chip>{t(`coach.stimulus.source.${stimulus.source}`)}</Chip>
                <Chip>{stimulus.confidence == null ? t("coach.stimulus.confidenceUnavailable") : t("coach.stimulus.confidence", { pct: Math.round(stimulus.confidence * 100) })}</Chip>
                {stimulus.intensityFactor != null && <Chip>IF {stimulus.intensityFactor.toFixed(2)}</Chip>}
                {stimulus.durationSec != null && <Chip>{formatDuration(stimulus.durationSec, locale)}</Chip>}
                <Chip>{t(stimulus.heartRateRecorded ? "coach.stimulus.hrRecorded" : "coach.stimulus.hrMissing")}</Chip>
                {stimulus.ftp != null && <Chip>FTP {stimulus.ftp.toFixed(0)} W</Chip>}
                {stimulus.decouplingPct != null && <Chip>{t("coach.stimulus.decoupling", { value: stimulus.decouplingPct.toFixed(1) })}</Chip>}
              </div>
              <Text as="p" variant="caption" tone="tertiary" style={{ margin: 0 }}>{t("coach.stimulus.disclaimer")}</Text>
            </div>
          )}
        </Card>

        <Card padding="none" style={{ padding: "var(--space-5)" }}>
          <Text as="div" variant="eyebrow">{t("coach.choice.eyebrow")}</Text>
          <Text as="h3" variant="title" style={{ margin: "var(--space-2) 0" }}>{t("coach.choice.title")}</Text>
          <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-4)" }}>{t("coach.choice.body")}</Text>
          <fieldset className="fitness-coach__choices" disabled={Boolean(pendingActivity)}>
            <legend className="fitness-coach__sr-only">{t("coach.choice.legend")}</legend>
            {(["rest", "recovery", "endurance"] as const).map((choice) => (
              <label key={choice} className="fitness-coach__choice" data-selected={trainingChoice === choice || undefined}>
                <input type="radio" name="fitness-training-choice" value={choice} checked={trainingChoice === choice} onChange={() => { setTrainingChoice(choice); setShowG1Notice(false); }} />
                <span>
                  <Text as="span" variant="label">{t(`coach.choice.${choice}.${discipline}`)}</Text>
                  <Text as="span" variant="caption" tone="tertiary">{choice === "rest" ? t("coach.choice.noLoad") : t("coach.choice.load", { load: CHOICE_LOAD[choice] })}</Text>
                </span>
              </label>
            ))}
          </fieldset>
          {pendingActivity && <Text as="p" variant="caption" tone="warning" style={{ margin: "var(--space-3) 0 0" }}>{t("coach.choice.pending")}</Text>}
          {choiceForecast && (
            <div className="fitness-coach__forecast" aria-live="polite">
              {choiceForecast.map((point) => (
                <div key={point.hoursAhead}>
                  <Text as="div" variant="eyebrow">{t("coach.choice.hours", { hours: point.hoursAhead })}</Text>
                  <Text as="div" variant="mono" style={{ marginTop: "var(--space-1)" }}>CTL {point.ctl.toFixed(1)} · ATL {point.atl.toFixed(1)} · <span style={{ color: "var(--amber)" }}>TSB {signed(point.tsb)}</span></Text>
                </div>
              ))}
            </div>
          )}
          {!pendingActivity && discipline === "bike" ? (
            <div className="fitness-coach__handoff">
              <Button variant="primary" block onClick={() => setShowG1Notice(true)}>
                {t(trainingChoice === "rest" ? "coach.choice.restConfirm" : "coach.choice.g1Preview")}
              </Button>
              <Text as="p" variant="caption" tone="tertiary" role="status" style={{ margin: 0 }}>
                {trainingChoice === "rest"
                  ? t(showG1Notice ? "coach.choice.restNoticeExpanded" : "coach.choice.restNotice")
                  : t(showG1Notice ? "coach.choice.g1NoticeExpanded" : "coach.choice.g1Notice")}
              </Text>
            </div>
          ) : !pendingActivity ? <Text as="p" variant="caption" tone="tertiary" style={{ margin: "var(--space-4) 0 0" }}>{t("coach.choice.localOnly")}</Text> : null}
        </Card>
      </div>

      <DetailsSection title={t("coach.range.detailsTitle")}>
        <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-4)" }}>{t("coach.range.body")}</Text>
        {decisionSlot}
      </DetailsSection>

      {(pendingActivity || impacts.length > 0) && (
        <Card padding="none" style={{ padding: "var(--space-5)", marginTop: "var(--space-4)" }}>
          <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>{t("coach.recent.title")}</Text>
          <div className="fitness-coach__recent-grid">
            {pendingActivity && (
              <button type="button" onClick={() => onSelectActivity(pendingActivity.id)} aria-pressed={pendingActivity.id === selectedActivityId} className="fitness-coach__recent" data-pending data-selected={pendingActivity.id === selectedActivityId || undefined}>
                <Text as="div" variant="label">{pendingActivityLabel(pendingActivity, locale, t)}</Text>
                <Text as="div" variant="caption" tone="warning" style={{ marginTop: "var(--space-2)" }}>{t("coach.impact.pending")}</Text>
              </button>
            )}
            {impacts.map((entry) => {
              const selectedEntry = entry.activity.id === selected?.activity.id;
              return (
                <button key={entry.activity.id} type="button" onClick={() => onSelectActivity(entry.activity.id)} aria-pressed={selectedEntry} className="fitness-coach__recent" data-selected={selectedEntry || undefined}>
                  <Text as="div" variant="label">{activityLabel(entry, locale, t)}</Text>
                  <Text as="div" variant="mono" style={{ marginTop: "var(--space-2)", color: "var(--ink-2)" }}>CTL {signed(entry.marginalImpact.ctl)} · ATL {signed(entry.marginalImpact.atl)}</Text>
                  <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>{entry.confidence === "canonical-single" ? t("coach.recent.canonical") : t("coach.recent.estimated")}</Text>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </section>
  );
}
