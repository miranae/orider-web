import PlanRecordNavigation from "../../features/training/plan/PlanRecordNavigation";
import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";
import CoachSignInButton from "./CoachSignInButton";
import { useAuth } from "../../contexts/AuthContext";
import { EmptyState, LoadingSkeleton } from "../../components/redesign";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import { TodayTrainingDecisionSource } from "../../features/trainingDecision/TodayTrainingDecisionCard";
import { TrainingDecisionSessionView } from "../../features/trainingDecision/TrainingDecisionSessionView";
import { canShowRecommendation, primaryEffectiveSession } from "../../features/trainingDecision/decisionPresentation";
import { CoachQuestionLauncher } from "../../features/coach/CoachQuestionLauncher";
import { activityIdsCoveredByImpacts, activityDayLoad, deriveActivityImpacts } from "../../features/fitness/activityImpact";
import { isNegligibleActivitySummary } from "@shared/training/activityLoad";
import { Alert, Card, Text } from "../../theme/components";
import { useCoachFitnessModel } from "./CoachFitnessModelContext";
import "../../features/trainingDecision/training-decision.css";

type Sport = "bike" | "run" | "swim";

/** 오늘의 계획 — 예정 운동이 있으면 그 운동을, 없으면 없다는 한 줄만 보인다. */
function TodayPlan({ state }: { state: TodayTrainingDecisionState }) {
  const { t } = useCoachFitnessModel();
  if (state.loading) return <Card data-testid="K2-2" className="training-decision-card" aria-busy="true">
    <Text variant="body" tone="secondary">{t("training:decision.loading")}</Text></Card>;
  const decision = state.decision;
  if (!decision || state.unavailable) return <Card data-testid="K2-2" className="training-decision-card" data-today-plan={state.unavailableReason === "error" ? "error" : "unavailable"}>
    <Text as="span" variant="bodyMedium">{t("training:decision.eyebrow")}</Text>
    <Text as="p" variant="body" tone="secondary" style={{ margin: 0 }}>{t("training:decision.fallback.unavailableBody")}</Text>
  </Card>;
  const session = decision?.scheduledSessions.length ? primaryEffectiveSession(decision) : null;
  const extraCount = decision ? Math.max(0, decision.scheduledSessions.length - 1) : 0;
  return <Card data-testid="K2-2" className="training-decision-card" data-today-plan={session ? "scheduled" : "none"}>
    <Text as="span" variant="bodyMedium">{t("training:decision.eyebrow")}</Text>
    {decision?.healthGate.state === "stop" && <Alert data-testid="K2-2-3" variant="danger" title={t("training:decision.healthStop")} />}
    {session ? <div data-testid="K2-2-1" className="training-decision-card__sessions">
      <TrainingDecisionSessionView label={t("training:decision.effectiveScheduled")} session={session} tone="effective" />
      {extraCount > 0 && <Text as="p" variant="caption" tone="secondary">{t("training:decision.extraSessions", { count: extraCount })}</Text>}
    </div> : <Text as="p" variant="body" tone="secondary" style={{ margin: 0 }}>{t("training:decision.noScheduled")}</Text>}
  </Card>;
}

/** AI 코치에게 분석 요청 — 오늘 권고가 있으면 그 처방을 근거로, 없으면 일반 질문으로 연다. */
function TodayAskCoach({ state, sport }: { state: TodayTrainingDecisionState; sport: Sport }) {
  const { t, user } = useCoachFitnessModel();
  const { signIn } = useAuth();
  const decision = state.decision;
  const source = decision && decision.healthGate.state === "clear" && canShowRecommendation(decision)
    && decision.capabilities.explain === "available" ? decision.recommendationSource : null;
  return <div data-testid="K2-5" className="coach-today-ask">
    <CoachQuestionLauncher user={user} discipline={sport} onSignIn={() => void signIn()} triggerBlock
      triggerLabel={t("training:decision.askCoach")}
      progressPlannerSelection={source ? { question: t("training:decision.coachQuestion"),
        context: { prescriptionId: source.prescriptionId, sourceRequestId: source.sourceRequestId } } : null} />
  </div>;
}

