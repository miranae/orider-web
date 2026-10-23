import GlossaryText from "../../../components/common/GlossaryText";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { FitnessPoint } from "../../../utils/fitnessMetrics";
import { forecastFitnessChoice48Hours, type ActivityDayLoad, type ActivityImpactEntry, type Fitness48HourForecast } from "../activityImpact";
import { deriveActivityStimulus } from "../activityStimulus";
import DetailsSection from "../../../components/redesign/DetailsSection";
import { Button, Card, Chip, Stat, Text, ToggleControls, ToggleButton, buttonClass } from "../../../theme/components";
import RiderWorkoutDeliveryPanel from "./RiderWorkoutDeliveryPanel";
import "./FitnessCoachBriefing.css";

type ImpactMode = "marginal" | "actual";
type TrainingChoice = "rest" | "recovery" | "endurance";

interface FitnessCoachBriefingProps {
  part?: "all" | "condition" | "today";
  impacts: ActivityImpactEntry[];
  selectedActivityId: string | null;
  onSelectActivity: (activityId: string) => void;
  forecast: Fitness48HourForecast | null;
  current: { ctl: number; atl: number; tsb: number };
  decisionSlot: ReactNode;
  locale: string;
  canonicalAvailable: boolean;
  pendingActivity?: Activity | null;
  pendingDayLoad?: ActivityDayLoad | null;
  metricsMap?: ReadonlyMap<string, ActivityMetrics>;
  discipline: "bike" | "run" | "swim";
  userId?: string | null;
  /** Primary trend surface shown after the current-state summary on desktop. */
  trendSlot?: ReactNode;
  mobilePriority?: boolean;
  evidenceNavSlot?: ReactNode;
  deliveryEnabled?: boolean;
  choiceTitle?: string;
  weekChangeSlot?: ReactNode;
  /** 현재 지표(CTL/ATL/TSB) 바로 아래 한 줄 — 부하 이력 해석의 충분도(낮은 근거일 때만 그려진다). */
  metricsNoteSlot?: ReactNode;
  /** Canonical-aware condition interpretation supplied by the page. */
  statusSlot?: ReactNode;
  currentBasis?: string;
  currentDate?: string;
  showConditionChoices?: boolean;
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
  const distance = entry.activity.summary?.distance;
  const distanceKm = typeof distance === "number" && Number.isFinite(distance) && distance > 0 ? distance / 1000 : null;
  return `${date} · ${activityTypeLabel(entry.activity.type, t)}${distanceKm != null ? ` · ${distanceKm.toFixed(1)} km` : ""}`;
}

