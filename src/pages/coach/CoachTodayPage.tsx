import { useRun30Start, type Run30StartMode } from "../../features/training/run30/run30Start";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";
import GlossaryText from "../../components/common/GlossaryText";
import CoachSignInButton from "./CoachSignInButton";
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../../components/LocalizedLink";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/redesign";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import FitnessCoachBriefing from "../../features/fitness/components/FitnessCoachBriefing";
import TodayTrainingDecisionCard, { TodayTrainingDecisionSource } from "../../features/trainingDecision/TodayTrainingDecisionCard";
import { activityIdsCoveredByImpacts, activityDayLoad, deriveActivityImpacts, forecastFitness48Hours } from "../../features/fitness/activityImpact";
import { isNegligibleActivitySummary } from "@shared/training/activityLoad";
import { useRun30Program, type Run30ProgramState } from "../../features/training/run30/useRun30Program";
import { buildRun30ViewModel, run30DateLabel, run30StatusLabel, run30StatusTone, run30TodayHeadingKey } from "../../features/training/run30/run30Display";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../../constants/appStoreLinks";
import Run30WorkoutOutline from "../../features/training/run30/Run30WorkoutOutline";
import { Button, Card, Chip, Text, buttonClass } from "../../theme/components";
import { useCoachFitnessModel } from "./CoachFitnessLayout";
import { useTodayWorkoutChoice } from "../../hooks/useTodayWorkoutChoice";

const WEB_START_MODE: Run30StartMode = { kind: "web" };
export function RunningToday({ state, allowStart = false, startMode = WEB_START_MODE }: {
  state: Run30ProgramState; allowStart?: boolean; startMode?: Run30StartMode;
}) {
  const { t } = useTranslation("fitness");
  const { t: trainingT, i18n } = useTranslation("training");
  const start = useRun30Start(startMode);
  if (state.status === "loading") return <LoadingSkeleton kind="chart" />;
  if (state.status === "error") return <div className="coach-inline-error" role="alert"><Text>{trainingT("coachSurface.runProgramError")}</Text><Button variant="secondary" size="sm" onClick={state.retry}>{trainingT("coachSurface.retry")}</Button></div>;
  if (!state.program) return <Link data-testid="K2-3-9" to="/coach/plan?sport=run">{t("today.runProgramLink")}</Link>;
  const view = buildRun30ViewModel(state.program);
  const actionable = view.todayKind === "start";
  return <Card data-testid="K2-3-7" className="run30-running-today">
    <Text as="h2" variant="title">{trainingT(run30TodayHeadingKey(view.todayKind))}</Text>
    {!actionable && <Text as="p" variant="body">{trainingT(view.todayKind === "finished" ? "run30.today.finished" : view.todayKind === "rest" ? "run30.today.restHint" : view.todayKind === "decide" ? "run30.today.decideHold" : "run30.today.holdFallback")}</Text>}
    {view.next && <>
      <div className="run30-running-today__meta"><Text as="p" variant="body"><time dateTime={view.next.localDate}>{run30DateLabel(view.next.localDate, i18n.resolvedLanguage ?? i18n.language)}</time> · {trainingT("run30.stages.stage", { stage: view.next.stage })}</Text><Chip variant={run30StatusTone(view.next.status)}>{run30StatusLabel(view.next.status, trainingT)}</Chip></div>
      <Text as="p" variant="bodyMedium" weight={600}>{view.next.workoutName || trainingT("run30.today.workoutFallback")}</Text>
      <Run30WorkoutOutline session={view.next} />
    </>}
    {actionable && <Text as="p" variant="body">{!allowStart ? t("today.runReadOnly") : startMode.kind === "host-unsupported" ? trainingT("run30.start.hostUnsupported") : startMode.kind === "web" ? t("today.runAppOnly") : null}</Text>}
    {actionable && allowStart && startMode.kind === "host" && view.next?.scheduledSessionId && <>
      <Button loading={start.state.status === "pending"} disabled={start.state.status === "pending" || start.state.status === "accepted"}
        onClick={() => void start.start(view.next?.scheduledSessionId)}>{trainingT("run30.start.button", { stage: view.next.stage })}</Button>
      {start.state.status === "accepted" && <Text role="status">{trainingT("run30.start.accepted")}</Text>}
      {start.state.status === "error" && <Text role="alert">{trainingT(`run30.start.errors.${start.state.reason}`)}</Text>}
    </>}
    <div className="run30-running-today__stores"><Text as="span" variant="bodySmall" tone="secondary">{trainingT("run30.outline.appStart")}</Text><a href={ORIDER_PLAY_STORE_URL}>Google Play</a><a href={ORIDER_APP_STORE_URL}>App Store</a></div>
    <div className="run30-running-today__plan"><Link className={buttonClass({ variant: "secondary" })} data-testid="K2-3-9" to="/coach/plan?sport=run">{t(actionable && startMode.kind === "web" ? "today.runPlanSchedule" : "today.runProgramLink")}</Link></div>
  </Card>;
}

