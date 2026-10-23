import { isSportUiEnabled } from "../config/sportFeatures";
import PlanRecordNavigation from "../features/training/plan/PlanRecordNavigation";
import PlanLoadComparison from "../features/training/plan/PlanLoadComparisonPanel";
import { Button, Text } from "../theme/components";
import { planDayKey } from "@shared/training/planDate";
import { LocalizedLink } from "../components/LocalizedLink";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useLocation } from "react-router-dom";
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
  const { user, profile } = useAuth();
  const { firestore, functions } = useFirebaseServices();
  const { showToast } = useToast();
  const dialog = useDialog();
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const requestedSport = searchParams.get("sport");
  const planSport = requestedSport === "run" || requestedSport === "swim" && isSportUiEnabled(requestedSport) ? requestedSport : "bike";
  const model = usePlanModel(planSport);
  useEffect(() => {
    if (requestedSport == null || requestedSport === planSport) return;
    const next = new URLSearchParams(searchParams);
    next.set("sport", planSport);
    navigate(`${location.pathname}?${next}${location.hash}`, { replace: true });
  }, [requestedSport, planSport, searchParams, navigate, location.pathname, location.hash]);
  const { discipline, goal, weeks, loading, loadError } = model;
  const run30 = useRun30Program(discipline === "run" && user != null);
  // 서버 관리 프로그램 목표는 계획 직접 쓰기(편집·추가·재생성·재설정·적응 적용)를 규칙이 거부한다.
  const serverManagedPlan = goal?.runProgram != null;
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
  const runTarget = useRunPlanTarget(searchParams, user?.uid, user?.isAnonymous === true, goal, weeks, loading || (!model.freshLoaded && !loadError), loadError, model.isTodayCell, setMobileWeekOffset);
  const targetDate = searchParams.get("date");
  useEffect(() => {
    if (loading || searchParams.has("weekId") || searchParams.has("dayIndex") || !targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return;
    const target = weeks.findIndex(week => week.days.some(day => planDayKey(day.date) === targetDate));
    if (target < 0) return;
    const today = weeks.findIndex(week => week.days.some(model.isTodayCell));
    const future = weeks.findIndex(week => week.days.some(day => day.date >= Date.now()));
    const current = today >= 0 ? today : future >= 0 ? future : Math.max(0, weeks.length - 1);
    setMobileWeekOffset(target - current);
  }, [targetDate, weeks, loading, model.isTodayCell, searchParams]);
  useEffect(() => {
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || loading) return;
    const frame = requestAnimationFrame(() => document.querySelector(`[data-plan-date="${targetDate}"]`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }));
    return () => cancelAnimationFrame(frame);
  }, [targetDate, loading, mobileWeekOffset, weeks]);
  const [selectedDay, setSelectedDay] = useState<{
    owner: string;
    goalId: string;
    day: PlanDay;
    weekId: string;
    dayIndex: number;
  } | null>(null);

  const selectionOwner = `${user?.uid ?? ""}:${discipline}:${goal?.id ?? ""}`;
  useEffect(() => { setSelectedDay(null); }, [selectionOwner]);

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

  const todayWeek = weeks.findIndex(week => week.days.some(model.isTodayCell));
  const futureWeek = weeks.findIndex(week => week.days.some(day => day.date >= Date.now()));
  const currentWeek = todayWeek >= 0 ? todayWeek : futureWeek >= 0 ? futureWeek : Math.max(0, weeks.length - 1);
  const visibleWeekIndex = Math.max(0, Math.min(weeks.length - 1, currentWeek + mobileWeekOffset));
  const renderPresentation = (decisionSlot?: ReactNode) => (
    <PlanPresentation
      model={model}
      selectedDate={targetDate ?? undefined}
      decisionSlot={decisionSlot}
      adaptationSlot={goal?.adaptationFlag && !serverManagedPlan ? (
        <AdaptationBanner
          goalId={goal.id}
          flag={goal.adaptationFlag}
          onChange={model.retryLoad}
        />
      ) : undefined}
      mobileWeekOffset={mobileWeekOffset}
      onMobileWeekOffsetChange={(offset) => {
        setMobileWeekOffset(offset);
        const day = weeks[Math.max(0, Math.min(weeks.length - 1, currentWeek + offset))]?.days[0];
        if (!day) return;
        const next = new URLSearchParams(searchParams);
        ["weekId", "dayIndex", "detail"].forEach(key => next.delete(key));
        next.set("date", planDayKey(day.date));
        navigate(`${location.pathname}?${next}${location.hash}`);
      }}
      onEditWorkout={serverManagedPlan ? undefined : (day, weekId, dayIndex) => {
        if (!goal) return;
        setSelectedDay({ owner: selectionOwner, goalId: goal.id, day, weekId, dayIndex });
        const next = new URLSearchParams(searchParams);
        ["weekId", "dayIndex", "detail"].forEach(key => next.delete(key));
        next.set("date", planDayKey(day.date));
        navigate(`${location.pathname}?${next}${location.hash}`, { replace: true });
      }}
      onIcsExport={exportPlanIcs}
      onReroll={serverManagedPlan ? undefined : rerollPlan}
      onGoalReset={serverManagedPlan ? undefined : () => navigate(`/coach/goals?sport=${discipline}&new=1&returnTo=${encodeURIComponent(`/coach/plan?sport=${discipline}`)}`)}
      onAbandon={abandonGoal}
      renderMobile={(props) => (
        <MobilePlanPage key={selectionOwner}
          nextAction={props.nextAction}
          selectedDate={props.selectedDate}
          currentWeek={props.currentWeek}
          weekLabel={props.weekLabel}
          goalId={serverManagedPlan ? undefined : goal?.id}
          goalTitle={props.goalTitle}
          goalDiscipline={props.goalDiscipline}
          goalDate={props.goalDate}
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
          onGoalReset={serverManagedPlan ? undefined : () => navigate(`/coach/goals?sport=${discipline}&new=1&returnTo=${encodeURIComponent(`/coach/plan?sport=${discipline}`)}`)}
          onAbandon={abandonGoal}
        />
      )}
    />
  );

  if (!user) {
    return <GuestValuePreview kind="plan" lang={i18n.language} />;
  }

  const visibleDays = weeks[visibleWeekIndex]?.days ?? [];
  const selectedDate = selectedDay?.owner === selectionOwner ? planDayKey(selectedDay.day.date) : targetDate;
  const recordDate = selectedDate && (!model.goalMatchesDiscipline || visibleDays.some(day => planDayKey(day.date) === selectedDate))
    ? selectedDate : planDayKey(visibleDays[0]?.date ?? Date.now());
  const loadComparison = model.goalMatchesDiscipline && goal && weeks.length > 0 && !loading && !loadError && !user.isAnonymous ? <div className="site-shell"><PlanLoadComparison key={selectionOwner} uid={user.uid} discipline={discipline} weeks={weeks} selectedDate={targetDate ?? undefined} ftp={profile?.ftp} /></div> : null;
  const goalLink = <><header data-testid="K4-0" className="site-shell coach-page-header"><Text data-testid="K4-0-1" as="h1" variant="pageTitle">{t("mobile.weeklyPlan")}</Text><div data-testid="K4-0-2"><DisciplineTabs value={discipline} disabledKeys={["swim"]} /></div>{goal && <LocalizedLink data-testid="K4-2-4" to={`/coach/goals?sport=${discipline}`}>{t("goalHub.title")} →</LocalizedLink>}</header><PlanRecordNavigation date={recordDate} />{loadComparison}{model.goalMatchesDiscipline && weeks.length > 0 && (mobileWeekOffset !== 0 || targetDate) && <Button variant="ghost" onClick={() => {
    setMobileWeekOffset(0);
    const next = new URLSearchParams(searchParams);
    ["date", "weekId", "dayIndex", "detail"].forEach(key => next.delete(key));
    navigate(`/coach/plan?${next}`, { replace: true });
  }}>{t("planRecords.currentPlan")} →</Button>}</>;
  const targetNotice = runTarget.unavailable ? <p role="status" className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>{tActivity("analysis.run.nextPlan.unavailable")}</p> : null;

  const refreshAfterProgramChange = async () => {
    await run30.refresh();
    model.retryLoad();
  };

  if (discipline === "run") {
    const run30Program = run30.status === "ready" ? run30.program : null;
    // 미리보기는 일반 계획 경로와 같은 위치에 둬서 Run30 조회가 끝나도 다시 마운트되지 않게 한다.
    const shell = (content: ReactNode) => (
      <>
        {goalLink}{targetNotice}
        {runTarget.session && <RunPlanPreview session={runTarget.session} onClose={runTarget.close} />}
        <div className="site-shell" style={{ paddingBottom: "var(--space-8)" }}>
          <div style={{ padding: "var(--space-4) 0 var(--space-3)", borderBottom: "1px solid var(--line-soft)", marginBottom: "var(--space-4)" }}>

          </div>
          {content}
        </div>
      </>
    );
    if (run30Program) {
      return shell(
        <Run30ProgramView api={run30.api} program={run30Program} onRefresh={refreshAfterProgramChange} startMode={WEB_START_MODE} />,
      );
    }
    if (run30.status === "loading") {
      return shell(<p role="status" style={{ color: "var(--ink-3)" }}>{tCommon("button.loading")}</p>);
    }
    if (run30.status === "error" && !goal && !loading) {
      return shell(<ErrorState title={t("run30.errors.load")} onRetry={run30.retry} />);
    }
    if (!loading && !loadError && (!goal || goal.discipline !== "run")) {
      return shell(<Run30EnrollCard api={run30.api} variant="intro" onEnrolled={refreshAfterProgramChange} showCustomGoalLink />);
    }
  }

  const run30Offer = discipline === "run" && run30.status === "ready" && goal?.discipline === "run" && !serverManagedPlan
    ? <Run30EnrollCard api={run30.api} variant="offer" onEnrolled={refreshAfterProgramChange} />
    : null;

  if (!loading && loadError) {
    return <>{goalLink}{targetNotice}{renderPresentation(
      <TodayTrainingDecisionCard user={user} discipline={discipline} surface="plan" />,
    )}</>;
  }

  if (!loading && !goal) {
    return <>{goalLink}{targetNotice}{renderPresentation()}</>;
  }

  return (
    <>
      {goalLink}{targetNotice}
      {runTarget.session && <RunPlanPreview session={runTarget.session} onClose={runTarget.close} />}
      {renderPresentation(
        <>
          {run30Offer}
          <TodayTrainingDecisionCard user={user} discipline={discipline} surface="plan" />
        </>,
      )}
      {selectedDay?.owner === selectionOwner && goal && !serverManagedPlan && (
        <WorkoutEditModal
          day={selectedDay.day}
          weekId={selectedDay.weekId}
          weekAdjustmentReason={weeks.find((week) => week.id === selectedDay.weekId)?.adjustmentReason}
          dayIndex={selectedDay.dayIndex}
          goalId={selectedDay.goalId}
          goalDiscipline={goal.discipline as "bike" | "run" | "swim" | undefined}
          onClose={() => setSelectedDay(null)}
          onUpdate={() => {
            setSelectedDay(null);
            if (isMobile) {
              model.retryLoad();
            } else {
              void model.refreshPlanWeeks().catch((error: unknown) => {
                logClientError("PlanPage.refreshAfterEdit", error, { goalId: selectedDay.goalId });
                showToast(t("errors.planRefreshAfterSave"), "error");
                model.retryLoad();
              });
            }
          }}
        />
      )}
    </>
  );
}
