import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import type { PlanDay } from "@shared/types/goal";
import RunPlanPreview from "../components/activity/RunPlanPreview";
import { useRunPlanTarget } from "../hooks/useRunPlanTarget";
import MobilePlanPage from "../components/mobile/MobilePlanPage";
import WorkoutEditModal from "../components/training/WorkoutEditModal";
import AdaptationBanner from "../components/training/AdaptationBanner";
import GuestValuePreview from "../components/guest/GuestValuePreview";
import { useAuth } from "../contexts/AuthContext";
import { useDialog } from "../contexts/DialogContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useToast } from "../contexts/ToastContext";
import PlanPresentation from "../features/training/plan/PlanPresentation";
import Run30EnrollCard from "../features/training/run30/Run30EnrollCard";
import Run30ProgramView from "../features/training/run30/Run30ProgramView";
import type { Run30StartMode } from "../features/training/run30/run30Start";
import { useRun30Program } from "../features/training/run30/useRun30Program";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import { ErrorState } from "../components/redesign";
import TodayTrainingDecisionCard from "../features/trainingDecision/TodayTrainingDecisionCard";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import { useMobile } from "../hooks/useMobile";
import { usePlanModel } from "../hooks/usePlanModel";
import { logClientError } from "../services/errorLogger";
import { downloadICS, generateICS } from "../utils/icsExport";

/*
 * Layout invariants now live in PlanPresentation:
 * PLAN_WEEK_GRID_COLUMNS = '80px repeat(7, minmax(72px, 1fr)) 100px'
 * overflowX: 'auto'
 * mobilePlanViewModel is shared by full-page and embedded rendering there.
 */

const WEB_START_MODE: Run30StartMode = { kind: "web" };

