import { isSportUiEnabled } from "../../config/sportFeatures";
import { RefreshCw, Target } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { AdaptationFlag, PlanDay, PlanWeek } from "@shared/types/goal";
import MobilePlanContent, { type PlanNextAction } from "../../features/training/plan/MobilePlanContent";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { AddPlanSheet } from "../training";
import AdaptationBanner from "../training/AdaptationBanner";
import { Button } from "../../theme/components";
import type { Discipline } from "../../utils/disciplineFilter";
import { ICON_SIZE } from "../../theme/tokens/icon";
import type { PlanCalendarLoads } from "../../features/training/plan/PlanDayLoadComparison";

export interface MobilePlanPageProps extends PlanCalendarLoads {
  nextAction?: PlanNextAction | null;
  selectedDate?: string;
  currentWeek: PlanWeek | null;
  weekLabel: string;
  goalId?: string;
  goalLoadSummary?: ReactNode;
  goalTitle?: string;
  goalDiscipline?: Discipline;
  goalDate?: Date | null;
  daysLeft?: number;
  progressPct?: number;
  completedTSS?: number;
  totalTSS?: number;
  weeksLeft?: number;
  projectedCTL?: number | null;
  adaptationFlag?: AdaptationFlag;
  onWeekPrev?: () => void;
  onWeekNext?: () => void;
  onEditWorkout?: (day: PlanDay, weekId: string, dayIndex: number) => void;
  onPlanUpdate?: () => void;
  onIcsExport?: () => void;
  onReroll?: () => void | Promise<void>;
  onGoalReset?: () => void;
  onAbandon?: () => void | Promise<void>;
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
  currentWeek,
  weekLabel,
  goalId,
  goalLoadSummary,
  goalTitle,
  goalDiscipline,
  goalDate,
  daysLeft,
  progressPct,
  completedTSS,
  totalTSS,
  weeksLeft,
  projectedCTL,
  adaptationFlag,
  onWeekPrev,
  onWeekNext,
  onEditWorkout,
  onPlanUpdate,
  onIcsExport,
  onReroll,
  onGoalReset,
  onAbandon,
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
      nextAction={nextAction}
      currentWeek={currentWeek}
      weekLabel={weekLabel}
      goalTitle={goalTitle}
      goalDiscipline={goalDiscipline}
      goalLoadSummary={goalLoadSummary}
      goalDate={goalDate}
      daysLeft={daysLeft}
      progressPct={progressPct}
      completedTSS={completedTSS}
      totalTSS={totalTSS}
      weeksLeft={weeksLeft}
      projectedCTL={projectedCTL}
      onWeekPrev={onWeekPrev}
      onWeekNext={onWeekNext}
      onEditWorkout={onEditWorkout}
      chromeSlot={(
        <div className="flex items-center sticky top-0 z-10"
          style={{ height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)", padding: "0 16px", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>{t('mobile.headerTitle')}</span>
          <div style={{ flex: 1 }} />
          {(goalId || (!goalTitle && !currentWeek)) && isSportUiEnabled(goalSport ?? "bike") && <Button type="button" variant="ghost" size="sm"
            onClick={() => currentWeek && goalId ? setAddSheetOwner(currentSheetOwner) : navigate(`/goal-setup?sport=${goalSport === "run" || goalSport === "swim" ? goalSport : "bike"}`)}>{t('mobile.addAction')}</Button>}
        </div>
      )}
      adaptationSlot={goalId && adaptationFlag ? (
        <div style={{ padding: "0 16px" }}>
          <AdaptationBanner goalId={goalId} flag={adaptationFlag} onChange={onPlanUpdate ?? (() => undefined)} />
        </div>
      ) : undefined}
      actionsSlot={(
        <div data-testid="K4-3m" style={{ display: "flex", gap: "var(--space-2)", overflowX: "auto", paddingBottom: 2 }}>
          {[
            [t("buttons.ics"), onIcsExport],
            [t("buttons.reroll"), onReroll],
            [t("buttons.goalReset"), onGoalReset],
            [t("buttons.abandonGoal"), onAbandon],
          ].map(([label, action], index) => action ? (
            <Button
              data-testid={["K4-3-2", "K4-3-3", "K4-3-4", "K4-3-5"][index]}
              key={String(label)}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { void (action as () => void | Promise<void>)(); }}
              style={{ whiteSpace: "nowrap" }}
            >
              {index === 1 && <RefreshCw size={ICON_SIZE.md} aria-hidden="true" />}{index === 2 && <Target size={ICON_SIZE.md} aria-hidden="true" />}{String(label)}
            </Button>
          ) : null)}
        </div>
      )}
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
