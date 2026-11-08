import PlanRecordNavigation from "../../features/training/plan/PlanRecordNavigation";
import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";
import CoachSignInButton from "./CoachSignInButton";
import { useAuth } from "../../contexts/AuthContext";
import { EmptyState, LoadingSkeleton } from "../../components/redesign";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import GlossaryText from "../../components/common/GlossaryText";
import { TodayTrainingDecisionSource } from "../../features/trainingDecision/TodayTrainingDecisionCard";
import { TrainingDecisionSessionView } from "../../features/trainingDecision/TrainingDecisionSessionView";
import { canShowRecommendation, primaryEffectiveSession } from "../../features/trainingDecision/decisionPresentation";
import { CoachQuestionLauncher } from "../../features/coach/CoachQuestionLauncher";
import { activityIdsCoveredByImpacts, activityDayLoad, deriveActivityImpacts, forecastFitnessChoice48Hours } from "../../features/fitness/activityImpact";
import { isNegligibleActivitySummary } from "@shared/training/activityLoad";
import { Alert, Card, Text } from "../../theme/components";
import { useCoachFitnessModel } from "./CoachFitnessModelContext";
import "../../features/trainingDecision/training-decision.css";

type Sport = "bike" | "run" | "swim";

/** 24·48시간 변화 계산에 넣을 오늘 부하. 예정이 없거나 휴식이면 0, 예정 운동에 TSS 가 없으면 null(계산 불가). */
export function todayPlannedLoad(state: TodayTrainingDecisionState): { load: number; planned: boolean } | null {
  const session = state.decision?.scheduledSessions.length ? primaryEffectiveSession(state.decision) : null;
  if (!session || session.current.workout === "rest") return { load: 0, planned: false };
  return session.current.targetTss == null ? null : { load: session.current.targetTss, planned: true };
}

function signed(value: number): string {
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}

/** 오늘의 계획 — 예정 운동이 있으면 그 운동을, 없으면 없다는 한 줄만 보인다. */
function TodayPlan({ state }: { state: TodayTrainingDecisionState }) {
  const { t } = useCoachFitnessModel();
  if (state.loading) return <Card data-testid="K2-2" className="training-decision-card" aria-busy="true">
    <Text variant="body" tone="secondary">{t("training:decision.loading")}</Text></Card>;
  const decision = state.decision;
  if (!decision && state.unavailableReason === "error") return <Card data-testid="K2-2" className="training-decision-card" data-today-plan="error">
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

/** 24시간 후·48시간 후 변화 — 오늘 예정 운동(없으면 휴식)을 정본 CTL/ATL 모델에 넣은 예상. */
function TodayForecast({ state, awaitingAggregate }: { state: TodayTrainingDecisionState; awaitingAggregate: boolean }) {
  const { t, currentPoint, hasCanonicalTimeseries } = useCoachFitnessModel();
  if (state.loading) return null;
  const planned = todayPlannedLoad(state);
  const note = !currentPoint || !hasCanonicalTimeseries ? t("today.forecastUnavailable")
    : awaitingAggregate ? t("today.forecastPending")
    : planned == null ? t("today.forecastNoTss") : null;
  const points = note == null && currentPoint && planned ? forecastFitnessChoice48Hours(currentPoint, planned.load) : null;
  return <Card data-testid="K2-1" className="fitness-coach__choice-card">
    {points && planned && <Text as="p" variant="caption" tone="secondary" style={{ margin: "0 0 var(--space-3)" }}>
      {planned.planned ? t("today.forecastBasisPlanned", { tss: planned.load }) : t("today.forecastBasisRest")}</Text>}
    {points ? <div data-testid="K2-1-2" className="fitness-coach__forecast">
      {points.map((point) => <div key={point.hoursAhead} data-hours={point.hoursAhead}>
        <Text as="div" variant="caption">{t("today.forecastHours", { hours: point.hoursAhead })}</Text>
        <Text as="div" variant="num" style={{ marginTop: "var(--space-1)", color: "var(--ink-1)" }}>
          <GlossaryText>{`CTL ${point.ctl.toFixed(1)} · ATL ${point.atl.toFixed(1)} · TSB ${signed(point.tsb)}`}</GlossaryText></Text>
      </div>)}
    </div> : <Text as="p" variant="caption" tone="secondary" style={{ margin: 0 }}>{note}</Text>}
  </Card>;
}

/**
 * 코치 "오늘 훈련" — 오늘의 계획(있음/없음) · AI 코치에게 분석 요청 · 24시간 후·48시간 후 변화만 보인다(2026-11-09 사용자 결정).
 * 변경 권고 적용·운동 보내기·간단 운동 고르기는 두지 않는다 — 계획 변경은 계획 탭, 운동 시작은 앱에서 한다.
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
