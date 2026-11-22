import { isSportUiEnabled } from "../../config/sportFeatures";
import { RefreshCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { AdaptationFlag, PlanDay, PlanWeek } from "@shared/types/goal";
import MobilePlanContent, { type PlanNextAction } from "../../features/training/plan/MobilePlanContent";
import PlanActionsMenu from "../../features/training/plan/PlanActionsMenu";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { AddPlanSheet } from "../training";
import AdaptationBanner from "../training/AdaptationBanner";
import { Button } from "../../theme/components";
import type { Discipline } from "../../utils/disciplineFilter";
import { ICON_SIZE } from "../../theme/tokens/icon";
import type { PlanCalendarLoads } from "../../features/training/plan/PlanDayLoadComparison";

export interface MobilePlanPageProps extends PlanCalendarLoads {
  nextAction?: PlanNextAction | null;
  decisionSlot?: ReactNode;
  /** 이번 주 목록 아래에 두는 접힌 계획 대비 기록. */
  comparisonSlot?: ReactNode;
  selectedDate?: string;
  currentWeek: PlanWeek | null;
  weekLabel: string;
  goalId?: string;
  goalTitle?: string;
  goalDiscipline?: Discipline;
  goalDate?: Date | null;
  daysLeft?: number;
  adaptationFlag?: AdaptationFlag;
  onWeekPrev?: () => void;
  onWeekNext?: () => void;
  onEditWorkout?: (day: PlanDay, weekId: string, dayIndex: number) => void;
  onPlanUpdate?: () => void;
  onIcsExport?: () => void;
  onReroll?: () => void | Promise<void>;
}

function kstDateString(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

export default function MobilePlanPage({
  dayLoads,
  loadState,
  selectedDate,
  nextAction,
  decisionSlot,
  comparisonSlot,
  currentWeek,
  weekLabel,
  goalId,
  goalTitle,
  goalDiscipline,
  goalDate,
  daysLeft,
  adaptationFlag,
  onWeekPrev,
  onWeekNext,
  onEditWorkout,
  onPlanUpdate,
  onIcsExport,
  onReroll,
}: MobilePlanPageProps) {
  const { t } = useTranslation("training");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const goalSport = goalDiscipline ?? params.get("sport");
  const [addSheetOwner, setAddSheetOwner] = useState<string | null>(null);
  const currentSheetOwner = `${goalId ?? ""}:${goalDiscipline ?? ""}:${currentWeek?.id ?? ""}`;
  useEffect(() => { setAddSheetOwner(null); }, [currentSheetOwner]);
  const days = currentWeek?.days ?? [];
  const today = kstDateString(Date.now());
  const todayIdx = days.findIndex((day) => day.date && kstDateString(day.date) === today);

  return (
    <MobilePlanContent
      dayLoads={dayLoads}
      loadState={loadState}
      selectedDate={selectedDate}
      decisionSlot={decisionSlot}
      nextAction={nextAction}
      currentWeek={currentWeek}
      weekLabel={weekLabel}
      goalTitle={goalTitle}
      goalDiscipline={goalDiscipline}
      goalDate={goalDate}
      daysLeft={daysLeft}
      onWeekPrev={onWeekPrev}
      onWeekNext={onWeekNext}
      onEditWorkout={onEditWorkout}
      comparisonSlot={comparisonSlot}
      weekActionsSlot={<>
        {(goalId || (!goalTitle && !currentWeek)) && isSportUiEnabled(goalSport ?? "bike") && <Button type="button" variant="ghost" size="sm"
          onClick={() => currentWeek && goalId ? setAddSheetOwner(currentSheetOwner) : navigate(`/goal-setup?sport=${goalSport === "run" || goalSport === "swim" ? goalSport : "bike"}`)}>{t('mobile.addAction')}</Button>}
        {/* 계획 관리(⋯)는 캘린더 내보내기·재생성만 — 목표 재설정·포기는 목표 탭에 있다. */}
        {(onIcsExport || onReroll) && <PlanActionsMenu testId="K4-3m" label={t("mobile.managePlan")} items={[
          ...(onIcsExport ? [{ id: "K4-3-2", label: t("buttons.ics"), onSelect: onIcsExport }] : []),
          ...(onReroll ? [{ id: "K4-3-3", label: t("buttons.reroll"), icon: <RefreshCw size={ICON_SIZE.sm} aria-hidden="true" />, onSelect: onReroll }] : []),
        ]} />}
      </>}
      adaptationSlot={goalId && adaptationFlag ? (
        <div className="mobile-plan-adaptation">
          <AdaptationBanner goalId={goalId} flag={adaptationFlag} onChange={onPlanUpdate ?? (() => undefined)} />
        </div>
      ) : undefined}
      footerSlot={addSheetOwner === currentSheetOwner && currentWeek && goalId ? (
        <AddPlanSheet
          goalId={goalId}
          weekId={currentWeek.id}
          days={days}
          initialDayIndex={todayIdx >= 0 ? todayIdx : undefined}
          onClose={() => setAddSheetOwner(null)}
          onUpdate={() => {
            setAddSheetOwner(null);
            onPlanUpdate?.();
          }}
        />
      ) : undefined}
    />
  );
}
