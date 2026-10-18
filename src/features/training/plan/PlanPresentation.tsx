import { summarizeStoredPlan } from "./planScope";
import { Eye, RefreshCw, Target } from "lucide-react";
import GlossaryText from "../../../components/common/GlossaryText";
import InfoTip from "../../../components/InfoTip";
import { GoalSourceNotice } from "../../../components/training/GoalInputNotice";
import { planDayKey as kstDayKey, planDayStartMs, planCalendarDate } from "@shared/training/planDate";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Goal, PlanWeek, PlanDay } from "@shared/types/goal";
import { evaluateRecoveryDownshift } from "@shared/training/recoveryDownshift";
import type { PlanModel } from "../../../hooks/usePlanModel";
import { useMobile } from "../../../hooks/useMobile";
import { sumEffectivePlanTSS } from "../../../utils/planTss";
import AdjustedChip from "../../../components/training/AdjustedChip";
import RecoveryDownshiftMarker from "../../../components/training/RecoveryDownshiftMarker";
import { RevalidatingIndicator } from "../../../components/training/RevalidatingIndicator";
import { EmptyState, ErrorState } from "../../../components/redesign";
import { Button, Card, Text } from "../../../theme/components";
import { PlanAdjustmentNarrative } from "../../trainingHub/TrainingHubOpportunityPanel";
import MobilePlanContent, { type MobilePlanContentProps } from "./MobilePlanContent";
import PlanDayActivities from "./PlanDayActivities";
import {
  dailyActivitiesUnavailable,
  planActualProgressPct,
  sumDailyTss,
  usePlanDailyActivities,
  type PlanDailyActivities,
} from "../../../hooks/usePlanDailyActivities";
import {
  buildDayNames,
  buildWorkoutMeta,
  formatDateLabel,
  formatPlanGoalTitle,
  phaseColor,
  phaseLabel,
} from "./planDisplay";

const DAY_MS = 24 * 60 * 60 * 1000;

const COMPACT_PLAN_MEDIA = '(max-width: 1023px)';

/** 달력 9열이 읽히지 않는 태블릿 너비에서는 주간 리스트를 사용한다. */
function useCompactPlanLayout(): boolean {
  const isMobile = useMobile();
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_PLAN_MEDIA).matches);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_PLAN_MEDIA);
    const update = () => setIsNarrow(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  return isMobile || isNarrow;
}

const PLAN_WEEK_GRID_COLUMNS = '80px repeat(7, minmax(72px, 1fr)) 100px';
const PLAN_CALENDAR_CARD_STYLE: CSSProperties = {
  padding: 0,
  overflowX: 'auto',
  overflowY: 'hidden',
  WebkitOverflowScrolling: 'touch',
};

interface DayCellProps {
  selected?: boolean;
  day: PlanDay;
  isToday: boolean;
  /** 주 단위 조정 factor (canonical 값). day별 ratio 재계산 대신 사용. */
  weekAdjustmentFactor?: number;
  currentTsb?: number | null;
  goalDate?: Date | null;
  /** 그날 그 종목 실제 활동(서버 일별 문서). 계획 연결 판정과 무관하게 표시한다. */
  actual?: PlanDailyActivities | null;
  onClick?: () => void;
}