export function canUseTodayHelpers(state: TodayTrainingDecisionState, now: number, sport: "bike" | "run" | "swim"): boolean {
  return !state.loading && !state.unavailable && state.decision != null
    && state.decision.targetDiscipline === sport
    && state.decision.healthGate.state === "clear"
    && Number.isFinite(state.decision.scheduledProjectionValidUntil) && state.decision.scheduledProjectionValidUntil > now;
}

export default function CoachTodayPage() {
  const model = useCoachFitnessModel();
  const { t, user, discipline, currentPoint, i18n } = model;
  const sport = discipline === "tri" ? "bike" : discipline;
  const running = useRun30Program(sport === "run");
  const todayChoice = useTodayWorkoutChoice(user?.uid, sport === "run" ? "run" : "bike");
  const header = <header className="coach-page-header" data-testid="K2-0"><Text as="h1" data-testid="K2-0-1" variant="pageTitle">{t("today.header.title")}</Text><div data-testid="K2-0-2"><DisciplineTabs value={sport} disabledKeys={["swim"]} /></div>{currentPoint && <div className="coach-current-state"><GlossaryText>{t("coach.metric.tsb")}</GlossaryText><Link data-testid="K2-0-3" aria-label={`${t("coach.metric.tsb")} ${currentPoint.tsb.toFixed(1)}`} to={`/coach/condition?sport=${sport}`}><strong>{currentPoint.tsb.toFixed(1)}</strong></Link></div>}</header>;
  if (!user) return <div className="site-shell">{header}<EmptyState title={t("today.guest")}  /><CoachSignInButton /></div>;
  const impacts = model.hasCanonicalTimeseries ? deriveActivityImpacts(model.fitnessData, model.disciplineActivities, { limit: 6, dateKeyBasis: model.fitnessDateKeyBasis }) : [];
  const covered = activityIdsCoveredByImpacts(model.disciplineActivities, impacts);
  const newest = model.disciplineActivities.filter(a => !isNegligibleActivitySummary(a.summary)).reduce<(typeof model.disciplineActivities)[number] | null>((latest, a) => !latest || a.startTime > latest.startTime ? a : latest, null);
  const pending = newest && !covered.has(newest.id) ? newest : null;
  const dayLoad = pending && model.hasCanonicalTimeseries ? activityDayLoad(pending, model.fitnessData, model.fitnessDateKeyBasis) : null;
  const loading = model.loading || !model.timeseriesLoaded;
  return <div className="site-shell fitness-reading" style={{ padding: "var(--space-5) var(--space-4)" }}>
    {header}
    <TodayTrainingDecisionSource user={user} discipline={sport}>{state => {
      const hasScheduled = Boolean(state.decision?.scheduledSessions.length);
      const healthBlocked = state.decision != null && state.decision.healthGate.state !== "clear";
      const deliveryEnabled = getRuntimeConfig().riderWorkoutDeliveryEnabled === true && canUseTodayHelpers(state, Date.now(), sport);
      const chooser = loading ? <LoadingSkeleton kind="chart" /> : model.error ? <ErrorState title={t("error.dataFailed")} description={model.error} onRetry={model.retryLoad} /> : !healthBlocked ? <>
        {!currentPoint && <EmptyState title={t("empty.noActivities")} description={t("empty.hint")} />}
        <FitnessCoachBriefing part="today" impacts={impacts} selectedActivityId={null} onSelectActivity={() => undefined}
          forecast={currentPoint && model.hasCanonicalTimeseries ? forecastFitness48Hours(currentPoint, 35) : null}
          current={currentPoint ?? { ctl: 0, atl: 0, tsb: 0 }} decisionSlot={null} locale={i18n.language}
          canonicalAvailable={Boolean(currentPoint && model.hasCanonicalTimeseries)} pendingActivity={pending} pendingDayLoad={dayLoad}
          discipline={sport} userId={user.uid} deliveryEnabled={deliveryEnabled}
          choiceTitle={t(hasScheduled ? "today.planAlternative" : "today.simpleWorkout")}
          todayChoice={sport === "swim" ? undefined : todayChoice} />
      </> : null;
      const decision = <TodayTrainingDecisionCard user={user} discipline={sport} surface="today" decisionState={state}
        suppressExecution={sport === "run" && (running.status !== "ready" || Boolean(running.program?.next))} />;
      return <>
        {hasScheduled || healthBlocked ? decision : chooser}
        {!hasScheduled && !healthBlocked && (state.loading || state.unavailableReason === "error") && decision}
        {hasScheduled && chooser}
        <div className="coach-today-plan-handoff" style={{ display: "grid", gap: "var(--space-2)", marginBlock: "var(--space-4)" }}>
          {state.unavailableReason === "disabled" && <Text as="p" variant="caption" tone="secondary">{t("today.decisionUnavailable")}</Text>}
          <Link to={`/coach/plan?sport=${sport}`}>{t("today.planLink")}</Link>
        </div>
        {sport === "run" && <RunningToday state={running} allowStart={canUseTodayHelpers(state, Date.now(), sport)} />}
      </>;
    }}</TodayTrainingDecisionSource>
  </div>;
}
