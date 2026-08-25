import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import type { PlanDay } from "@shared/types/goal";
import MobilePlanPage from "../components/mobile/MobilePlanPage";
import WorkoutEditModal from "../components/training/WorkoutEditModal";
import AdaptationBanner from "../components/training/AdaptationBanner";
import GuestValuePreview from "../components/guest/GuestValuePreview";
import { useAuth } from "../contexts/AuthContext";
import { useDialog } from "../contexts/DialogContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useToast } from "../contexts/ToastContext";
import PlanPresentation from "../features/training/plan/PlanPresentation";
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

export default function PlanPage() {
  const { t, i18n } = useTranslation("training");
  const { t: tActivity } = useTranslation("activity");
  const { user } = useAuth();
  const { firestore, functions } = useFirebaseServices();
  const { showToast } = useToast();
  const dialog = useDialog();
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [searchParams] = useSearchParams();
  const model = usePlanModel(searchParams.get("sport"));
  const { discipline, goal, weeks, loading, loadError } = model;
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);
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
      adaptationSlot={goal?.adaptationFlag ? (
        <AdaptationBanner
          goalId={goal.id}
          flag={goal.adaptationFlag}
          onChange={model.retryLoad}
        />
      ) : undefined}
      mobileWeekOffset={mobileWeekOffset}
      onMobileWeekOffsetChange={setMobileWeekOffset}
      onEditWorkout={(day, weekId, dayIndex) => setSelectedDay({ day, weekId, dayIndex })}
      onIcsExport={exportPlanIcs}
      onReroll={rerollPlan}
      onGoalReset={() => navigate("/goal-setup")}
      onAbandon={abandonGoal}
      renderMobile={(props) => (
        <MobilePlanPage
          currentWeek={props.currentWeek}
          weekLabel={props.weekLabel}
          goalId={goal?.id}
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
          onReroll={rerollPlan}
          onGoalReset={() => navigate("/goal-setup")}
          onAbandon={abandonGoal}
        />
      )}
    />
  );

  if (!user) {
    return <GuestValuePreview kind="plan" lang={i18n.language} />;
  }

  if (!loading && loadError) {
    return renderPresentation(
      <TodayTrainingDecisionCard user={user} discipline={discipline} surface="plan" />,
    );
  }

  if (!loading && !goal) {
    return renderPresentation();
  }

  return (
    <>
      {renderPresentation(
        <TodayTrainingDecisionCard user={user} discipline={discipline} surface="plan" />,
      )}
      {selectedDay && goal && (
        <WorkoutEditModal
          day={selectedDay.day}
          weekId={selectedDay.weekId}
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