function DayCell({ selected, day, isToday, weekAdjustmentFactor, currentTsb, goalDate, actual, onClick }: DayCellProps) {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const weekdayName = buildDayNames(tCommon)[(planCalendarDate(day.date).getUTCDay() + 6) % 7] ?? '';
  const dateLabel = `${weekdayName} ${formatDateLabel(day.date, day.dayOfWeek)}`.trim();
  const WORKOUT_META = useMemo(() => buildWorkoutMeta(t), [t]);
  const meta = WORKOUT_META[day.workout] ?? WORKOUT_META.rest;
  const isRest = day.workout === 'rest';
  const isGoal = day.workout === 'goal';
  const isGoalDate = !!goalDate && kstDayKey(day.date) === kstDayKey(goalDate.getTime());
  const workoutLabel = isGoal ? t(isGoalDate ? 'page.goalDay' : 'page.goalWorkout') : meta.label;
  const isSkipped = day.skipped === true;
  const isPast = day.date < Date.now() && !isToday;
  const dayKey = kstDayKey(day.date);
  // "한 날" = 그날 그 종목 실제 활동이 있다. 없으면 지난 날은 계획만 흐리게 둔다(미완료 판정은 보이지 않는다).
  const hasActivities = (actual?.days.get(dayKey)?.activities.length ?? 0) > 0;
  const actualList = actual ? <PlanDayActivities actual={actual} dateKey={dayKey} /> : null;
  const dimmed = isPast && !hasActivities && !isRest;
  // 자동 적응 — adjustedTSS/adjustedDurationMin이 있으면 그 값을 표시
  const isAdjusted = day.adjustedTSS != null && !isRest && !isGoal;
  const effectiveTSS = day.adjustedTSS ?? day.plannedTSS;
  const effectiveDur = day.adjustedDurationMin ?? day.plannedDurationMin;
  const daysUntil = Math.max(0, Math.floor((day.date - planDayStartMs(Date.now())) / DAY_MS));
  const downshift = !isPast && !isSkipped && !isRest && !isGoal && !day.completed && !hasActivities && currentTsb != null
    ? evaluateRecoveryDownshift({ workoutKind: day.workout, tsb: currentTsb, daysUntil })
    : null;

  const dateControl = (content: ReactNode, style: CSSProperties) => onClick ? <button
    type="button" aria-label={t('page.dayDetails', { date: kstDayKey(day.date), workout: workoutLabel })}
    onClick={event => { event.stopPropagation(); onClick(); }}
    className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-dark)]"
    style={{ ...style, border: 0, padding: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 24 }}>
    {content}<Eye size={12} aria-hidden="true" />
  </button> : <div style={style}>{content}</div>;

  // 건너뛴 날은 휴식처럼 흐리게 + 취소선
  if (isSkipped) {
    return (
      <div
        data-testid={selected ? "K4-5-6" : "K4-5-1"}
        data-plan-date={kstDayKey(day.date)}
        aria-current={selected ? "date" : undefined}
        onClick={onClick}
        style={{
          padding: '28px 8px 8px',
          borderRadius: "var(--r-sm)",
          minHeight: 82,
          cursor: 'pointer',
          background: 'var(--bg-2)',
          border: '1px solid var(--line-soft)',
          opacity: hasActivities ? 1 : 0.65,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        <div style={{ fontSize: "var(--fs-sm)", color: 'var(--ink-2)', textDecoration: 'line-through', paddingLeft: 6 }}>
          <span onClick={event => event.stopPropagation()}><GlossaryText>{meta.label}</GlossaryText></span>
        </div>
        <div style={{ fontSize: "var(--ft-body-size)", color: 'var(--ink-4)', paddingLeft: 6, fontFamily: 'inherit' }}>
          {t('page.skipped')}
        </div>
        {actualList}
        {dateControl(dateLabel, {
          position: 'absolute', top: 2, right: 4,
          fontFamily: 'inherit', fontSize: "var(--ft-body-size)", color: 'var(--ink-2)',
        })}
      </div>
    );
  }

  if (isGoal) {
    return (
      <div data-testid={selected ? "K4-5-6" : "K4-5-1"} data-plan-date={kstDayKey(day.date)} aria-current={selected ? "date" : undefined}
        style={{
          padding: '6px 4px',
          borderRadius: "var(--r-sm)",
          minHeight: 82,
          background: isGoalDate ? 'var(--lime)' : 'var(--bg-2)',
          color: isGoalDate ? 'var(--primary-fg)' : 'var(--ink-1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: isToday ? '2px solid var(--ink-0)' : isGoalDate ? 'none' : '1px solid var(--line-soft)',
          position: 'relative',
        }}
      >
        {isGoalDate && <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>}
        <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, marginTop: 'var(--space-1)', letterSpacing: '0.04em' }}>{workoutLabel}</div>
        {actualList}
        {dateControl(dateLabel, {
          position: 'absolute', top: 2, right: 4,
          fontFamily: 'inherit', fontSize: "var(--ft-body-size)", color: isGoalDate ? 'var(--primary-fg)' : 'var(--ink-1)',
        })}
      </div>
    );
  }

  return (
    <div
      data-plan-date={kstDayKey(day.date)}
      aria-current={selected ? "date" : undefined}
      data-testid={selected ? "K4-5-6" : "K4-5-1"} onClick={!isGoal ? onClick : undefined}
      style={{
        padding: '28px 8px 8px',
        borderRadius: "var(--r-sm)",
        minHeight: 82,
        cursor: !isGoal ? 'pointer' : 'default',
        background: isToday
          ? 'color-mix(in oklch, var(--lime) 10%, var(--bg-2))'
          : 'var(--bg-2)',
        border: `1px solid ${isToday || selected ? 'var(--lime)' : 'var(--line-soft)'}`,
        opacity: isRest && !hasActivities ? 0.65 : dimmed ? 0.85 : 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      {/* TODAY badge */}
      {isToday && (
        <div
          style={{
            alignSelf: 'flex-start',
            paddingLeft: 'var(--space-1-5)',
            fontSize: "var(--fs-2xs)",
            color: 'var(--ink-1)',
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          TODAY
        </div>
      )}
      {/* Color bar */}
      <div
        style={{
          width: 3,
          height: 18,
          background: meta.color,
          borderRadius: "var(--r-xs)",
          position: 'absolute',
          top: 6,
          left: 0,
        }}
      />
      <div
        style={{
          fontSize: "var(--fs-md)",
          color: 'var(--ink-0)',
          fontWeight: 600,
          paddingLeft: 6,
          lineHeight: 1.25,
        }}
      >
        <span onClick={event => event.stopPropagation()}><GlossaryText>{meta.label}</GlossaryText></span>
      </div>
      {(effectiveDur > 0 || effectiveTSS > 0) && (
        <div
          style={{
            fontSize: "var(--fs-base)",
            color: 'var(--ink-1)',
            paddingLeft: 6,
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.25,
            display: 'flex',
            flexWrap: 'wrap',
            columnGap: 'var(--space-1)',
          }}
        >
          {effectiveDur > 0 && <span style={{ whiteSpace: 'nowrap' }}>{effectiveDur} {t('mobile.minutesUnit')}</span>}
          {effectiveTSS > 0 && <span onClick={event => event.stopPropagation()} style={{ whiteSpace: 'nowrap' }}><GlossaryText>{`${effectiveTSS} TSS`}</GlossaryText></span>}
        </div>
      )}
      {actualList}
      {/* 자동 조정 칩 — week 단위 canonical factor 사용 (day별 ratio 누적 오차 회피) */}
      {isAdjusted && weekAdjustmentFactor != null && (
        <div style={hasActivities ? { paddingLeft: 'var(--space-1-5)' } : { position: 'absolute', bottom: 4, left: 6 }}>
          <AdjustedChip factor={weekAdjustmentFactor} />
        </div>
      )}
      {!isAdjusted && downshift?.shouldDownshift && downshift.suggestedSwap && (
        <div style={hasActivities ? { paddingLeft: 'var(--space-1-5)' } : { position: 'absolute', bottom: 4, left: 6 }}>
          <RecoveryDownshiftMarker suggestedSwap={downshift.suggestedSwap} tsb={downshift.reasonTsb} />
        </div>
      )}
      {dateControl(<>
        <span>{dateLabel}</span>
        {/* 한 날 — 그날 그 종목 실제 활동이 있으면 ✓ */}
        {hasActivities && (
          <svg data-testid="K4-5-14" role="img" aria-label={t('page.activeDay')} width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: 'var(--lime)' }}>
            <path
              d="M1.5 5l2.5 2.5 5-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </>, {
          position: 'absolute',
          top: 4,
          right: 4,
          maxWidth: 'calc(100% - 8px)',
          display: 'flex',
          alignItems: 'center',
          gap: "var(--space-1)",
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          fontSize: "var(--ft-body-size)",
          color: 'var(--ink-1)',
          fontWeight: isToday ? 700 : 500,
        })}

    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────

function SkeletonGrid() {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const DAY_NAMES = useMemo(() => buildDayNames(tCommon), [tCommon]);
  return (
    <Card data-testid="K4-5" padding="none" style={PLAN_CALENDAR_CARD_STYLE}>
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: PLAN_WEEK_GRID_COLUMNS,
          padding: '10px 14px',
          borderBottom: '1px solid var(--line-soft)',
          background: 'var(--bg-2)',
          gap: "var(--space-1-5)",
        }}
      >
        <Text as="div" variant="bodyMedium">{t('page.weekHeader')}</Text>
        {DAY_NAMES.map((d) => (
          <Text key={d} as="div" variant="bodyMedium" style={{ textAlign: 'center' }}>{d}</Text>
        ))}
        <Text as="div" variant="bodyMedium" style={{ textAlign: 'right' }}><GlossaryText>{t('page.tssHeader')}</GlossaryText></Text>
      </div>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: PLAN_WEEK_GRID_COLUMNS,
            gap: "var(--space-1-5)",
            padding: '10px 14px',
            borderBottom: i < 11 ? '1px solid var(--line-soft)' : 'none',
          }}
        >
          <div
            style={{
              height: 62,
              background: 'var(--bg-2)',
              borderRadius: "var(--r-sm)",
              opacity: 0.5,
            }}
          />
          {Array.from({ length: 7 }).map((_, j) => (
            <div
              key={j}
              style={{
                height: 62,
                background: 'var(--bg-2)',
                borderRadius: "var(--r-sm)",
                opacity: 0.3,
              }}
            />
          ))}
          <div
            style={{
              height: 62,
              background: 'var(--bg-2)',
              borderRadius: "var(--r-sm)",
              opacity: 0.3,
            }}
          />
        </div>
      ))}
    </Card>
  );
}