export default function PlanPage() {
  const { t, i18n } = useTranslation("training");
  const { t: tActivity } = useTranslation("activity");
  const { t: tCommon } = useTranslation("common");
  const { user } = useAuth();
  const { firestore, functions } = useFirebaseServices();
  const { showToast } = useToast();
  const dialog = useDialog();
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [searchParams] = useSearchParams();
  const model = usePlanModel(searchParams.get("sport"));
  const { discipline, goal, weeks, loading, loadError } = model;
  const run30 = useRun30Program(discipline === "run" && user != null);
  // 서버 관리 프로그램 목표는 계획 직접 쓰기(편집·추가·재생성·재설정·적응 적용)를 규칙이 거부한다.
  const serverManagedPlan = goal?.runProgram != null;
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const runTarget = useRunPlanTarget(searchParams, user?.uid, user?.isAnonymous === true, goal, weeks, loading || (!model.freshLoaded && !loadError), loadError, model.isTodayCell, setMobileWeekOffset);
  const [selectedDay, setSelectedDay] = useState<{
    day: PlanDay;
    weekId: string;
    dayIndex: number;
  } | null>(null);

  const exportPlanIcs = () => {
    if (!goal) return;
    const ics = generateICS(weeks, goal.courseName, tActivity);
    downloadICS(ics, `orider-plan-${goal.courseName}.ics`);
  };

  const rerollPlan = async () => {
    if (!goal) return;
    if (!(await dialog.confirm(t("confirmations.rerollConfirm"), { destructive: true }))) return;
    try {
      const reroll = httpsCallable(functions, "rerollPlan");
      await reroll({ goalId: goal.id });
      model.retryLoad();
      setMobileWeekOffset(0);
      showToast(t("plan.rerollSuccess"));
    } catch (error) {
      logClientError("PlanPage.rerollPlan", error, { goalId: goal.id });
      showToast(t("errors.rerollError"), "error");
    }
  };

  const abandonGoal = async () => {
    if (!goal) return;
    if (!(await dialog.confirm(t("confirmations.abandonConfirm"), { destructive: true }))) return;
    try {
      await updateDoc(doc(firestore, "goals", goal.id), {
        status: "abandoned",
        updatedAt: Date.now(),
      });
      navigate("/");
    } catch (error) {
      logClientError("PlanPage.abandonGoal", error, { goalId: goal.id });
      showToast(t("errors.abandonError"), "error");
    }
  };

  const renderPresentation = (decisionSlot?: ReactNode) => (
    <PlanPresentation
      model={model}
      decisionSlot={decisionSlot}
      adaptationSlot={goal?.adaptationFlag && !serverManagedPlan ? (
        <AdaptationBanner
          goalId={goal.id}
          flag={goal.adaptationFlag}
          onChange={model.retryLoad}
        />
      ) : undefined}
      mobileWeekOffset={mobileWeekOffset}
      onMobileWeekOffsetChange={setMobileWeekOffset}
      onEditWorkout={serverManagedPlan ? undefined : (day, weekId, dayIndex) => setSelectedDay({ day, weekId, dayIndex })}
      onIcsExport={exportPlanIcs}
      onReroll={serverManagedPlan ? undefined : rerollPlan}
      onGoalReset={serverManagedPlan ? undefined : () => navigate("/goal-setup")}
      onAbandon={abandonGoal}
      renderMobile={(props) => (
        <MobilePlanPage
          currentWeek={props.currentWeek}
          weekLabel={props.weekLabel}
          goalId={serverManagedPlan ? undefined : goal?.id}
          goalTitle={props.goalTitle}
          daysLeft={props.daysLeft}
          progressPct={props.progressPct}
          completedTSS={props.completedTSS}
          totalTSS={props.totalTSS}
          weeksLeft={props.weeksLeft}
          projectedCTL={props.projectedCTL}
          adaptationFlag={goal?.adaptationFlag}
          onWeekPrev={props.onWeekPrev}
          onWeekNext={props.onWeekNext}
          onEditWorkout={props.onEditWorkout}
          onPlanUpdate={() => {
            model.retryLoad();
            setMobileWeekOffset(0);
          }}
          onIcsExport={exportPlanIcs}
          onReroll={serverManagedPlan ? undefined : rerollPlan}
          onGoalReset={serverManagedPlan ? undefined : () => navigate("/goal-setup")}
          onAbandon={abandonGoal}
        />
      )}
    />
  );

  if (!user) {
    return <GuestValuePreview kind="plan" lang={i18n.language} />;
  }

  const targetNotice = runTarget.unavailable ? <p role="status" className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{tActivity("analysis.run.nextPlan.unavailable")}</p> : null;

  const refreshAfterEnroll = async () => {
    await run30.refresh();
    model.retryLoad();
  };

  if (discipline === "run") {
    const run30Program = run30.status === "ready" ? run30.program : null;
    // 미리보기는 일반 계획 경로와 같은 위치에 둬서 Run30 조회가 끝나도 다시 마운트되지 않게 한다.
    const shell = (content: ReactNode) => (
      <>
        {targetNotice}
        {runTarget.session && <RunPlanPreview session={runTarget.session} onClose={runTarget.close} />}
        <div className="site-shell" style={{ paddingBottom: "var(--space-8)" }}>
          <div style={{ padding: "var(--space-4) 0 var(--space-3)", borderBottom: "1px solid var(--line-soft)", marginBottom: "var(--space-4)" }}>
            <DisciplineTabs />
          </div>
          {content}
        </div>
      </>
    );
    if (run30Program) {
      return shell(
        <Run30ProgramView api={run30.api} program={run30Program} onRefresh={run30.refresh} startMode={WEB_START_MODE} />,
      );
    }
    if (run30.status === "loading") {
      return shell(<p role="status" style={{ color: "var(--ink-3)" }}>{tCommon("button.loading")}</p>);
    }
    if (run30.status === "error" && !goal && !loading) {
      return shell(<ErrorState title={t("run30.errors.load")} onRetry={run30.retry} />);
    }
    if (!loading && !loadError && (!goal || goal.discipline !== "run")) {
      return shell(<Run30EnrollCard api={run30.api} variant="intro" onEnrolled={refreshAfterEnroll} showCustomGoalLink />);
    }
  }

  const run30Offer = discipline === "run" && run30.status === "ready" && goal?.discipline === "run" && !serverManagedPlan
    ? <Run30EnrollCard api={run30.api} variant="offer" onEnrolled={refreshAfterEnroll} />
    : null;

  if (!loading && loadError) {
    return <>{targetNotice}{renderPresentation(
      <TodayTrainingDecisionCard user={user} discipline={discipline} surface="plan" />,
    )}</>;
  }

  if (!loading && !goal) {
    return <>{targetNotice}{renderPresentation()}</>;
  }

  return (
    <>
      {targetNotice}
      {runTarget.session && <RunPlanPreview session={runTarget.session} onClose={runTarget.close} />}
      {renderPresentation(
        <>
          {run30Offer}
          <TodayTrainingDecisionCard user={user} discipline={discipline} surface="plan" />
        </>,
      )}
      {selectedDay && goal && !serverManagedPlan && (
        <WorkoutEditModal
          day={selectedDay.day}
          weekId={selectedDay.weekId}
          weekAdjustmentReason={weeks.find((week) => week.id === selectedDay.weekId)?.adjustmentReason}
          dayIndex={selectedDay.dayIndex}
          goalId={goal.id}
          goalDiscipline={goal.discipline as "bike" | "run" | "swim" | undefined}
          onClose={() => setSelectedDay(null)}
          onUpdate={() => {
            setSelectedDay(null);
            if (isMobile) {
              model.retryLoad();
            } else {
              void model.refreshPlanWeeks();
            }
          }}
        />
      )}
    </>
  );
}
