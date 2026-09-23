import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PlanWeek, PlanDay, WorkoutKind } from "@shared/types/goal";
import { getDisciplineColor, getDisciplineIcon, getDisciplineTag } from "../../../utils/disciplineFilter";
import type { Discipline } from "../../../utils/disciplineFilter";
import { getWorkoutDiscipline as _gwDiscipline } from "../../../utils/workoutDiscipline";
import { effectivePlanTSS, sumEffectivePlanTSS } from "../../../utils/planTss";
import AdjustedChip from "../../../components/training/AdjustedChip";
import { Button, Card, Text } from "../../../theme/components";
import { formatPlanGoalTitle } from "./planDisplay";
import "./MobilePlanContent.css";

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
    hillRepeats: t('workouts.hillRepeats'),
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

function kstDateString(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
}

function kstDayOfMonth(ms: number): number | null {
  const dateStr = kstDateString(ms);
  if (!dateStr) return null;
  return Number(dateStr.slice(8, 10));
}

export interface MobilePlanContentProps {
  embedded?: boolean;
  chromeSlot?: ReactNode;
  adaptationSlot?: ReactNode;
  actionsSlot?: ReactNode;
  footerSlot?: ReactNode;
  currentWeek: PlanWeek | null;
  weekLabel: string;
  canPrevWeek?: boolean;
  canNextWeek?: boolean;
  goalTitle?: string;
  daysLeft?: number;
  progressPct?: number;
  completedTSS?: number;
  totalTSS?: number;
  weeksLeft?: number;
  projectedCTL?: number | null;
  onWeekPrev?: () => void;
  onWeekNext?: () => void;
  onEditWorkout?: (day: PlanDay, weekId: string, dayIndex: number) => void;
}