// ── Phase Bar ─────────────────────────────────────────────────────────

interface PhaseBarProps {
  weeks: PlanWeek[];
  goal: Goal | null;
  onIcsExport?: () => void;
  onGoalReset?: () => void;
  onReroll?: () => void | Promise<void>;
  onAbandon?: () => void | Promise<void>;
  renderMobile?: (props: MobilePlanContentProps) => ReactNode;
}

function PhaseBar({ weeks, goal, onIcsExport, onGoalReset, onReroll, onAbandon }: PhaseBarProps) {
  const { t } = useTranslation('training');
  // #365: base(기초 유산소 축적기) — 생성기가 아직 emit 하지 않을 수 있어 0건이면 자동 숨김.
  const baseCount   = weeks.filter((w) => w.phase === 'base').length;
  const buildCount  = weeks.filter((w) => w.phase === 'build').length;
  const peakCount   = weeks.filter((w) => w.phase === 'peak').length;
  const taperCount  = weeks.filter((w) => w.phase === 'taper').length;
  const total = weeks.length || 1;

  const segments = [
    { phase: t('phase.base'), count: baseCount, color: 'var(--violet)' },
    { phase: t('phase.build'), count: buildCount, color: 'var(--aqua)' },
    { phase: t('phase.peak'), count: peakCount,  color: 'var(--lime)' },
    { phase: t('phase.taper'), count: taperCount, color: 'var(--amber)' },
  ].filter((s) => s.count > 0);

  return (
    <Card data-testid="K4-3" padding="none"
      style={{
        padding: '12px 14px',
        marginBottom: 'var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        gap: "var(--space-3)",
        flexWrap: 'wrap',
      }}
    >
      <Text data-testid="K4-3-1" as="div" variant="bodyMedium" style={{ flexShrink: 0 }}>{t('phase.label')}</Text>
      <div
        style={{
          flex: 1,
          minWidth: 160,
          display: 'flex',
          height: 20,
          borderRadius: "var(--r-sm)",
          overflow: 'hidden',
          gap: "var(--space-0-5)",
        }}
      >
        {segments.map(({ phase, count, color }) => (
          <div
            key={phase}
            style={{
              flex: count / total,
              background: color,
              opacity: 0.8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-1)',
              fontSize: "var(--ft-body-size)",
              fontFamily: 'inherit',
              color: 'var(--primary-fg)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              paddingInline: 'var(--space-1)',
            }}
          >
            <span>{phase}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{count}{' '}{t('phase.weeksUnit')}</span>
          </div>
        ))}
      </div>
      {/* Action buttons inline with phase bar */}
      {(onIcsExport || onReroll || onGoalReset || onAbandon) && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
        {goal && onIcsExport && (
          <Button variant="secondary" size="sm" data-testid="K4-3-2" onClick={onIcsExport}>
            {t('buttons.ics')}
          </Button>
        )}
        {onReroll && (
          <Button variant="secondary" size="sm" leadingIcon={<RefreshCw size={16} aria-hidden="true" />} data-testid="K4-3-3" onClick={() => { void onReroll(); }}>
            {t('buttons.reroll')}
          </Button>
        )}
        {onGoalReset && (
          <Button variant="secondary" size="sm" leadingIcon={<Target size={16} aria-hidden="true" />} data-testid="K4-3-4" onClick={onGoalReset}>
            {t('buttons.goalReset')}
          </Button>
        )}
        {onAbandon && (
          <Button variant="secondary" size="sm"
            style={{ color: 'var(--rose)' }}
            data-testid="K4-3-5" onClick={() => { void onAbandon(); }}
          >
            {t('buttons.abandonGoal')}
          </Button>
        )}
        </div>
      )}
    </Card>
  );
}

