import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AdaptationFlag, PlanDay, PlanWeek } from "@shared/types/goal";
import MobilePlanContent from "../../features/training/plan/MobilePlanContent";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { AddPlanSheet } from "../training";
import AdaptationBanner from "../training/AdaptationBanner";
import { Button } from "../../theme/components";

export interface MobilePlanPageProps {
  currentWeek: PlanWeek | null;
  weekLabel: string;
  goalId?: string;
  goalTitle?: string;
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
  currentWeek,
  weekLabel,
  goalId,
  goalTitle,
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
  const [showAddSheet, setShowAddSheet] = useState(false);
  const days = currentWeek?.days ?? [];
  const today = kstDateString(Date.now());
  const todayIdx = days.findIndex((day) => day.date && kstDateString(day.date) === today);

  return (
    <MobilePlanContent
      currentWeek={currentWeek}
      weekLabel={weekLabel}
      goalTitle={goalTitle}
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
          <Button type="button" variant="ghost" size="sm"
            onClick={() => currentWeek && goalId ? setShowAddSheet(true) : navigate("/goal-setup")}>{t('mobile.addAction')}</Button>
        </div>
      )}
      adaptationSlot={goalId && adaptationFlag ? (
        <div style={{ padding: "0 16px" }}>
          <AdaptationBanner goalId={goalId} flag={adaptationFlag} onChange={onPlanUpdate ?? (() => undefined)} />
        </div>
      ) : undefined}
      actionsSlot={(
        <div style={{ display: "flex", gap: "var(--space-2)", overflowX: "auto", paddingBottom: 2 }}>
          {[
            [t("actions.ics", { defaultValue: "ICS" }), onIcsExport],
            [t("actions.reroll", { defaultValue: "재생성" }), onReroll],
            [t("actions.resetGoal", { defaultValue: "목표 재설정" }), onGoalReset],
            [t("actions.abandon", { defaultValue: "포기" }), onAbandon],
          ].map(([label, action]) => action ? (
            <Button
              key={String(label)}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { void (action as () => void | Promise<void>)(); }}
              style={{ whiteSpace: "nowrap" }}
            >
              {String(label)}
            </Button>
          ) : null)}
        </div>
      )}
      footerSlot={showAddSheet && currentWeek && goalId ? (
        <AddPlanSheet
          goalId={goalId}
          weekId={currentWeek.id}
          days={days}
          initialDayIndex={todayIdx >= 0 ? todayIdx : undefined}
          onClose={() => setShowAddSheet(false)}
          onUpdate={() => {
            setShowAddSheet(false);
            onPlanUpdate?.();
          }}
        />
      ) : undefined}
    />
  );
}