function pendingActivityLabel(activity: Activity, locale: string, t: (key: string) => string): string {
  const date = new Date(activity.startTime).toLocaleDateString(locale, { month: "short", day: "numeric" });
  const distance = activity.summary?.distance;
  const distanceKm = typeof distance === "number" && Number.isFinite(distance) && distance > 0 ? distance / 1000 : null;
  return `${date} · ${activityTypeLabel(activity.type, t)}${distanceKm != null ? ` · ${distanceKm.toFixed(1)} km` : ""}`;
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
  return <Stat label={<GlossaryText>{label}</GlossaryText>} value={value == null ? "—" : signed(value)} style={{ borderInlineStart: `2px solid ${color}`, paddingInlineStart: "var(--space-2)" }} />;
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

export default function FitnessCoachBriefing({ part = "all", impacts, selectedActivityId, onSelectActivity, forecast, current, decisionSlot, locale, canonicalAvailable, pendingActivity, pendingDayLoad, metricsMap, discipline, userId = null, trendSlot, mobilePriority = false, evidenceNavSlot, deliveryEnabled = true, choiceTitle, weekChangeSlot, metricsNoteSlot, statusSlot, currentBasis, currentDate, showConditionChoices = true }: FitnessCoachBriefingProps) {
  const { t } = useTranslation("fitness");
  const [mode, setMode] = useState<ImpactMode>("marginal");
  const [trainingChoice, setTrainingChoice] = useState<TrainingChoice>(() => part === "today" && !canonicalAvailable ? "rest" : initialTrainingChoice(current.tsb));
  const [showRestNotice, setShowRestNotice] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const selectedPending = pendingActivity?.id === selectedActivityId ? pendingActivity : null;
  const awaitingAggregate = Boolean(pendingActivity) && pendingDayLoad == null;
  const pendingDescription = pendingDayLoad
    ? t("coach.impact.dayLoadAvailable", { load: pendingDayLoad.dailyLoad.toFixed(0) })
    : t("coach.impact.pending");
  const selected = selectedPending ? null : impacts.find((entry) => entry.activity.id === selectedActivityId) ?? impacts[0] ?? null;
  const selectedActivity = selected?.activity ?? selectedPending;
  const conclusion = coachConclusion(current.tsb);
  const delta = selected ? mode === "marginal" ? selected.marginalImpact : selected.actualDayChange : null;
  const stimulus = selectedActivity ? deriveActivityStimulus(selectedActivity, metricsMap?.get(selectedActivity.id)) : null;
  useEffect(() => {
    setTrainingChoice(part === "today" && !canonicalAvailable ? "rest" : initialTrainingChoice(current.tsb));
    setShowRestNotice(false);
  }, [current.atl, current.ctl, current.tsb, discipline, pendingActivity?.id, part, canonicalAvailable]);
  const choiceForecast = useMemo(() => {
    if (awaitingAggregate || !canonicalAvailable) return null;
    const firstRestPoint = forecast?.rest[0];
    if (!firstRestPoint) return null;
    const currentPoint: FitnessPoint = { date: previousUtcDay(firstRestPoint.date), ctl: current.ctl, atl: current.atl, tsb: current.tsb, dailyLoad: 0 };
    return forecastFitnessChoice48Hours(currentPoint, CHOICE_LOAD[trainingChoice]);
  }, [current.atl, current.ctl, current.tsb, forecast, awaitingAggregate, canonicalAvailable, trainingChoice]);

  const SummarySurface = part === "condition" ? "div" : Card;
  const ChoiceSurface = part === "condition" ? "div" : Card;
  const recentActivities = (pendingActivity || impacts.length > 0) ? (
    <div className="fitness-coach__activity-selector">
      <Text as="h3" variant="subtitle" style={{ marginBottom: "var(--space-3)" }}>{t("coach.recent.title")}</Text>
      <div data-testid={part === "condition" ? "K1-3-1" : undefined} className="fitness-coach__recent-grid">
        {pendingActivity && (
          <Card variant={pendingActivity?.id === selectedActivityId ? "inset" : "flat"} padding="compact" onClick={() => onSelectActivity(pendingActivity.id)} aria-pressed={pendingActivity.id === selectedActivityId} className="fitness-coach__recent" data-pending={awaitingAggregate || undefined} data-day-load-available={pendingDayLoad != null || undefined} data-selected={pendingActivity.id === selectedActivityId || undefined}>
            <Text as="div" variant="bodyMedium">{pendingActivityLabel(pendingActivity, locale, t)}</Text>
            <Text data-testid={part === "condition" ? "K1-3-4" : undefined} as="div" variant="caption" tone={awaitingAggregate ? "warning" : "tertiary"} style={{ marginTop: "var(--space-2)" }}>{pendingDescription}</Text>
          </Card>
        )}
        {impacts.map((entry) => {
          const selectedEntry = entry.activity.id === selected?.activity.id;
          return (
            <Card key={entry.activity.id} variant={selectedEntry ? "inset" : "flat"} padding="compact" onClick={() => onSelectActivity(entry.activity.id)} aria-pressed={selectedEntry} className="fitness-coach__recent" data-selected={selectedEntry || undefined}>
              <Text as="div" variant="bodyMedium">{activityLabel(entry, locale, t)}</Text>
              <div className="fitness-coach__recent-impact">
                <Text as="div" variant="num">CTL {signed(entry.marginalImpact.ctl)}</Text>
                <Text as="div" variant="num">ATL {signed(entry.marginalImpact.atl)}</Text>
              </div>
              <Text as="div" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-1)" }}>{entry.confidence === "canonical-single" ? t("coach.recent.canonical") : entry.confidence === "activity-tss" ? t("coach.recent.activityTss") : t("coach.recent.estimated")}</Text>
            </Card>
          );
        })}
      </div>
    </div>
  ) : null;
  const activityImpact = (
    <div id={part === "condition" ? "condition-activities" : undefined} tabIndex={part === "condition" ? -1 : undefined} className={part === "condition" ? "fitness-coach__activity-section condition-section-target" : "fitness-coach__primary-grid"}>
      <Card data-testid={part === "condition" ? "K1-3" : undefined} className="fitness-coach__impact-card" padding="none" style={{ padding: "var(--space-5)" }}>
        {part === "all" && weekChangeSlot}
        {part === "condition" && <>
          <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-4)" }}>{t("condition.story.activityBasis")}</Text>
          {recentActivities}
        </>}
        <div className="fitness-coach__impact-heading">
          <div>
            <Text as="div" variant="eyebrow">{t("coach.impact.eyebrow")}</Text>
            <Text as="h3" variant="subtitle" style={{ margin: "var(--space-2) 0 var(--space-1)" }}>
              {selected ? activityLabel(selected, locale, t) : selectedPending ? pendingActivityLabel(selectedPending, locale, t) : canonicalAvailable ? t("coach.impact.empty") : t("coach.impact.unavailable")}
            </Text>
            {selected && <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to={`/activity/${encodeURIComponent(selected.activity.id)}?tab=analysis`}>{t("pedaling.openAnalysis")} →</LocalizedLink>}
            {selected && <Text variant="caption" tone="tertiary">{t(selected.confidence === "activity-tss" ? "coach.impact.activityTssLoad" : "coach.impact.load", { load: selected.attributedLoad.toFixed(0) })}</Text>}
          </div>
          <ToggleControls variant="axis" aria-label={t("coach.impact.modeLabel")} data-testid={part === "condition" ? "K1-3-2" : undefined}>
            <ToggleButton onClick={() => setMode("marginal")} selected={mode === "marginal"}>{t(selected?.confidence === "activity-tss" ? "coach.impact.modeActivityTss" : "coach.impact.modeMarginal")}</ToggleButton>
            <ToggleButton onClick={() => setMode("actual")} selected={mode === "actual"}>{t("coach.impact.modeActual")}</ToggleButton>
          </ToggleControls>
        </div>
        <div className="fitness-coach__delta-grid">
          <MetricDelta label={t("coach.metric.ctl")} value={delta?.ctl ?? null} color="var(--lime)" />
          <MetricDelta label={t("coach.metric.atl")} value={delta?.atl ?? null} color="var(--rose)" />
          <MetricDelta label={t("coach.metric.tsb")} value={delta?.tsb ?? null} color="var(--amber)" />
        </div>
        <Text as="p" variant="caption" tone="tertiary" style={{ margin: "var(--space-3) 0 0" }}>
          {selectedPending ? pendingDescription : mode === "marginal" ? t(selected?.confidence === "activity-tss" ? "coach.impact.activityTssHelp" : "coach.impact.marginalHelp") : t("coach.impact.actualHelp")}
        </Text>
        {stimulus && (
          <div data-testid={part === "condition" ? "K1-3-3" : undefined} className="fitness-coach__stimulus">
            <div>
              <Text as="div" variant="eyebrow">{t("coach.stimulus.eyebrow")}</Text>
              <Text as="div" variant="bodyMedium" style={{ marginTop: "var(--space-2)" }}>{t(`coach.stimulus.type.${stimulus.workoutType}`)}</Text>
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
    </div>
  );

  const trainingChoiceCard = (
<div className="fitness-coach__primary-grid fitness-coach__primary-grid--choice">
        <ChoiceSurface data-testid={part === "today" ? "K2-1" : undefined} className="fitness-coach__choice-card">
          <Text as="div" variant="eyebrow">{t("coach.choice.eyebrow")}</Text>
          <Text data-testid={part === "today" && choiceTitle ? "K2-1-5" : undefined} as={part === "today" ? "h2" : "h3"} variant={part === "today" ? "title" : "subtitle"} style={{ margin: "var(--space-2) 0" }}>{choiceTitle ?? t(part === "condition" ? "condition.story.decisionTitle" : "coach.choice.title")}</Text>
          {canonicalAvailable && <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-4)" }}><GlossaryText>{t(part === "today" ? "today.genericWorkoutBasis" : "coach.choice.body")}</GlossaryText></Text>}
          {!canonicalAvailable && <Text as="p" variant="caption" tone="secondary">{t("today.forecastUnavailable")}</Text>}
          <fieldset className="fitness-coach__choices" disabled={awaitingAggregate || deliveryBusy}>
            <legend className="fitness-coach__sr-only">{t("coach.choice.legend")}</legend>
            {(["rest", "recovery", "endurance"] as const).map((choice) => (
              <label data-testid={part === "today" ? "K2-1-1" : undefined} key={choice} className="fitness-coach__choice" data-selected={trainingChoice === choice || undefined}>
                <input type="radio" name="fitness-training-choice" value={choice} checked={trainingChoice === choice} onChange={() => { setTrainingChoice(choice); setShowRestNotice(false); }} />
                <span>
                  <Text as="span" variant="bodyMedium">{t(`coach.choice.${choice}.${discipline}`)}</Text>
                  <Text as="span" variant="caption" tone="tertiary">{choice === "rest" ? t("coach.choice.noLoad") : t("coach.choice.load", { load: CHOICE_LOAD[choice] })}</Text>
                </span>
              </label>
            ))}
          </fieldset>
          {awaitingAggregate && <Text data-testid={part === "today" ? "K2-1-4" : undefined} as="p" variant="caption" tone="warning" style={{ margin: "var(--space-3) 0 0" }}>{t("coach.choice.pending")}</Text>}
          {pendingActivity && pendingDayLoad && <Text as="p" variant="caption" tone="tertiary" style={{ margin: "var(--space-3) 0 0" }}>{t("coach.choice.dayAggregateBasis")}</Text>}
          {choiceForecast && (
            <div data-testid={part === "today" ? "K2-1-2" : undefined} className="fitness-coach__forecast" aria-live="polite">
              {choiceForecast.map((point) => (
                <div key={point.hoursAhead}>
                  <Text as="div" variant="caption">{t("coach.choice.hours", { hours: point.hoursAhead })}</Text>
                  <Text as="div" variant="num" style={{ marginTop: "var(--space-1)", color: "var(--ink-1)" }}><GlossaryText>{`CTL ${point.ctl.toFixed(1)} · ATL ${point.atl.toFixed(1)} · TSB ${signed(point.tsb)}`}</GlossaryText></Text>
                </div>
              ))}
            </div>
          )}
          {part === "condition" ? <Text as="p" variant="caption" tone="tertiary" style={{ margin: "var(--space-3) 0 0" }}>{t("coach.choice.localOnly")}</Text> : !awaitingAggregate && discipline === "bike" && (deliveryEnabled || trainingChoice === "rest") ? trainingChoice === "rest" ? (
            <div className="fitness-coach__handoff">
              <Button data-testid={part === "today" ? "K2-1-3" : undefined} variant="primary" block onClick={() => setShowRestNotice(true)}>{t("coach.choice.restConfirm")}</Button>
              <Text as="p" variant="caption" tone="tertiary" role="status" style={{ margin: 0 }}>
                {t(showRestNotice ? "coach.choice.restNoticeExpanded" : "coach.choice.restNotice")}
              </Text>
            </div>
          ) : (
            <div data-testid={part === "today" ? "K2-3" : undefined}>
              {part === "today" && <Text as="h3" variant="subtitle">{t("today.simpleDeliveryTitle")}</Text>}
              <RiderWorkoutDeliveryPanel uid={userId} workoutType={trainingChoice} targetTss={CHOICE_LOAD[trainingChoice] as 20 | 45} onBusyChange={setDeliveryBusy} explicitWorkoutLabel={part === "today"} />
            </div>
          ) : !awaitingAggregate && part !== "today" ? <Text as="p" variant="caption" tone="tertiary" style={{ margin: "var(--space-4) 0 0" }}>{t(discipline === "bike" && !deliveryEnabled ? "today.deliveryUnavailable" : "coach.choice.localOnly")}</Text> : null}
        </ChoiceSurface>
      </div>
  );

  const currentSummary = (
      <SummarySurface id={part === "condition" ? "condition-current" : undefined} tabIndex={part === "condition" ? -1 : undefined} className={part === "condition" ? "condition-section-target" : undefined} data-testid={part === "condition" ? "K1-1" : undefined} >
        <div className="fitness-coach__summary">
          <div className="fitness-coach__summary-copy">
            {part === "condition" && statusSlot ? statusSlot : <>
              <Chip variant={conclusion.tone} dot>{t("coach.eyebrow")}</Chip>
              <Text as="h2" variant="title" data-testid={part === "condition" ? "K1-1-2" : undefined} id="fitness-coach-title" style={{ margin: "var(--space-3) 0 var(--space-2)" }}>{t(`coach.conclusion.${conclusion.key}.title`)}</Text>
              <Text as="p" variant="body" tone="secondary" style={{ margin: 0 }}>{t(`coach.conclusion.${conclusion.key}.body`)}</Text>
            </>}
          </div>
          <div data-testid={part === "condition" ? "K1-1-1" : undefined} className="fitness-coach__current-metrics">
            <Stat label={<GlossaryText>{t("coach.metric.ctl")}</GlossaryText>} value={current.ctl.toFixed(1)} />
            <Stat label={<GlossaryText>{t("coach.metric.atl")}</GlossaryText>} value={current.atl.toFixed(1)} />
            <Stat label={<GlossaryText>{t("coach.metric.tsb")}</GlossaryText>} value={signed(current.tsb)} />
          </div>
        </div>
        {part === "condition" && <div className="fitness-coach__story-primary-action"><LocalizedLink className={buttonClass({ variant: "primary", block: true })} data-testid="K1-1-3" to={`/coach/today?sport=${discipline}`}>{t("today.header.title")} →</LocalizedLink></div>}
        {currentBasis && <div className="fitness-coach__summary-meta">
          {part !== "condition" && (currentDate ? <Text variant="caption" tone="secondary">{t("coach.currentAsOf", { date: new Date(`${currentDate}T00:00:00.000Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" }) })}</Text>
            : <Text variant="caption" tone="secondary">{currentBasis}</Text>)}
          {(currentDate || part === "condition") && (part === "condition" ? <Text as="p" variant="caption" tone="tertiary" style={{ margin: 0 }}>{currentBasis}</Text> : <details className="fitness-coach__summary-source"><summary>{t("coach.currentBasisDetails")}</summary><Text as="p" variant="caption" tone="tertiary">{currentBasis}</Text></details>)}
        </div>}
        {metricsNoteSlot && <div className="fitness-coach__summary-evidence">{metricsNoteSlot}</div>}

      </SummarySurface>
  );

  return (
    <section aria-labelledby={mobilePriority || (part === "condition" && statusSlot) ? undefined : "fitness-coach-title"} className={`fitness-coach${mobilePriority ? " fitness-coach--mobile-priority" : ""}${part === "condition" ? " fitness-coach--story" : ""}`}>
      {part === "condition" ? <Card className="fitness-coach__story-hero">
        {currentSummary}
        {showConditionChoices && <div className="fitness-coach__story-choice">
          {trainingChoiceCard}
        </div>}
      </Card> : part !== "today" && !mobilePriority ? currentSummary : null}
      {part === "condition" && evidenceNavSlot}
      {part === "condition" && <div className="fitness-coach__evidence-heading"><Text as="h2" variant="title">{t("condition.story.evidenceTitle")}</Text><Text as="p" variant="bodySmall" tone="secondary">{t("condition.story.evidenceBody")}</Text></div>}

      <div className="fitness-coach__first-view">
        {trendSlot && <div className="fitness-coach__trend">{trendSlot}</div>}
        <div className="fitness-coach__today" id="fitness-coach-today">{decisionSlot}</div>
      </div>

      {part === "condition" && weekChangeSlot && <div className="fitness-coach__period-evidence">{weekChangeSlot}</div>}
      {part === "condition" ? activityImpact : part === "all" ? <DetailsSection title={t("coach.range.detailsTitle")}>
        <Text as="p" variant="bodySmall" tone="secondary" style={{ margin: "0 0 var(--space-4)" }}>{t("coach.range.body")}</Text>
        {activityImpact}
      </DetailsSection> : null}

      {part !== "condition" && trainingChoiceCard}

      {part === "all" && recentActivities && (
        <Card padding="none" style={{ padding: "var(--space-5)", marginTop: "var(--space-4)" }}>{recentActivities}</Card>
      )}
    </section>
  );
}