// ── Legend ────────────────────────────────────────────────────────────

function Legend() {
  const { t } = useTranslation('training');
  const items: Array<[string, string]> = [
    [t('legend.z1Recovery'), 'var(--ink-4)'],
    [t('legend.z2Endurance'), 'var(--aqua)'],
    [t('legend.z3Tempo'), 'var(--amber)'],
    [t('legend.z4Threshold'), 'var(--rose)'],
    [t('legend.z5VO2'), 'var(--rose)'],
    [t('legend.simGoal'), 'var(--lime)'],
  ];

  return (
    <div data-testid="K4-5-3"
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        marginTop: "var(--space-3)",
        padding: '12px 14px',
        fontSize: "var(--fs-xs)",
        background: 'var(--bg-1)',
        border: '1px solid var(--line-soft)',
        borderRadius: "var(--r-md)",
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: "var(--space-1-5)" }}>
          <span
            style={{
              width: 3,
              height: 12,
              background: color,
              borderRadius: "var(--r-xs)",
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'var(--ink-2)' }}><GlossaryText>{label}</GlossaryText></span>
        </div>
      ))}
      <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>
        {t('legend.note')}
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export interface PlanPresentationProps {
  selectedDate?: string;
  model: PlanModel;
  embedded?: boolean;
  decisionSlot?: ReactNode;
  adaptationSlot?: ReactNode;
  mobileWeekOffset: number;
  onMobileWeekOffsetChange: (offset: number) => void;
  onEditWorkout?: (day: PlanDay, weekId: string, dayIndex: number) => void;
  onIcsExport?: () => void;
  onReroll?: () => void | Promise<void>;
  onGoalReset?: () => void;
  onAbandon?: () => void | Promise<void>;
  renderMobile?: (props: MobilePlanContentProps) => ReactNode;
}