export default function MobilePlanContent({
  embedded = false,
  chromeSlot,
  adaptationSlot,
  actionsSlot,
  footerSlot,
  currentWeek,
  weekLabel,
  canPrevWeek = true,
  canNextWeek = true,
  goalTitle,
  daysLeft,
  progressPct,
  completedTSS,
  totalTSS,
  weeksLeft,
  projectedCTL,
  onWeekPrev,
  onWeekNext,
  onEditWorkout,
}: MobilePlanContentProps) {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const [showPastDays, setShowPastDays] = useState(false);
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
  const todayStr = kstDateString(Date.now());
  const days = currentWeek?.days ?? [];
  const todayIdx = days.findIndex(d => {
    if (!d.date) return false;
    return kstDateString(d.date) === todayStr;
  });
  const [goalExpanded, setGoalExpanded] = useState(false);
  const formattedGoal = goalTitle ? formatPlanGoalTitle(goalTitle) : null;
  const todayWorkout = todayIdx >= 0 ? days[todayIdx] : null;
  const todayActionable = todayWorkout && !todayWorkout.completed && !todayWorkout.skipped && todayWorkout.workout !== "rest";
  const nextWorkoutIdx = todayActionable ? todayIdx : days.findIndex(day =>
    kstDateString(day.date) >= todayStr && !day.completed && !day.skipped && day.workout !== "rest",
  );
  const nextWorkout = nextWorkoutIdx >= 0 ? days[nextWorkoutIdx] : null;
  const nextWorkoutLabel = nextWorkout ? WORKOUT_LABELS[nextWorkout.workout] ?? nextWorkout.workout : "";

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
    <div className="mobile-plan-content">
      {chromeSlot}

      {goalTitle && (
        <Card padding="none" style={{ margin: "var(--space-2) var(--space-4)", padding: "var(--space-2) var(--space-3)", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "start", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 title={goalTitle} aria-label={goalTitle} style={{ margin: 0, fontSize: "var(--fs-base)", lineHeight: 1.4, fontWeight: 700, color: "var(--ink-0)", overflowWrap: "anywhere", ...(!goalExpanded ? { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" } : {}) }}>{goalExpanded ? goalTitle : formattedGoal?.name}</h2>
              {!goalExpanded && formattedGoal?.meta && <div style={{ marginTop: "var(--space-0-5)", color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>{formattedGoal.meta}</div>}
            </div>
            {(formattedGoal?.meta || goalTitle.length > 32) && (
              <Button type="button" variant="ghost" size="sm" aria-expanded={goalExpanded} onClick={() => setGoalExpanded(value => !value)} style={{ flexShrink: 0 }}>
                {goalExpanded ? t("mobile.collapseGoal") : t("mobile.showOriginal")}
              </Button>
            )}
          </div>
          <div role="progressbar" aria-label={t("metrics.progress")} aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} style={{ height: 4, borderRadius: "var(--r-xs)", background: "var(--bg-3)", overflow: "hidden", margin: "var(--space-1) 0 var(--space-2)" }}>
            <div style={{ width: `${Math.min(100, Math.max(0, progressPct ?? 0))}%`, height: "100%", background: "var(--lime)" }} />
          </div>
          <div className="mobile-plan-goal-stats" style={{ columnGap: "var(--space-3)", rowGap: "var(--space-1)", color: "var(--ink-2)", fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)" }}>
            <span><strong style={{ color: "var(--ink-0)" }}>{daysLeft != null ? `${t("page.daysLeftPrefix")}${daysLeft}` : "—"}</strong></span>
            <span>{t("metrics.progress")} <strong style={{ color: "var(--lime)" }}>{progressPct != null ? `${progressPct}%` : "—"}</strong></span>
            <span>{t("metrics.completedTSS")} <strong style={{ color: "var(--ink-0)" }}>{completedTSS ?? 0}/{totalTSS ?? 0}</strong></span>
            <span>CTL <strong style={{ color: "var(--ink-0)" }}>{projectedCTL != null ? `≈+${Math.round(projectedCTL)}` : "—"}</strong></span>
          </div>
          {actionsSlot && <details style={{ marginTop: "var(--space-2)", borderTop: "1px solid var(--line-soft)", paddingTop: "var(--space-1)", fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{t("mobile.managePlan")}</summary>
            <div style={{ paddingTop: "var(--space-2)" }}>{actionsSlot}</div>
          </details>}
        </Card>
      )}

      {nextWorkout && (
        <Card padding="none" style={{ margin: "0 var(--space-4) var(--space-2)", padding: "var(--space-2) var(--space-3)", borderColor: "var(--lime)", background: "color-mix(in oklch, var(--lime) 5%, var(--bg-1))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
            <Text as="span" variant="eyebrow" style={{ color: "var(--lime)", flexShrink: 0 }}>{nextWorkoutIdx === todayIdx ? t("mobile.todayNext") : t("mobile.weekNext")}</Text>
            <strong style={{ minWidth: 0, flex: 1, fontSize: "var(--fs-sm)", color: "var(--ink-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nextWorkoutLabel}</strong>
            {onEditWorkout && <Button type="button" size="sm" onClick={() => openEditFor(nextWorkoutIdx)}>{t("mobile.start")}</Button>}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{nextWorkoutIdx !== todayIdx && `${kstDateString(nextWorkout.date)} · `}{effectivePlanTSS(nextWorkout)} TSS</div>
        </Card>
      )}

      {adaptationSlot}

      {/* Week navigation */}
      <div className="flex items-center justify-center" style={{ padding: "0 var(--space-4)", gap: 'var(--space-4)' }}>
        <button type="button" onClick={onWeekPrev} disabled={!onWeekPrev || !canPrevWeek} aria-label={t('mobile.previousWeek')}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "var(--fs-lg)", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>◀</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>{t('mobile.weekHeading')}</div>
          <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-0)" }}>{weekLabel}{weeksLeft != null && <span style={{ marginLeft: "var(--space-1)", color: "var(--ink-3)", fontSize: "var(--fs-xs)", fontWeight: 400 }}>· {t("metrics.weeksLeft")} {weeksLeft}{t("metrics.weeksUnit")}</span>}</div>
        </div>
        <button type="button" onClick={onWeekNext} disabled={!onWeekNext || !canNextWeek} aria-label={t('mobile.nextWeek')}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: "var(--fs-lg)", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>▶</button>
      </div>

      {/* Weekly summary */}
      {currentWeek && (() => {
        const totalTSS = sumEffectivePlanTSS(days);
        const totalMins = days.filter(d => d.workout !== "rest").reduce((s, d) => {
          return s + (effectivePlanTSS(d) * 0.6);
        }, 0);
        const h = Math.floor(totalMins / 60);
        const m = Math.round(totalMins % 60);
        const sessions = days.filter(d => d.workout !== "rest").length;

        const bikeTSS = days.filter(d => getWorkoutDisciplineForDisplay(d.workout) === "bike" && d.workout !== "rest").reduce((s, d) => s + effectivePlanTSS(d), 0);
        const runTSS = days.filter(d => getWorkoutDisciplineForDisplay(d.workout) === "run").reduce((s, d) => s + effectivePlanTSS(d), 0);
        const swimTSS = days.filter(d => getWorkoutDisciplineForDisplay(d.workout) === "swim").reduce((s, d) => s + effectivePlanTSS(d), 0);
        const stackTotal = bikeTSS + runTSS + swimTSS || 1;

        return (
          <details style={{ margin: "0 var(--space-4) var(--space-1)", background: "var(--bg-1)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-md)", padding: "var(--space-1) var(--space-3)", fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}
              aria-label={`${t('mobile.weeklyTSS')} ${Math.round(totalTSS)}, ${t('mobile.timeLabel')} ${h}h ${m}m, ${t('mobile.sessions')} ${sessions}`}>
              TSS <strong style={{ color: 'var(--lime)' }}>{Math.round(totalTSS)}</strong>
              {' · '}<strong style={{ color: 'var(--ink-0)' }}>{h}h {m}m</strong>
              {' · '}<strong style={{ color: 'var(--ink-0)' }}>{sessions}</strong>{t('mobile.sessions')}
            </summary>
            {(bikeTSS > 0 || runTSS > 0 || swimTSS > 0) && <div style={{ paddingTop: 'var(--space-2)' }}>
              <Text as="div" variant="eyebrow" style={{ marginBottom: 'var(--space-1)' }}>{t('mobile.sportLoad')}</Text>
              <div style={{ display: "flex", height: 6, borderRadius: "var(--r-xs)", overflow: "hidden", marginBlock: 'var(--space-2)' }}>
                {bikeTSS > 0 && <div style={{ width: `${(bikeTSS/stackTotal)*100}%`, background: "var(--aqua)" }} />}
                {runTSS > 0 && <div style={{ width: `${(runTSS/stackTotal)*100}%`, background: "var(--amber)" }} />}
                {swimTSS > 0 && <div style={{ width: `${(swimTSS/stackTotal)*100}%`, background: "var(--lime)" }} />}
              </div>
              <div className="flex" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                {bikeTSS > 0 && <span>🚴 {Math.round(bikeTSS)}</span>}
                {runTSS > 0 && <span>🏃 {Math.round(runTSS)}</span>}
                {swimTSS > 0 && <span>🏊 {Math.round(swimTSS)}</span>}
              </div>
            </div>}
          </details>
        );
      })()}

      {/* Weekly plan — vertical list */}
      <div className="flex items-center justify-between" style={{ padding: "var(--space-1) var(--space-4)" }}>
        <Text variant="eyebrow">{t('mobile.weeklyPlan')}</Text>
        {onEditWorkout && editTargetIdx >= 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => openEditFor(editTargetIdx)}>{t('mobile.edit')}</Button>
        )}
      </div>
      {todayIdx > 0 && (
        <button type="button" onClick={() => setShowPastDays(value => !value)} aria-expanded={showPastDays}
          style={{ margin: "0 var(--space-4) var(--space-1)", minHeight: 36, padding: "0 var(--space-2)", textAlign: "left", border: "1px solid var(--line-soft)", borderRadius: "var(--r-sm)", background: "var(--bg-1)", color: "var(--ink-2)", fontSize: "var(--fs-sm)", cursor: "pointer" }}>
          {showPastDays ? t('mobile.hidePastDays') : t('mobile.showPastDays', { count: todayIdx })}
        </button>
      )}
      {days.map((day, i) => {
        if (todayIdx > 0 && i < todayIdx && !showPastDays) return null;
        const dayStr = day.date ? kstDateString(day.date) : "";
        const dayOfMonth = day.date ? kstDayOfMonth(day.date) : null;
        const isToday = dayStr === todayStr;
        const isRest = day.workout === "rest";
        const isDone = day.completed;
        const isPast = dayStr !== "" && dayStr < todayStr;
        const label = WORKOUT_LABELS[day.workout] ?? day.workout;
        const state = isDone ? "done" : isToday ? "today" : isRest ? "off" : isPast ? "past" : "planned";
        const stateLabel = state === "done" ? t('mobile.stateDone') : state === "today" ? t('mobile.stateToday') : state === "past" ? t('mobile.statePast') : t('mobile.statePlanned');

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
                  <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, fontFamily: "var(--font-mono)", color: isToday ? "var(--lime)" : "var(--ink-0)" }}>{dayOfMonth ?? ""}</div>
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
            role={onEditWorkout ? "button" : undefined}
            tabIndex={onEditWorkout ? 0 : undefined}
            aria-label={onEditWorkout ? `${DAY_NAMES[i]} ${dayOfMonth ?? ""} ${label} · ${stateLabel}` : undefined}
            onClick={() => openEditFor(i)}
            onKeyDown={onEditWorkout ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openEditFor(i);
              }
            } : undefined}
            style={{
              padding: "13px 16px", borderBottom: "1px solid var(--line-soft)",
              background: isToday ? "color-mix(in oklch, var(--lime) 6%, var(--bg-0))" : "transparent",
              cursor: onEditWorkout ? "pointer" : "default",
            }}>
            <div style={{ width: 32, textAlign: "center" }}>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>{DAY_NAMES[i]}</div>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, fontFamily: "var(--font-mono)", color: isToday ? "var(--lime)" : "var(--ink-0)" }}>
                {dayOfMonth ?? ""}
              </div>
            </div>
            <div style={{ width: 3, height: 36, background: getDisciplineColor(getWorkoutDisciplineForDisplay(day.workout)), borderRadius: "var(--r-xs)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-1)', marginBottom: "var(--space-0-5)" }}>
                {(() => {
                  const d = getWorkoutDisciplineForDisplay(day.workout);
                  const c = getDisciplineColor(d);
                  return (
                    <span style={{
                      fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", padding: "1px 5px", borderRadius: "var(--r-xs)",
                      background: `color-mix(in oklch, ${c} 14%, var(--bg-2))`,
                      color: c, border: `1px solid color-mix(in oklch, ${c} 30%, transparent)`,
                      display: "flex", alignItems: "center", gap: "var(--space-0-5)",
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
                {stateLabel}
              </div>
            </div>
            {state === "done" && <span style={{ color: "var(--lime)", fontSize: "var(--fs-base)" }}>✓</span>}
          </div>
        );
      })}

      {/* 운동 강도 범례: 일정 다음에 두어 첫 화면의 행동 흐름을 방해하지 않는다. */}
      <details style={{ padding: "var(--space-2) var(--space-4)", fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
        <summary style={{ cursor: 'pointer' }}>{t('mobile.intensityLegend')}</summary>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", paddingBlock: "var(--space-2)" }}>
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
      </details>

      {!embedded && <div style={{ height: 80 }} />}

      {footerSlot}
    </div>
  );
}
