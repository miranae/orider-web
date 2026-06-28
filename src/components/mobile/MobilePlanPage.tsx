import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { ChevronLeft } from "lucide-react";
import type { AdaptationFlag, PlanWeek, PlanDay, WorkoutKind } from "@shared/types/goal";
import { getDisciplineColor, getDisciplineIcon, getDisciplineTag } from "../../utils/disciplineFilter";
import type { Discipline } from "../../utils/disciplineFilter";
import { getWorkoutDiscipline as _gwDiscipline } from "../../utils/workoutDiscipline";
import { AddPlanSheet } from "../training";
import AdaptationBanner from "../training/AdaptationBanner";
import AdjustedChip from "../training/AdjustedChip";
import { Text } from "../../theme/components";

/** rest → bike 폴백으로 Discipline 타입 보장 (색상/아이콘 표시용) */
function getWorkoutDisciplineForDisplay(workout: string): Discipline {
  const d = _gwDiscipline(workout);
  return d === 'rest' ? 'bike' : d;
}

function buildWorkoutLabels(t: (key: string) => string): Record<WorkoutKind, string> {
  return {
    rest: t('workouts.rest'),
    rec: t('workouts.rec'),
    z2: t('workouts.z2'),
    z2Long: t('workouts.z2Long'),
    tempo: t('workouts.tempo'),
    ftp: t('workouts.ftp'),
    vo2: t('workouts.vo2Max'),
    sim: t('workouts.sim'),
    goal: t('workouts.goal'),
    easyRun: t('workouts.easyRun'),
    tempoRun: t('workouts.tempoRun'),
    intervalRun: t('workouts.intervalRun'),
    longRun: t('workouts.longRun'),
    recoveryRun: t('workouts.recoveryRun'),
    easySwim: t('workouts.easySwim'),
    drillSwim: t('workouts.drillSwim'),
    intervalSwim: t('workouts.intervalSwim'),
    longSwim: t('workouts.longSwim'),
    recoverySwim: t('workouts.recoverySwim'),
    stridesRun: t('workouts.stridesRun'),
    progressRun: t('workouts.progressRunFull'),
    threshRun: t('workouts.threshRun'),
    raceRun: t('workouts.raceRunFull'),
    kickSwim: t('workouts.kickSwim'),
    enduranceSwim: t('workouts.enduranceSwim'),
    cssSwim: t('workouts.cssSwim'),
    racepaceSwim: t('workouts.racepaceSwim'),
    sprintSwim: t('workouts.sprintSwimFull'),
    owSwim: t('workouts.owSwimFull'),
    brickSwim: t('workouts.brickSwimFull'),
  };
}

interface MobilePlanPageProps {
  currentWeek: PlanWeek | null;
  weekLabel: string;
  goalId?: string;
  /** 자동 적응 알림 — warn/critical 일 때 상단 배너 노출 */
  adaptationFlag?: AdaptationFlag;
  onWeekPrev?: () => void;
  onWeekNext?: () => void;
  onEditWorkout?: (day: PlanDay, weekId: string, dayIndex: number) => void;
  onPlanUpdate?: () => void;
}