export default function PlanPresentation({
  selectedDate,
  model,
  embedded = false,
  decisionSlot,
  adaptationSlot,
  mobileWeekOffset,
  onMobileWeekOffsetChange,
  onEditWorkout,
  onIcsExport,
  onReroll,
  onGoalReset,
  onAbandon,
  renderMobile,
}: PlanPresentationProps) {
  const { t, i18n } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const [goalExpanded, setGoalExpanded] = useState(false);
  const [showPreviousWeeks, setShowPreviousWeeks] = useState(false);
  const DAY_NAMES = useMemo(() => buildDayNames(tCommon), [tCommon]);
  const {
    discipline,
    goal,
    weeks,
    loading,
    loadError,
    goalMatchesDiscipline,
    revalidating,
    justRecomputed,
    currentTsb,
    goalDate,
    daysLeft,
    totalTSS,
    weeksLeft,
    isTodayCell,
    retryLoad,
  } = model;
  // 날짜 칸·주간·상단의 실제 활동·부하는 서버 일별 활동 문서만 읽는다(계획 연결 판정과 무관).
  // 목표가 없거나 종목이 맞지 않으면 계획 칸이 없으니 구독하지 않는다.
  const actual = usePlanDailyActivities({
    uid: model.user?.uid,
    discipline,
    weeks,
    enabled: goal !== null && goalMatchesDiscipline,
  });
  const hasActivityOn = (dateKey: string) => (actual?.days.get(dateKey)?.activities.length ?? 0) > 0;
  // 문서를 읽기 전에는 "한 날"을 알 수 없으니 다음 운동·남은 운동 수를 비운다.
  const activityKnown = actual != null && !actual.loading;
  const actualTotal = actual?.total ?? null;
  // 진행률 = 실제 부하(계획 첫날~오늘) / 계획 TSS. 실제 부하를 아직 모르면 비운다.
  const progress = planActualProgressPct(totalTSS, actual);
  const firstCalendarWeek = weeks.find(week => week.days.length > 0);
  const firstCalendarWeekday = firstCalendarWeek?.days[0]
    ? (planCalendarDate(firstCalendarWeek.days[0].date).getUTCDay() + 6) % 7 : 0;
  const calendarDayNames = DAY_NAMES.map((fallback, index) => {
    const date = firstCalendarWeek?.days[index]?.date;
    const weekdayIndex = date != null ? (planCalendarDate(date).getUTCDay() + 6) % 7 : (firstCalendarWeekday + index) % 7;
    return DAY_NAMES[weekdayIndex] ?? fallback;
  });
  const isMobile = useCompactPlanLayout();
  const currentWeekIndex = useMemo(() => {
    const todayIndex = weeks.findIndex((week) => week.days.some(isTodayCell));
    if (todayIndex >= 0) return todayIndex;
    const futureIndex = weeks.findIndex((week) => week.days.some((day) => day.date >= Date.now()));
    return futureIndex >= 0 ? futureIndex : Math.max(0, weeks.length - 1);
  }, [isTodayCell, weeks]);
  useEffect(() => {
    if (!selectedDate) return;
    const selectedWeek = weeks.findIndex(week => week.days.some(day => kstDayKey(day.date) === selectedDate));
    if (selectedWeek >= 0 && selectedWeek < currentWeekIndex) setShowPreviousWeeks(true);
  }, [selectedDate, weeks, currentWeekIndex]);
  const hasCurrentWeek = weeks[currentWeekIndex]?.days.some(isTodayCell) ?? false;
  const visibleWeeks = showPreviousWeeks || currentWeekIndex === 0 ? weeks : weeks.slice(currentWeekIndex);
  const todayKey = kstDayKey(Date.now());
  // 남은 계획 운동: 오늘 이후 예정(건너뜀·휴식·목표일 제외)에서 이미 활동이 있는 날을 뺀다.
  const remainingSessions = activityKnown ? weeks.reduce((total, week) => total + week.days.filter((day) => {
    const key = kstDayKey(day.date);
    return key >= todayKey && !hasActivityOn(key) && !day.skipped && day.workout !== 'rest' && day.workout !== 'goal';
  }).length, 0) : undefined;
  const planScope = summarizeStoredPlan(weeks, goalDate, Date.now(), hasActivityOn);
  const scopeNotice = goalDate && planScope.afterGoal > 0 ? <Text data-testid="plan-scope-notice" as="p" variant="bodySmall" tone="secondary" style={{ padding: "var(--space-3) var(--space-4)" }}>{t("scope.summary", planScope)}</Text> : null;
  const nextAction = !activityKnown ? undefined : weeks.slice(currentWeekIndex).flatMap((week) => week.days.map((day, dayIndex) => ({ day, weekId: week.id, dayIndex })))
    .find(({ day }) => kstDayKey(day.date) >= todayKey && !hasActivityOn(kstDayKey(day.date)) && !day.skipped && day.workout !== 'rest' && day.workout !== 'goal');
  const nextActionLabel = nextAction ? buildWorkoutMeta(t)[nextAction.day.workout]?.label ?? nextAction.day.workout : null;
  const goalTitle = goal?.title ?? goal?.courseName ?? '—';
  const formattedGoal = formatPlanGoalTitle(goalTitle);
  const mobilePlanViewModel = useMemo(() => {
    const mobileWeekIdx = Math.max(0, Math.min(weeks.length - 1, currentWeekIndex + mobileWeekOffset));
    return {
      currentWeek: weeks[mobileWeekIdx] ?? null,
      weekIndex: mobileWeekIdx,
      weekLabel: mobileWeekIdx === currentWeekIndex && hasCurrentWeek ? t('mobile.weekThis') : `W${mobileWeekIdx + 1}`,
      canPrevWeek: mobileWeekIdx > 0,
      canNextWeek: mobileWeekIdx < weeks.length - 1,
    };
  }, [currentWeekIndex, hasCurrentWeek, mobileWeekOffset, t, weeks]);
  if (!loading && loadError) {
    return (
      <div className={embedded ? "embedded-plan-presentation" : "site-shell"} style={{ paddingBottom: 'var(--space-8)' }}>
        {!embedded && (
          <div style={{ padding: "16px 0 12px", borderBottom: "1px solid var(--line-soft)", marginBottom: 'var(--space-7)' }}>

          </div>
        )}
        <GoalSourceNotice goal={goal} discipline={discipline} />
        {decisionSlot && <div style={{ marginBottom: "var(--space-4)" }}>{decisionSlot}</div>}
        <div style={{ padding: "24px 0" }}>
          <ErrorState title={tCommon("error.title")} onRetry={retryLoad} />
        </div>
      </div>
    );
  }

  if (!loading && !goal) {
    const sportLabel = t(`discipline.${discipline}`);
    const sportIcon = t(`disciplineIcon.${discipline}`);
    return (
      <div className={embedded ? "embedded-plan-presentation" : "site-shell"} style={{ paddingBottom: 'var(--space-8)' }}>
        {!embedded && (
          <div style={{ padding: "16px 0 12px", borderBottom: "1px solid var(--line-soft)", marginBottom: 'var(--space-7)' }}>

          </div>
        )}
        {embedded && <h1 className="orider-embedded-page-title">{t("page.embeddedTitle")}</h1>}
        <div style={{ padding: "var(--space-6) 0" }}>
          <EmptyState
            compact={embedded}
            icon={sportIcon}
            title={t('page.planEmpty', { sportLabel })}
            description={t(embedded ? 'page.planEmptyEmbeddedDesc' : 'page.planEmptyDesc', { sportLabel })}
            actions={embedded ? [{ label: tCommon("button.retry"), variant: "primary", onClick: () => retryLoad() }] : [
              { label: t('page.planEmptyAction', { sportLabel }), variant: "primary", href: `/goal-setup?sport=${discipline}` },
            ]}
          />
        </div>
      </div>
    );
  }

  if (!loading && goal && !goalMatchesDiscipline) {
    const sportLabel = t(`discipline.${discipline}`);
    const sportIcon = t(`disciplineIcon.${discipline}`);
    return (
      <div className={embedded ? "embedded-plan-presentation" : "site-shell"} style={{ paddingBottom: 'var(--space-8)' }}>
        {!embedded && (
          <div style={{ padding: "16px 0 12px", borderBottom: "1px solid var(--line-soft)", marginBottom: 'var(--space-7)' }}>

          </div>
        )}
        {embedded && <h1 className="orider-embedded-page-title">{t("page.embeddedTitle")}</h1>}
        <div style={{ padding: "var(--space-6) 0" }}>
          <EmptyState
            compact={embedded}
            icon={sportIcon}
            title={t('page.planEmpty', { sportLabel })}
            description={t(embedded ? 'page.planEmptyEmbeddedDesc' : 'page.planEmptyDesc', { sportLabel })}
            actions={embedded ? [{ label: tCommon("button.retry"), variant: "primary", onClick: () => retryLoad() }] : [
              { label: t('page.planEmptyAction', { sportLabel }), variant: "primary", href: `/goal-setup?sport=${discipline}` },
            ]}
          />
        </div>
      </div>
    );
  }

  if (isMobile && !loading) {
    const mobileProps: MobilePlanContentProps = {
      selectedDate,
      embedded,
      currentWeek: mobilePlanViewModel.currentWeek,
      weekLabel: mobilePlanViewModel.weekLabel,
      canPrevWeek: mobilePlanViewModel.canPrevWeek,
      canNextWeek: mobilePlanViewModel.canNextWeek,
      goalTitle: goal?.title ?? goal?.courseName,
      goalDiscipline: goal?.discipline,
      goalDate,
      daysLeft,
      progressPct: progress ?? undefined,
      actual,
      totalTSS,
      weeksLeft,
      remainingSessions,
      onWeekPrev: () => onMobileWeekOffsetChange(mobilePlanViewModel.weekIndex - 1 - currentWeekIndex),
      onWeekNext: () => onMobileWeekOffsetChange(mobilePlanViewModel.weekIndex + 1 - currentWeekIndex),
      onEditWorkout: embedded ? undefined : onEditWorkout,
    };
    return (
      <>
        <GoalSourceNotice goal={goal} discipline={discipline} />
        {scopeNotice}
        {decisionSlot && <div style={{ padding: "var(--space-3) var(--space-4)" }}>{decisionSlot}</div>}
        {renderMobile ? renderMobile(mobileProps) : <MobilePlanContent {...mobileProps} />}
      </>
    );
  }

  return (
    <div className={embedded ? "embedded-plan-presentation" : "site-shell"} style={{ paddingBottom: 'var(--space-8)' }}>

      <GoalSourceNotice goal={goal} discipline={discipline} />
      {scopeNotice}
      {/* ── Goal Header ─────────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--bg-1)',
          borderBottom: '1px solid var(--line-soft)',
          padding: '24px 0',
          marginBottom: 0,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
            gap: "var(--space-6)",
            alignItems: 'stretch',
          }}
        >
          {/* Left: goal name + date */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
              {!embedded && (
                <>
                  <Text as="div" variant="bodyMedium">
                    {t('page.planTitle')}
                  </Text>

                </>
              )}
              <RevalidatingIndicator
                visible={revalidating || justRecomputed}
                mode={revalidating ? "updating" : "success"}
                message={revalidating ? t('plan.revalidatingUpdating') : t('plan.revalidatingDone')}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: "var(--space-3)",
                marginBottom: 'var(--space-2)',
                flexWrap: 'wrap',
              }}
            >
              <Text data-testid="K4-2-1" as="h2" variant="title" title={goalTitle} aria-label={goalTitle} style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere', ...(!goalExpanded ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' } : {}) }}>
                {loading ? '...' : (goalExpanded ? goalTitle : formattedGoal.name)}
              </Text>
              <span
                style={{
                  fontSize: "var(--fs-xs)",
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: "9999px",
                  background: 'var(--bg-2)',
                  border: '1px solid var(--lime)',
                  color: 'var(--ink-1)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('page.inProgress')}
              </span>
              {(formattedGoal.meta || goalTitle.length > 50) && (
                <Button type="button" variant="ghost" size="sm" data-testid="K4-2-3" aria-expanded={goalExpanded} onClick={() => setGoalExpanded(value => !value)}>
                  {goalExpanded ? t('mobile.collapseGoal') : t('mobile.showOriginal')}
                </Button>
              )}
            </div>
            {!goalExpanded && formattedGoal.meta && <div style={{ color: 'var(--ink-3)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-2)' }}>{formattedGoal.meta}</div>}
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-5)',
                fontSize: "var(--ft-body-size)",
                color: 'var(--ink-2)',
                fontFamily: 'inherit',
                flexWrap: 'wrap',
              }}
            >
              {goalDate && (
                <span>
                  {t('page.goalDateLabel')}{' '}
                  <span style={{ color: 'var(--ink-0)', fontFamily: 'var(--font-mono)' }}>
                    {goalDate.toLocaleDateString(i18n.language, {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                    })}
                  </span>
                </span>
              )}
              <span>
                {t('page.daysLeftPrefix')}<span style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-mono)' }}>{daysLeft}</span>
              </span>
              {goal && goal.goalType !== 'climb' && (goal.courseDist > 0 || goal.courseElev > 0) && (
                <span>
                  {goal.courseDist > 0 && `${t('metrics.distanceLabel')} ${goal.courseDist.toFixed(1)} km`}{goal.courseDist > 0 && goal.courseElev > 0 && ' · '}{goal.courseElev > 0 && `${t('metrics.elevationLabel')} ${Math.round(goal.courseElev)} m`}
                </span>
              )}
              {goal?.goalType === 'climb' && (
                <span>
                  {goal.target?.climbDurationMin ?? goal.targetDurationMin} min
                  {goal.target?.targetWkg != null && <> · <GlossaryText>{`${goal.target.targetWkg.toFixed(1)} W/kg`}</GlossaryText></>}
                </span>
              )}
              {goal?.goalType !== 'climb' && goal?.targetDurationMin && (
                <span>
                  {t('page.targetDuration')}{' '}
                  <span style={{ color: 'var(--ink-0)' }}>
                    {Math.floor(goal.targetDurationMin / 60)}h {goal.targetDurationMin % 60}m
                  </span>
                </span>
              )}
            </div>
            <div style={{ marginTop: 'var(--space-4)', maxWidth: 480 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--space-1)', color: 'var(--ink-2)', fontSize: 'var(--fs-sm)' }}>
                <InfoTip title={t('metrics.progress')} content={t('metrics.progressBasis')}>{t('metrics.progress')}</InfoTip>
                <strong style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-md)' }}>{progress != null ? `${progress}%` : '—'}</strong>
              </div>
              <div role="progressbar" aria-label={t('metrics.progress')} aria-valuenow={progress ?? undefined} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 'var(--r-xs)', background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, progress ?? 0))}%`, background: 'var(--lime)' }} />
              </div>
            </div>
          </div>

          {/* Right: 4-KPI */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: "var(--space-2)",
            }}
          >
            {[
              { label: t('metrics.sessionsLeft'), value: remainingSessions != null ? String(remainingSessions) : '—', unit: remainingSessions != null ? t('mobile.sessionsUnit') : '', color: 'var(--ink-0)' },
              // 실제 부하: 서버 일별 문서 기준 계획 첫날~오늘 합계(계획 TSS 와 나란히)
              ...(actual ? [{ testId: 'K4-2-5', hint: t('metrics.actualTSSBasis'), label: t('metrics.actualTSS'),
                value: actualTotal?.value != null ? actualTotal.value.toLocaleString() : '—',
                unit: `${totalTSS > 0 ? `/ ${totalTSS.toLocaleString()}` : 'TSS'}${actualTotal?.estimated ? ` ${t('page.tssEstimated')}` : ''}`, color: 'var(--ink-0)' }] : []),
              { label: t('metrics.weeksLeft'), value: String(weeksLeft),    unit: t('metrics.weeksUnit'),  color: 'var(--ink-0)' },
            ].map(({ testId, hint, label, value, unit, color }: { testId?: string; hint?: string; label: string; value: string; unit: string; color: string }) => (
              <div
                key={label}
                data-testid={testId}
                title={hint}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  background: 'var(--bg-2)',
                  borderRadius: "var(--r-md)",
                  border: '1px solid var(--line-soft)',
                }}
              >
                <Text as="div" variant="bodyMedium" style={{ marginBottom: "var(--space-1-5)" }}><GlossaryText>{label}</GlossaryText></Text>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
                  <Text variant="dataLarge" style={{ color }}>{value}</Text>
                  {unit && (
                    <span
                      style={{
                        fontSize: "var(--fs-sm)",
                        color: 'var(--ink-2)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {unit}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 0 0' }}>
        {decisionSlot && <div style={{ marginBottom: "var(--space-4)" }}>{decisionSlot}</div>}

        {!loading && nextAction && (
          <Card padding="compact" style={{ marginBottom: 'var(--space-3)', borderColor: 'var(--lime)', background: 'color-mix(in oklch, var(--lime) 5%, var(--bg-1))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Text as="div" variant="bodyMedium" style={{ color: 'var(--ink-1)' }}>{goalDate && kstDayKey(nextAction.day.date) > kstDayKey(goalDate.getTime()) ? t('scope.nextAfterGoal') : kstDayKey(nextAction.day.date) === todayKey ? t('mobile.todayNext') : t('mobile.weekNext')}</Text>
              <strong style={{ color: 'var(--ink-0)', fontSize: 'var(--fs-md)' }}><GlossaryText>{nextActionLabel}</GlossaryText></strong>
              <span style={{ color: 'var(--ink-2)', fontSize: 'var(--fs-sm)', fontFamily: 'var(--font-mono)' }}>
                {new Date(nextAction.day.date).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}
                {(nextAction.day.adjustedDurationMin ?? nextAction.day.plannedDurationMin) > 0 && ` · ${nextAction.day.adjustedDurationMin ?? nextAction.day.plannedDurationMin} ${t('mobile.minutesUnit')}`}
                {(nextAction.day.adjustedTSS ?? nextAction.day.plannedTSS) > 0 && <> · <GlossaryText>{`${nextAction.day.adjustedTSS ?? nextAction.day.plannedTSS} TSS`}</GlossaryText></>}
              </span>
              {onEditWorkout && !embedded && <Button type="button" size="sm" style={{ marginLeft: 'auto' }} onClick={() => onEditWorkout(nextAction.day, nextAction.weekId, nextAction.dayIndex)}>{t('page.workoutDetails')}</Button>}
            </div>
          </Card>
        )}

        <PlanAdjustmentNarrative goal={goal} weeks={weeks} t={t} />

        {adaptationSlot}

        {/* Phase Bar */}
        {!loading && weeks.length > 0 && (
          <PhaseBar
            weeks={weeks}
            goal={goal}
            onIcsExport={embedded ? undefined : onIcsExport}
            onReroll={embedded ? undefined : onReroll}
            onGoalReset={embedded ? undefined : onGoalReset}
            onAbandon={embedded ? undefined : onAbandon}
          />
        )}

        {!loading && weeks.length > 0 && currentWeekIndex > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <Text as="div" variant="bodyMedium">{hasCurrentWeek && `${t('mobile.weekThis')} · `}W{weeks[currentWeekIndex]?.weekNumber}</Text>
            <Button type="button" variant="ghost" size="sm" data-testid="K4-5-4" aria-expanded={showPreviousWeeks} onClick={() => setShowPreviousWeeks(value => !value)}>
              {showPreviousWeeks ? t('mobile.hidePastWeeks') : t('mobile.showPastWeeks', { count: currentWeekIndex })}
            </Button>
          </div>
        )}

        {/* Calendar Grid */}
        {loading ? (
          <SkeletonGrid />
        ) : (
          <Card data-testid="K4-5" padding="none" style={PLAN_CALENDAR_CARD_STYLE}>
            {/* Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: PLAN_WEEK_GRID_COLUMNS,
                padding: '10px 14px',
                borderBottom: '1px solid var(--line-soft)',
                background: 'var(--bg-2)',
                gap: "var(--space-1-5)",
              }}
            >
              <Text as="div" variant="bodyMedium">{t('page.weekHeader')}</Text>
              {calendarDayNames.map((d) => (
                <Text
                  key={d} as="div" variant="bodyMedium"
                  style={{
                    textAlign: 'center',
                    color: DAY_NAMES.slice(5).includes(d) ? 'var(--ink-2)' : 'var(--ink-3)',
                  }}
                >
                  {d}
                </Text>
              ))}
              <Text as="div" variant="bodyMedium" style={{ textAlign: 'right' }}><GlossaryText>{t('page.tssHeader')}</GlossaryText></Text>
            </div>

            {/* Rows */}
            {weeks.length === 0 ? (
              <div
                style={{
                  padding: '40px 14px',
                  textAlign: 'center',
                  color: 'var(--ink-3)',
                  fontSize: "var(--fs-sm)",
                }}
              >
                {t('page.planEmptyBody')}
              </div>
            ) : (
              visibleWeeks.map((wk, wi) => {
                const weekTSS = sumEffectivePlanTSS(wk.days);
                // 주간 실제 TSS: 이미 시작한 주만, 그 주 날짜를 모두 확인할 수 있을 때만 보인다.
                const weekKeys = wk.days.map(day => kstDayKey(day.date));
                const weekActual = actual && !actual.loading && weekKeys.some(key => key !== '' && key <= actual.todayKey)
                  && !weekKeys.some(key => dailyActivitiesUnavailable(actual, key))
                  ? sumDailyTss(actual.days, weekKeys) : null;
                const isCurrentWeek = wk.days.some(isTodayCell);
                const pc = phaseColor(wk.phase);

                return (
                  <div
                    key={wk.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: PLAN_WEEK_GRID_COLUMNS,
                      gap: "var(--space-1-5)",
                      padding: '10px 14px',
                      borderBottom: wi < visibleWeeks.length - 1 ? '1px solid var(--line-soft)' : 'none',
                      background: isCurrentWeek
                        ? 'color-mix(in oklch, var(--lime) 3%, var(--bg-1))'
                        : 'transparent',
                    }}
                  >
                    {/* Week label */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        paddingLeft: 6,
                        borderLeft: `3px solid ${pc}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: "var(--fs-sm)",
                          fontWeight: 600,
                          color: 'var(--ink-0)',
                        }}
                      >
                        W{wk.weekNumber}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--ft-body-size)",
                          color: pc,
                          fontFamily: 'inherit',
                        }}
                      >
                        {phaseLabel(wk.phase, t)}
                      </div>
                    </div>

                    {/* Day cells — pad to 7 if fewer days */}
                    {Array.from({ length: 7 }).map((_, di) => {
                      const day = wk.days[di];
                      if (!day) {
                        return <div key={di} />;
                      }
                      return (
                        <DayCell
                          key={di}
                          selected={kstDayKey(day.date) === selectedDate}
                          day={day}
                          isToday={isTodayCell(day)}
                          goalDate={goalDate}
                          weekAdjustmentFactor={wk.adjustmentFactor}
                          currentTsb={currentTsb}
                          actual={actual}
                          onClick={embedded || !onEditWorkout
                            ? undefined
                            : () => onEditWorkout(day, wk.id, di)}
                        />
                      );
                    })}

                    {/* Week TSS */}
                    <div data-testid="K4-5-2"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="dataMedium">{weekTSS > 0 ? weekTSS : '—'}</Text>
                      <div
                        style={{
                          fontSize: "var(--ft-body-size)",
                          color: 'var(--ink-3)',
                          fontFamily: 'inherit',
                        }}
                      >
                        <GlossaryText>TSS</GlossaryText>
                      </div>
                      {weekActual && (
                        <div data-testid="K4-5-12" style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-1)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                          {t('page.actualWeekTSS', { value: weekActual.value ?? '—' })}{weekActual.estimated && ` ${t('page.tssEstimated')}`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        )}

        {/* Legend */}
        {!loading && <Legend />}

      </div>

    </div>
  );
}
