import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";
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
import { buildRun30ViewModel, run30Duration } from "../../features/training/run30/run30Display";
import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../../constants/appStoreLinks";
import { Card, Text } from "../../theme/components";
import { useCoachFitnessModel } from "./CoachFitnessLayout";

export function RunningToday({ state }: { state: Run30ProgramState }) {
  const { t } = useTranslation("fitness");
  const { t: trainingT } = useTranslation("training");
  if (state.status === "loading") return <LoadingSkeleton kind="chart" />;
  if (state.status === "error") return <ErrorState title={t("error.dataFailed")} onRetry={state.retry} />;
  if (!state.program) return <Link to="/coach/plan?sport=run">{t("today.runProgramLink")}</Link>;
  const view = buildRun30ViewModel(state.program);
  const actionable = view.todayKind === "start";
  return <Card>
    <Text as="h2" variant="title">{trainingT("run30.today.eyebrow")}</Text>
    {!actionable && <Text as="p" variant="body">{trainingT(view.todayKind === "finished" ? "run30.today.finished" : view.todayKind === "rest" ? "run30.today.restHint" : "run30.today.holdTitle")}</Text>}
    {view.next && <Text as="p" variant="body">{run30Duration(view.next.durationSec, trainingT)}</Text>}
    {actionable && <Text as="p" variant="body">{t("today.runAppOnly")}</Text>}
    {view.next?.localDate && <Text as="p" variant="body">{view.next.localDate} · {view.next.workoutName}</Text>}
    {view.next?.segments.map(segment => <Text as="p" variant="bodySmall" key={segment.stepId}>{segment.label} · {run30Duration(segment.durationSec, trainingT)}</Text>)}
    {actionable && <a href="/ko/plan?sport=run">{t("today.openApp")}</a>}
    <a href={ORIDER_PLAY_STORE_URL}>Google Play</a> · <a href={ORIDER_APP_STORE_URL}>App Store</a>
    <Link to="/coach/plan?sport=run">{t("today.runProgramLink")}</Link>
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
  const header = <><Text as="h1" variant="pageTitle">{t("today.header.title")}</Text><DisciplineTabs /></>;
  if (!user) return <div className="site-shell">{header}<EmptyState title={t("today.guest")}  /><CoachSignInButton /></div>;
  const impacts = model.hasCanonicalTimeseries ? deriveActivityImpacts(model.fitnessData, model.disciplineActivities, { limit: 6 }) : [];
  const covered = activityIdsCoveredByImpacts(model.disciplineActivities, impacts);
  const newest = model.disciplineActivities.filter(a => !isNegligibleActivitySummary(a.summary)).reduce<(typeof model.disciplineActivities)[number] | null>((latest, a) => !latest || a.startTime > latest.startTime ? a : latest, null);
  const pending = newest && !covered.has(newest.id) ? newest : null;
  const dayLoad = pending && model.hasCanonicalTimeseries ? activityDayLoad(pending, model.fitnessData) : null;
  const loading = model.loading || !model.timeseriesLoaded;
  return <div className="site-shell fitness-reading" style={{ padding: "var(--space-5) var(--space-4)" }}>
    {header}
    {currentPoint && <Link to={`/coach/condition?sport=${sport}`}>TSB {currentPoint.tsb.toFixed(1)} · {t("today.conditionLink")}</Link>}
    <TodayTrainingDecisionSource user={user} discipline={sport}>{state => <>
      <TodayTrainingDecisionCard user={user} discipline={sport} surface="today" decisionState={state} suppressExecution={sport === "run" && (running.status !== "ready" || Boolean(running.program?.next))} />
      <Link to={`/coach/plan?sport=${sport}`}>{t("today.planLink")}</Link>
      {loading ? <LoadingSkeleton kind="chart" /> : model.error ? <ErrorState title={t("error.dataFailed")} description={model.error} /> : currentPoint && model.hasCanonicalTimeseries && canUseTodayHelpers(state, Date.now(), sport) ? <>
        <Text as="h2" variant="title">{t("today.simpleWorkout")}</Text>
        <FitnessCoachBriefing part="today" impacts={impacts} selectedActivityId={null} onSelectActivity={() => undefined}
          forecast={forecastFitness48Hours(currentPoint, 35)} current={currentPoint} decisionSlot={null} locale={i18n.language}
          canonicalAvailable={model.hasCanonicalTimeseries} pendingActivity={pending} pendingDayLoad={dayLoad}
          discipline={sport} userId={user.uid} />
      </> : !currentPoint ? <EmptyState title={t("empty.noActivities")} description={t("empty.hint")} /> : null}
      {sport === "run" && canUseTodayHelpers(state, Date.now(), sport) && <RunningToday state={running} />}
    </>}</TodayTrainingDecisionSource>
  </div>;
}