export default function MobilePlanPage({
  currentWeek, weekLabel, goalId, adaptationFlag, onWeekPrev, onWeekNext, onEditWorkout, onPlanUpdate,
}: MobilePlanPageProps) {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const WORKOUT_LABELS = useMemo(() => buildWorkoutLabels(t), [t]);
  const DAY_NAMES = useMemo(() => [
    tCommon('weekday.mon'),
    tCommon('weekday.tue'),
    tCommon('weekday.wed'),
    tCommon('weekday.thu'),
    tCommon('weekday.fri'),
    tCommon('weekday.sat'),
    tCommon('weekday.sun'),
  ], [tCommon]);
  const navigate = useNavigate();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const days = currentWeek?.days ?? [];
  const todayIdx = days.findIndex(d => {
    if (!d.date) return false;
    const dd = new Date(d.date);
    return dd.toDateString() === new Date().toDateString();
  });

  /**
   * 데스크톱 PlanPage 의 일별 칸 클릭과 동일하게 WorkoutEditModal(완료/건너뛰기/변경/교환) 을 연다.
   * 별도의 "주간 편집" 단일 동작이 데스크톱에 없으므로, 헤더 "편집" 은 가장 행동 가능한 날
   * (오늘 → 없으면 첫 비휴식일) 의 운동 편집을 여는 것으로 미러링한다.
   */
  const openEditFor = (i: number) => {
    const day = days[i];
    if (!day || !currentWeek) return;
    onEditWorkout?.(day, currentWeek.id, i);
  };
  const editTargetIdx = todayIdx >= 0 ? todayIdx : days.findIndex(d => d.workout !== "rest");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center sticky top-0 z-10"
        style={{ height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)", padding: "0 16px", gap: 10 }}>
        <div className="cursor-pointer flex items-center" style={{ marginLeft: -4, padding: "4px 8px 4px 0", minHeight: 44 }}
          onClick={() => navigate("/my")}>
          <ChevronLeft size={22} style={{ color: "var(--ink-1)" }} />
        </div>
        <span style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>{t('mobile.headerTitle')}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--lime)", cursor: "pointer", fontWeight: 500 }}
          onClick={() => currentWeek && goalId ? setShowAddSheet(true) : navigate("/goal-setup")}>{t('mobile.addAction')}</span>
      </div>

      {/* Adaptation Banner — warn/critical 일 때만 노출 */}
      {goalId && adaptationFlag && (
        <div style={{ padding: "0 16px" }}>
          <AdaptationBanner goalId={goalId} flag={adaptationFlag} onChange={onPlanUpdate ?? (() => {})} />
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-center" style={{ padding: "var(--space-3) var(--space-4)", gap: 'var(--space-4)' }}>
        <button onClick={onWeekPrev} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "var(--fs-lg)", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>◀</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>WEEK</div>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{weekLabel}</div>
        </div>
        <button onClick={onWeekNext} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "var(--fs-lg)", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>▶</button>
      </div>

      {/* Weekly summary */}
      {currentWeek && (() => {
        // 자동 적응이 적용된 경우 effective TSS 사용
        const effective = (d: PlanDay) => d.adjustedTSS ?? d.plannedTSS;
        const totalTSS = days.reduce((s, d) => s + (d.completed ? (d.actualTSS ?? effective(d)) : effective(d)), 0);
        const totalMins = days.filter(d => d.workout !== "rest").reduce((s, d) => {
          return s + (effective(d) * 0.6);
        }, 0);
        const h = Math.floor(totalMins / 60);
        const m = Math.round(totalMins % 60);
        const sessions = days.filter(d => d.workout !== "rest").length;

        const bikeTSS = days.filter(d => getWorkoutDisciplineForDisplay(d.workout) === "bike" && d.workout !== "rest").reduce((s, d) => s + d.plannedTSS, 0);
        const runTSS = days.filter(d => getWorkoutDisciplineForDisplay(d.workout) === "run").reduce((s, d) => s + d.plannedTSS, 0);
        const swimTSS = days.filter(d => getWorkoutDisciplineForDisplay(d.workout) === "swim").reduce((s, d) => s + d.plannedTSS, 0);
        const stackTotal = bikeTSS + runTSS + swimTSS || 1;

        return (
          <div style={{ margin: "0 16px 12px", background: "var(--bg-1)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-lg)", padding: 14 }}>
            <div className="flex" style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>{t('mobile.weeklyTSS')}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-2xl)", fontWeight: 600, color: "var(--lime)", letterSpacing: "-0.03em" }}>{Math.round(totalTSS)}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>{t('mobile.timeLabel')}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-2xl)", fontWeight: 600, color: "var(--ink-0)", letterSpacing: "-0.03em" }}>{h}h {m}m</div>
              </div>
              <div>
                <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>{t('mobile.sessions')}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-2xl)", fontWeight: 600, color: "var(--ink-0)", letterSpacing: "-0.03em" }}>{sessions}</div>
              </div>
            </div>
            {/* Sport TSS stack bar */}
            <div style={{ display: "flex", height: 6, borderRadius: "var(--r-xs)", overflow: "hidden", marginBottom: 'var(--space-2)' }}>
              {bikeTSS > 0 && <div style={{ width: `${(bikeTSS/stackTotal)*100}%`, background: "var(--aqua)" }} />}
              {runTSS > 0 && <div style={{ width: `${(runTSS/stackTotal)*100}%`, background: "var(--amber)" }} />}
              {swimTSS > 0 && <div style={{ width: `${(swimTSS/stackTotal)*100}%`, background: "var(--lime)" }} />}
            </div>
            <div className="flex" style={{ gap: 'var(--space-3)', fontSize: "var(--fs-xs)" }}>
              {bikeTSS > 0 && <span style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)' }}><span style={{ width: 8, height: 8, borderRadius: "var(--r-xs)", background: "var(--aqua)" }} />🚴 {Math.round(bikeTSS)}</span>}
              {runTSS > 0 && <span style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)' }}><span style={{ width: 8, height: 8, borderRadius: "var(--r-xs)", background: "var(--amber)" }} />🏃 {Math.round(runTSS)}</span>}
              {swimTSS > 0 && <span style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)' }}><span style={{ width: 8, height: 8, borderRadius: "var(--r-xs)", background: "var(--lime)" }} />🏊 {Math.round(swimTSS)}</span>}
            </div>
          </div>
        );
      })()}

      {/* 운동 강도 범례 */}
      <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: 10, fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
        {[
          { label: t('legend.z1Recovery'), color: "var(--ink-4)" },
          { label: t('legend.z2Endurance'), color: "var(--aqua)" },
          { label: t('legend.z3Tempo'), color: "var(--amber)" },
          { label: t('legend.z4Threshold'), color: "var(--lime)" },
          { label: t('legend.z5VO2'), color: "var(--rose)" },
          { label: t('legend.longSim'), color: "var(--aqua)" },
        ].map(({ label, color }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)' }}>
            <span style={{ width: 8, height: 8, borderRadius: "var(--r-xs)", background: color, flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>

      {/* Weekly plan — vertical list */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <Text variant="eyebrow">{t('mobile.weeklyPlan')}</Text>
        {onEditWorkout && editTargetIdx >= 0 && (
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--lime)", fontWeight: 500, cursor: "pointer" }}
            onClick={() => openEditFor(editTargetIdx)}>{t('mobile.edit')}</span>
        )}
      </div>
      {days.map((day, i) => {
        const dayDate = day.date ? new Date(day.date) : null;
        const dayStr = dayDate ? `${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,"0")}-${String(dayDate.getDate()).padStart(2,"0")}` : "";
        const isToday = dayStr === todayStr;
        const isRest = day.workout === "rest";
        const isDone = day.completed;
        const isPast = day.date != null && day.date < Date.now() && !isToday;
        const label = WORKOUT_LABELS[day.workout] ?? day.workout;
        const state = isDone ? "done" : isToday ? "today" : isRest ? "off" : isPast ? "past" : "planned";

        const intensityColor = isRest ? "var(--ink-4)"
          : (day.workout === "z2Long" || day.workout === "tempo" || day.workout === "tempoRun") ? "var(--amber)"
          : (day.workout === "ftp" || day.workout === "vo2" || day.workout === "sim" || day.workout === "intervalRun" || day.workout === "intervalSwim") ? "var(--rose)"
          : "var(--lime)";
        const intensityLabel = isRest ? "REST"
          : (day.workout === "z2Long" || day.workout === "tempo" || day.workout === "tempoRun") ? "MOD"
          : (day.workout === "ftp" || day.workout === "vo2" || day.workout === "sim" || day.workout === "intervalRun" || day.workout === "intervalSwim") ? "HARD"
          : "EASY";

        if (isRest) {
          return (
            <div key={i} style={{ padding: "13px 16px", borderBottom: "1px solid var(--line-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)' }}>
                <div style={{ width: 32, textAlign: "center" }}>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>{DAY_NAMES[i]}</div>
                  <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, fontFamily: "var(--font-mono)", color: isToday ? "var(--lime)" : "var(--ink-0)" }}>{dayDate ? dayDate.getDate() : ""}</div>
                </div>
                <div style={{ flex: 1, padding: "var(--space-3) var(--space-2)", border: "1px dashed var(--line)", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 'var(--space-2)',
                  background: isToday ? "color-mix(in oklch, var(--lime) 6%, var(--bg-0))" : "transparent" }}>
                  <span style={{ fontSize: "var(--fs-base)" }}>🌙</span>
                  <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-4)" }}>{t('mobile.restDay')}</span>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className="flex items-center gap-3.5"
            onClick={() => onEditWorkout?.(day, currentWeek?.id ?? "", i)}
            style={{
              padding: "13px 16px", borderBottom: "1px solid var(--line-soft)",
              background: isToday ? "color-mix(in oklch, var(--lime) 6%, var(--bg-0))" : "transparent",
              cursor: onEditWorkout ? "pointer" : "default",
            }}>
            <div style={{ width: 32, textAlign: "center" }}>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>{DAY_NAMES[i]}</div>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, fontFamily: "var(--font-mono)", color: isToday ? "var(--lime)" : "var(--ink-0)" }}>
                {dayDate ? dayDate.getDate() : ""}
              </div>
            </div>
            <div style={{ width: 3, height: 36, background: getDisciplineColor(getWorkoutDisciplineForDisplay(day.workout)), borderRadius: 1.5, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)', marginBottom: 2 }}>
                {(() => {
                  const d = getWorkoutDisciplineForDisplay(day.workout);
                  const c = getDisciplineColor(d);
                  return (
                    <span style={{
                      fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", padding: "1px 5px", borderRadius: "var(--r-xs)",
                      background: `color-mix(in oklch, ${c} 14%, var(--bg-2))`,
                      color: c, border: `1px solid color-mix(in oklch, ${c} 30%, transparent)`,
                      display: "flex", alignItems: "center", gap: 2,
                    }}>{getDisciplineIcon(d)} {getDisciplineTag(d)}</span>
                  );
                })()}
                <span style={{
                  fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", padding: "1px 5px", borderRadius: "var(--r-xs)",
                  background: "var(--bg-3)", color: intensityColor,
                }}>{intensityLabel}</span>
                {/* 자동 조정 chip — week 단위 canonical factor 사용 */}
                {day.adjustedTSS != null && currentWeek?.adjustmentFactor != null && (
                  <AdjustedChip factor={currentWeek.adjustmentFactor} />
                )}
              </div>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)" }}>{label}</div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 1 }}>
                {state === "done" ? t('mobile.stateDone') : state === "today" ? t('mobile.stateToday') : state === "past" ? t('mobile.statePast') : t('mobile.statePlanned')}
              </div>
            </div>
            {state === "done" && <span style={{ color: "var(--lime)", fontSize: "var(--fs-base)" }}>✓</span>}
            {state === "today" && onEditWorkout && (
              <button
                onClick={(e) => { e.stopPropagation(); openEditFor(i); }}
                style={{ padding: "10px 14px", background: "var(--lime)", color: "var(--primary-fg)", border: "none", borderRadius: "var(--r-sm)", fontSize: "var(--fs-xs)", fontWeight: 600, cursor: "pointer" }}>
                {t('mobile.start')}
              </button>
            )}
          </div>
        );
      })}

      <div style={{ height: 80 }} />

      {/* AddPlanSheet 바텀시트 */}
      {showAddSheet && currentWeek && goalId && (
        <AddPlanSheet
          goalId={goalId}
          weekId={currentWeek.id}
          days={days}
          initialDayIndex={todayIdx >= 0 ? todayIdx : undefined}
          onClose={() => setShowAddSheet(false)}
          onUpdate={() => { setShowAddSheet(false); onPlanUpdate?.(); }}
        />
      )}
    </div>
  );
}