/** 서버 정본 예측 계약이 제공되기 전에는 브라우저에서 CTL/ATL/TSB를 계산하지 않는다(P6).
 * 대표 세션이나 임의의 휴식 부하로 하루 전체 계획을 대신하지 않는다.
 */
function TodayForecast({ state, awaitingAggregate }: { state: TodayTrainingDecisionState; awaitingAggregate: boolean }) {
  const { t } = useCoachFitnessModel();
  if (state.loading) return null;
  const note = awaitingAggregate ? t("today.forecastPending")
    : state.unavailable || !state.decision ? t("today.forecastPlanUnavailable")
    : t("today.forecastUnavailable");
  return <Card data-testid="K2-1" className="fitness-coach__choice-card">
    <Text as="p" variant="caption" tone="secondary" style={{ margin: 0 }}>{note}</Text>
  </Card>;
}

/**
 * 코치 "오늘 훈련" — 오늘의 계획(있음/없음) · AI 코치에게 분석 요청 · 24시간 후·48시간 후 변화만 보인다(2026-11-09 사용자 결정).
 * 변경 권고 적용·운동 보내기·간단 운동 고르기는 두지 않는다 — 계획 변경은 계획 탭, 운동 시작은 앱에서 한다.
 * #1554의 명시적 화면 재배치다. 러닝 단계·구성·보류는 PlanView의 Run30ProgramView에 유지되고,
 * PlanSurface는 협상된 scheduledRunStarter를 그 뷰에 전달해 앱 시작을 유지한다.
 * PlanRecordNavigation은 sport=run을 계획 탭에 전달한다(각 화면의 run30·navigation 회귀 테스트).
 */
export default function CoachTodayPage() {
  const model = useCoachFitnessModel();
  const { t, user, discipline } = model;
  const sport: Sport = discipline === "tri" ? "bike" : discipline;
  const header = <header className="coach-page-header" data-testid="K2-0"><Text as="h1" data-testid="K2-0-1" variant="pageTitle">{t("today.header.title")}</Text><div data-testid="K2-0-2"><DisciplineTabs value={sport} disabledKeys={["swim"]} /></div></header>;
  if (!user) return <div className="site-shell">{header}<EmptyState title={t("today.guest")}  /><CoachSignInButton /></div>;
  const impacts = model.hasCanonicalTimeseries ? deriveActivityImpacts(model.fitnessData, model.disciplineActivities, { limit: 6, dateKeyBasis: model.fitnessDateKeyBasis }) : [];
  const covered = activityIdsCoveredByImpacts(model.disciplineActivities, impacts);
  const newest = model.disciplineActivities.filter(a => !isNegligibleActivitySummary(a.summary)).reduce<(typeof model.disciplineActivities)[number] | null>((latest, a) => !latest || a.startTime > latest.startTime ? a : latest, null);
  const pending = newest && !covered.has(newest.id) ? newest : null;
  // 최근 활동의 하루 부하가 아직 정본에 반영되지 않았으면 변화를 계산하지 않는다(반영 전 값으로 오도하지 않는다).
  const awaitingAggregate = pending != null
    && (!model.hasCanonicalTimeseries || activityDayLoad(pending, model.fitnessData, model.fitnessDateKeyBasis) == null);
  const loading = model.loading || !model.timeseriesLoaded;
  return <div className="site-shell fitness-reading coach-today" style={{ padding: "0 var(--space-4) var(--space-5)" }}>
    {header}
    <PlanRecordNavigation />
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <TodayTrainingDecisionSource user={user} discipline={sport}>{state => <>
        <TodayPlan state={state} />
        <TodayAskCoach state={state} sport={sport} />
        {loading ? <LoadingSkeleton kind="chart" /> : <TodayForecast state={state} awaitingAggregate={awaitingAggregate} />}
      </>}</TodayTrainingDecisionSource>
    </div>
  </div>;
}
