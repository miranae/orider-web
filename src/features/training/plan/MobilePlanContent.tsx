import { isPendingPlanWorkout, presentPlanDayRecord } from "./planRecordPresentation";
import { goalCountdown } from "../../../utils/goalCountdown";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LocalizedLink } from "../../../components/LocalizedLink";
import GlossaryText from "../../../components/common/GlossaryText";
import SportIcon from "../../../components/common/SportIcon";
import { planDayKey as kstDateString, planCalendarDate } from "@shared/training/planDate";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PlanWeek, PlanDay, WorkoutKind } from "@shared/types/goal";
import type { Discipline } from "../../../utils/disciplineFilter";
import { getWorkoutDiscipline as _gwDiscipline } from "../../../utils/workoutDiscipline";
import AdjustedChip from "../../../components/training/AdjustedChip";
import { Button, Card, IconButton, Text } from "../../../theme/components";
import { formatPlanGoalTitle } from "./planDisplay";
import "./MobilePlanContent.css";
import { ICON_SIZE } from "../../../theme/tokens/icon";
import { getDisciplineColor } from "../../../utils/disciplineFilter";
import PlanDayLoadComparison, { type PlanCalendarLoads } from "./PlanDayLoadComparison";

/** rest → bike 폴백으로 Discipline 타입 보장 (색상/아이콘 표시용) */
function getWorkoutDisciplineForDisplay(workout: string, goalDiscipline?: Discipline): Discipline {
  const d = _gwDiscipline(workout, goalDiscipline);
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


function kstDayOfMonth(ms: number): number | null {
  const dateStr = kstDateString(ms);
  if (!dateStr) return null;
  return Number(dateStr.slice(8, 10));
}

export interface PlanNextAction { day: PlanDay; weekId: string; dayIndex: number }

export interface MobilePlanContentProps extends PlanCalendarLoads {
  nextAction?: PlanNextAction | null;
  selectedDate?: string;
  embedded?: boolean;
  chromeSlot?: ReactNode;
  /** 오늘 훈련 결정·러닝 30분 제안 — 오늘 카드 안에 있을 때만 둔다. */
  decisionSlot?: ReactNode;
  adaptationSlot?: ReactNode;
  /** 이번 주 머리 오른쪽: + 추가 · ⋯ 계획 관리. */
  weekActionsSlot?: ReactNode;
  /** 이번 주 목록 아래: 접힌 계획 대비 기록. */
  comparisonSlot?: ReactNode;
  footerSlot?: ReactNode;
  currentWeek: PlanWeek | null;
  weekLabel: string;
  canPrevWeek?: boolean;
  canNextWeek?: boolean;
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
  remainingSessions?: number;
  onWeekPrev?: () => void;
  onWeekNext?: () => void;
  onEditWorkout?: (day: PlanDay, weekId: string, dayIndex: number) => void;
}

export default function MobilePlanContent({
  dayLoads,
  loadState,
  selectedDate,
  nextAction,
  embedded = false,
  chromeSlot,
  decisionSlot,
  adaptationSlot,
  weekActionsSlot,
  comparisonSlot,
  footerSlot,
  currentWeek,
  weekLabel,
  canPrevWeek = true,
  canNextWeek = true,
  goalTitle,
  goalDiscipline,
  goalDate,
  daysLeft,
  onWeekPrev,
  onWeekNext,
  onEditWorkout,
}: MobilePlanContentProps) {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const [showPastDays, setShowPastDays] = useState(false);
  const [expandedRows, setExpandedDates] = useState<ReadonlySet<string>>(() => new Set());
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
  const formattedGoal = goalTitle ? formatPlanGoalTitle(goalTitle) : null;
  const todayWorkout = todayIdx >= 0 ? days[todayIdx] : null;
  const pendingWorkout = (day: PlanDay) => embedded
    ? !day.completed && !day.skipped && day.workout !== "rest"
    : isPendingPlanWorkout(day, { date: kstDateString(day.date), today: todayStr });
  const todayActionable = todayWorkout && pendingWorkout(todayWorkout);
  const nextWorkoutIdx = todayActionable ? todayIdx : days.findIndex(day =>
    kstDateString(day.date) >= todayStr && pendingWorkout(day),
  );
  const localNextWorkout = nextWorkoutIdx >= 0 ? days[nextWorkoutIdx] : undefined;
  const actionable = !embedded && nextAction !== undefined ? nextAction : localNextWorkout && currentWeek ? {day: localNextWorkout, weekId: currentWeek.id, dayIndex: nextWorkoutIdx} : null;
  const nextWorkout = actionable?.day ?? null;
  const workoutLabel = (day: PlanDay) => day.workout === "goal"
    ? t(goalDate && kstDateString(day.date) === kstDateString(goalDate.getTime()) ? "page.goalDay" : "page.goalWorkout")
    : WORKOUT_LABELS[day.workout] ?? day.workout;
  const nextWorkoutLabel = nextWorkout ? workoutLabel(nextWorkout) : "";
  const nextDuration = nextWorkout ? nextWorkout.adjustedDurationMin ?? nextWorkout.plannedDurationMin : 0;

  /** 데스크톱 PlanPage 의 일별 칸 클릭과 동일하게 WorkoutEditModal(완료/건너뛰기/변경/교환) 을 연다. */
  const openEditFor = (i: number) => {
    const day = days[i];
    if (!day || !currentWeek) return;
    onEditWorkout?.(day, currentWeek.id, i);
  };

  // 이번 주 한 줄 요약: 저장된 완료 상태와 이미 보여 주던 주간 처방 부하 합계만 쓴다(새 파생 지표 없음).
  const scheduledDays = days.filter(day => day.workout !== "rest" && !day.skipped);
  const dayDone = (day: PlanDay) => {
    if (embedded) return day.completed;
    const saved = presentPlanDayRecord(day, { date: kstDateString(day.date), today: todayStr });
    return saved ? saved.outcome === "completed" : day.completed;
  };
  const doneCount = scheduledDays.filter(dayDone).length;
  // 처방 부하만 더한다(adjustedTSS ?? plannedTSS) — 완료된 날의 실측 부하를 섞지 않는다.
  const prescribedLoad = (day: PlanDay) => { const value = day.adjustedTSS ?? day.plannedTSS; return Number.isFinite(value) && value > 0 ? value : 0; };
  const weekLoad = Math.round(scheduledDays.reduce((sum, day) => sum + prescribedLoad(day), 0));
  const nextDateStr = nextWorkout ? kstDateString(nextWorkout.date) : "";
  const nextWeekday = nextWorkout ? DAY_NAMES[(planCalendarDate(nextWorkout.date).getUTCDay() + 6) % 7] ?? "" : "";
  const nextDateLabel = nextDateStr ? `${Number(nextDateStr.slice(5, 7))}/${Number(nextDateStr.slice(8, 10))}` : "";
  const nextTss = nextWorkout ? prescribedLoad(nextWorkout) : 0;
  const todayEyebrow = goalDate && nextDateStr > kstDateString(goalDate.getTime()) ? t("scope.nextAfterGoal")
    : nextDateStr === todayStr ? t("mobile.todayLabel") : t("mobile.nextLabel");
  const goalCountdownLabel = goalDate ? goalCountdown(goalDate.getTime()) : daysLeft != null ? `${t("page.daysLeftPrefix")}${daysLeft}` : "—";
  const goalHref = `/coach/goals?sport=${goalDiscipline === "run" || goalDiscipline === "swim" ? goalDiscipline : "bike"}`;

  return (
    <div data-testid="K4-5m" className="mobile-plan-content">
      {embedded && <h1 className="orider-embedded-page-title">{t("page.embeddedTitle")}</h1>}
      {chromeSlot}

      {/* 오늘 카드 하나 — 다음 운동, 오늘 훈련 결정, 러닝 30분 제안을 한 카드에 둔다. */}
      {nextWorkout ? (
        <Card data-testid="K4-5m-2" padding="compact" className="mobile-plan-next mobile-plan-today" aria-label={t("mobile.todayCard")}>
          <div className="mobile-plan-today__head">
            <Text as="span" variant="caption" tone="secondary">{todayEyebrow} · {nextDateLabel} {nextWeekday}{nextTss > 0 && <> · <GlossaryText>{`${nextTss} TSS`}</GlossaryText></>}</Text>
            {onEditWorkout && actionable && <Button type="button" size="sm" variant="ghost" className="mobile-plan-today__edit" onClick={() => onEditWorkout(actionable.day, actionable.weekId, actionable.dayIndex)}>{t("mobile.edit")}</Button>}
          </div>
          <strong className="mobile-plan-today__title"><GlossaryText>{nextWorkoutLabel}</GlossaryText></strong>
          {nextDuration > 0 && <Text as="span" variant="bodySmall" tone="secondary" className="mobile-plan-today__structure">{`${nextDuration} ${t("mobile.minutesUnit")}`}{nextWorkout.intervals?.length ? ` · ${t("mobile.intervalCount", { count: nextWorkout.intervals.length })}` : ""}</Text>}
          {decisionSlot && <div className="mobile-plan-today__extras plan-decision-slot">{decisionSlot}</div>}
        </Card>
      ) : decisionSlot && <div className="plan-decision-slot mobile-plan-today__extras mobile-plan-today__extras--standalone">{decisionSlot}</div>}

      {adaptationSlot}

      {/* 이번 주 — 주 이동·한 줄 요약·추가·계획 관리를 머리 한 줄에 둔다. */}
      <section className="mobile-plan-week" aria-labelledby="mobile-plan-week-title">
        <div className="mobile-plan-week-header">
          <div data-testid="K4-5m-1" className="mobile-plan-week-navigation" role="group" aria-label={t('mobile.weekHeading')}>
            <IconButton size="sm" icon={<ChevronLeft />} onClick={onWeekPrev} disabled={!onWeekPrev || !canPrevWeek} aria-label={t('mobile.previousWeek')} />
            <Text as="h2" id="mobile-plan-week-title" variant="bodyMedium" weight={600} className="mobile-plan-week-title">{weekLabel}</Text>
            <IconButton size="sm" icon={<ChevronRight />} onClick={onWeekNext} disabled={!onWeekNext || !canNextWeek} aria-label={t('mobile.nextWeek')} />
          </div>
          {weekActionsSlot && <div className="mobile-plan-week-actions">{weekActionsSlot}</div>}
        </div>
        {currentWeek && scheduledDays.length > 0 && (
          <Text as="p" data-testid="K4-7-1" variant="bodySmall" tone="secondary" className="mobile-plan-week-line" aria-label={t('mobile.weeklySummary')}>
            {t("mobile.weekDone", { done: doneCount, total: scheduledDays.length })}{weekLoad > 0 && <> · <GlossaryText>{t("mobile.weekLoad", { tss: weekLoad })}</GlossaryText></>}
          </Text>
        )}
      {embedded && todayIdx > 0 && (
        <Button type="button" variant="secondary" onClick={() => setShowPastDays(value => !value)} aria-expanded={showPastDays}
          style={{ margin: "0 var(--space-4) var(--space-1)", minHeight: "var(--dim-button-height)", height: "var(--dim-button-height)", justifyContent: "flex-start" }}>
          {showPastDays ? t('mobile.hidePastDays') : t('mobile.showPastDays', { count: todayIdx })}
        </Button>
      )}
      {days.map((day, i) => {
        if (embedded && todayIdx > 0 && i < todayIdx && !showPastDays && kstDateString(day.date) !== selectedDate) return null;
        const dayStr = day.date ? kstDateString(day.date) : "";
        const dayOfMonth = day.date ? kstDayOfMonth(day.date) : null;
        const weekdayIndex = (planCalendarDate(day.date).getUTCDay() + 6) % 7;
        const weekdayName = DAY_NAMES[weekdayIndex] ?? "";
        const isToday = dayStr === todayStr;
        const isRest = day.workout === "rest";
        const saved = !embedded ? presentPlanDayRecord(day, {date: dayStr, today: todayStr}) : null;
        const isDone = saved ? saved.outcome === "completed" : day.completed;
        const isPast = dayStr !== "" && dayStr < todayStr;
        const label = workoutLabel(day);
        const state = isDone ? "done" : isToday ? "today" : isRest ? "off" : isPast ? "past" : "planned";
        const stateLabel = saved ? t(saved.outcome === "unconfirmed" || saved.outcome === "today" ? "loadComparison.calendarUnconfirmed" : `planRecords.state.${saved.outcome}`) : state === "done" ? t('mobile.stateDone') : state === "today" ? t('mobile.stateToday') : state === "past" ? t('mobile.statePast') : t('mobile.statePlanned');

        const recordEvidence = <>
                {saved && saved.linkage !== "confirmed" && (saved.linkage !== "none" || ["completed", "partial", "markedComplete"].includes(saved.outcome)) && <Text as="p" variant="caption" tone="secondary">{t(`planRecords.basis.${saved.linkage}`)}</Text>}
                {saved?.postponedToLocalDate && <Text as="p" variant="caption" tone="secondary">{t("planRecords.postponedDate", {date: saved.postponedToLocalDate})}</Text>}
                {/* 저장된 연결 활동·후보 활동으로 가는 링크 — 데스크톱 날짜 칸과 같은 근거를 펼친 줄에 둔다. */}
                {saved?.activityLinks.map(link => <LocalizedLink key={link.id} data-testid="K4-5-5" to={`/activity/${encodeURIComponent(link.id)}`} onClick={event => event.stopPropagation()}>{t(link.kind === "candidate" ? "planRecords.viewCandidate" : "today.viewActivity")}</LocalizedLink>)}
                {embedded && day.actualActivityId && <LocalizedLink data-testid="K4-5-5" to={`/activity/${encodeURIComponent(day.actualActivityId)}`}>{t("today.viewActivity")}</LocalizedLink>}
        </>;
        const intensityColor = isRest ? "var(--ink-4)"
          : (day.workout === "z2Long" || day.workout === "tempo" || day.workout === "tempoRun") ? "var(--amber)"
          : (day.workout === "ftp" || day.workout === "vo2" || day.workout === "sim" || day.workout === "intervalRun" || day.workout === "intervalSwim") ? "var(--rose)"
          : "var(--lime)";
        const intensityLabel = (day.workout === "z2Long" || day.workout === "tempo" || day.workout === "tempoRun") ? t("intensityChip.mod")
          : (day.workout === "ftp" || day.workout === "vo2" || day.workout === "sim" || day.workout === "intervalRun" || day.workout === "intervalSwim") ? t("intensityChip.hard")
          : t("intensityChip.easy");
        const plannedLoad = isRest ? 0 : day.adjustedTSS ?? day.plannedTSS;
        const statusText = isDone ? t("mobile.stateDone") : isToday ? t("mobile.stateToday") : !isRest && Number.isFinite(plannedLoad) && plannedLoad > 0 ? String(plannedLoad) : "";
        const rowKey = `${currentWeek?.id ?? ""}:${i}`;
        const open = expandedRows.has(rowKey);
        const detailId = `mobile-plan-day-${dayStr}-${i}`;
        // 기본은 한 줄(요일·날짜 | 강도 막대 | 운동명 | 짧은 상태). 줄을 누르면 기존 계획/실제/비교 근거와 편집을 펼친다.
        return (
          <div key={i} className={`mobile-plan-day${isRest ? " mobile-plan-day--rest" : ""}`}
            data-plan-date={dayStr}
            data-highlight={dayStr === selectedDate ? "" : undefined}
            aria-current={dayStr === selectedDate ? "date" : undefined}
            data-testid={dayStr === selectedDate ? "K4-5-6" : undefined}>
            <button type="button" className="mobile-plan-day-row" aria-expanded={open} aria-controls={open ? detailId : undefined}
              aria-label={`${weekdayName} ${dayOfMonth ?? ""} ${isRest ? t("mobile.restDay") : label} · ${stateLabel}`}
              onClick={() => setExpandedDates(current => { const next = new Set(current); if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey); return next; })}>
              <span className="mobile-plan-day-row__date"><span>{weekdayName}</span><strong data-today={isToday ? "" : undefined}>{dayOfMonth ?? ""}</strong></span>
              <span className="mobile-plan-day-row__bar" aria-hidden="true" style={{ background: isRest ? "transparent" : intensityColor }} />
              <span className="mobile-plan-day-row__name" data-rest={isRest ? "" : undefined}>{isRest ? t("mobile.restDay") : label}</span>
              <span className="mobile-plan-day-row__status" data-status={isDone ? "done" : isToday ? "today" : undefined}>{statusText}</span>
            </button>
            {open && <div id={detailId} className="mobile-plan-day-detail">
              {!isRest && (() => {
                const d = getWorkoutDisciplineForDisplay(day.workout, goalDiscipline);
                return <span className="mobile-plan-day-detail__sport" style={{ color: getDisciplineColor(d) }}>{d !== "tri" && <SportIcon sport={d} size={ICON_SIZE.sm} />}<span>{t(`discipline.${d}`)}</span><span aria-hidden="true">·</span><span style={{ color: intensityColor }}>{intensityLabel}</span></span>;
              })()}
              {!isRest && day.adjustedTSS != null && currentWeek?.adjustmentFactor != null && <AdjustedChip factor={currentWeek.adjustmentFactor} />}
              {!embedded && loadState && <PlanDayLoadComparison compact day={day} row={dayLoads?.get(dayStr)} state={loadState} evidence={recordEvidence} />}
              <Text as="p" variant="caption" tone="secondary">{stateLabel}</Text>
              {!loadState && recordEvidence}
              {onEditWorkout && !isRest && <Button type="button" size="sm" variant="secondary" className="mobile-plan-day-detail__edit" onClick={() => openEditFor(i)}>{t("mobile.edit")}</Button>}
            </div>}
          </div>
        );
      })}
      </section>

      {comparisonSlot}

      {/* 목표는 한 줄 — 이름 · D-N 과 목표 탭으로 가는 링크만 둔다. 목표 관리는 목표 탭에 있다. */}
      {goalTitle && (
        <LocalizedLink data-testid="K4-2" className="mobile-plan-goal-row" to={goalHref} aria-label={`${goalTitle} · ${goalCountdownLabel} · ${t("mobile.goalLink")}`}>
          <span data-testid="K4-2-1" className="mobile-plan-goal-row__name">{formattedGoal?.name ?? goalTitle}</span>
          <span className="mobile-plan-goal-row__countdown" aria-hidden="true">·</span>
          <span className="mobile-plan-goal-row__countdown">{goalCountdownLabel}</span>
          <span className="mobile-plan-goal-row__link" aria-hidden="true">{t("mobile.goalLink")}</span>
        </LocalizedLink>
      )}

      {footerSlot}
    </div>
  );
}
