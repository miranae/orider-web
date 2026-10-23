import { isPendingPlanWorkout, presentPlanDayRecord } from "./planRecordPresentation";
import { goalCountdown } from "../../../utils/goalCountdown";
import { summarizeStoredPlan } from "./planScope";
import { Eye, RefreshCw, Target } from "lucide-react";
import GlossaryText from "../../../components/common/GlossaryText";
import InfoTip from "../../../components/InfoTip";
import { GoalSourceNotice } from "../../../components/training/GoalInputNotice";
import { LocalizedLink } from "../../../components/LocalizedLink";
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
import {
  buildDayNames,
  buildWorkoutMeta,
  formatDateLabel,
  formatPlanGoalTitle,
  phaseColor,
  phaseLabel,
} from "./planDisplay";
import { ICON_SIZE } from "../../../theme/tokens/icon";
import { useAuth } from "../../../contexts/AuthContext";
import { usePlanLoadComparison } from "./usePlanLoadComparison";
import PlanDayLoadComparison, { type PlanCalendarLoads } from "./PlanDayLoadComparison";
import type { PlanLoadComparisonRow } from "./planLoadComparison";

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
  embedded?: boolean;
  selected?: boolean;
  day: PlanDay;
  isToday: boolean;
  /** 주 단위 조정 factor (canonical 값). day별 ratio 재계산 대신 사용. */
  weekAdjustmentFactor?: number;
  currentTsb?: number | null;
  goalDate?: Date | null;
  onClick?: () => void;
  dayLoad?: PlanLoadComparisonRow;
  loadState?: PlanCalendarLoads["loadState"];
}

function DayCell({ embedded = false, selected, day, isToday, weekAdjustmentFactor, currentTsb, goalDate, onClick, dayLoad, loadState }: DayCellProps) {
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
  const saved = !embedded ? presentPlanDayRecord(day, {date: kstDayKey(day.date), today: kstDayKey(Date.now())}) : null;
  const isDone = saved ? saved.outcome === "completed" : day.completed;
  const isSkipped = saved ? saved.outcome === "skipped" : day.skipped === true;
  const isPast = day.date < Date.now() && !isToday;
  // 결근: 과거 일자 + 미완료 + 미스킵 + 비휴식/비목표일
  const isMissed = embedded && isPast && !day.completed && !day.skipped && !isRest && !isGoal;
  const dimmed = isPast && !day.completed && !isRest;
  // 자동 적응 — adjustedTSS/adjustedDurationMin이 있으면 그 값을 표시
  const isAdjusted = day.adjustedTSS != null && !isRest && !isGoal;
  const effectiveTSS = day.adjustedTSS ?? day.plannedTSS;
  const effectiveDur = day.adjustedDurationMin ?? day.plannedDurationMin;
  // 일반 웹은 확정 연결의 저장 부하만 비교한다. 임베드는 기존 양수 부하 표시를 유지한다.
  const displayedActualTSS = saved ? saved.linkage === "confirmed" ? saved.actualLoad : null : day.actualTSS != null && day.actualTSS > 0 ? day.actualTSS : null;
  const completionRatio = isDone && displayedActualTSS != null && effectiveTSS > 0
    ? displayedActualTSS / effectiveTSS
    : null;
  const daysUntil = Math.max(0, Math.floor((day.date - planDayStartMs(Date.now())) / DAY_MS));
  const pendingWorkout = embedded ? !isSkipped && !isRest && !isGoal && !day.completed
    : isPendingPlanWorkout(day, { date: kstDayKey(day.date), today: kstDayKey(Date.now()) });
  const downshift = !isPast && pendingWorkout && currentTsb != null
    ? evaluateRecoveryDownshift({ workoutKind: day.workout, tsb: currentTsb, daysUntil })
    : null;
  const dailyLoad = !embedded && <PlanDayLoadComparison day={day} row={dayLoad} state={loadState} />;
  const savedStatus = saved && t(saved.outcome === "unconfirmed" || saved.outcome === "today" ? "loadComparison.calendarUnconfirmed" : `planRecords.state.${saved.outcome}`);

  const dateControl = (content: ReactNode, style: CSSProperties) => onClick ? <button
    type="button" aria-label={t('page.dayDetails', { date: kstDayKey(day.date), workout: workoutLabel })}
    onClick={event => { event.stopPropagation(); onClick(); }}
    className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-dark)]"
    style={{ ...style, border: 0, padding: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 24 }}>
    {content}<Eye size={ICON_SIZE.xs} aria-hidden="true" />
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
          opacity: 0.65,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        <div style={{ fontSize: "var(--fs-sm)", color: 'var(--ink-2)', textDecoration: 'line-through', paddingLeft: 6 }}>
          <span onClick={event => event.stopPropagation()}><GlossaryText>{meta.label}</GlossaryText></span>
        </div>
        {dailyLoad}
        <div style={{ fontSize: "var(--ft-body-size)", color: 'var(--ink-4)', paddingLeft: 6, fontFamily: 'inherit' }}>
          {saved ? savedStatus : t('page.skipped')}
        </div>
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
        {dailyLoad}
        {saved && <Text as="p" variant="caption">{savedStatus}</Text>}
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
        opacity: isRest && !(dayLoad?.actualTss && dayLoad.actualTss > 0) ? 0.65 : dimmed ? 0.85 : 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      {embedded && day.actualActivityId && <LocalizedLink data-testid="K4-5-5" to={`/activity/${encodeURIComponent(day.actualActivityId)}`} onClick={event => event.stopPropagation()}>{t("today.viewActivity")}</LocalizedLink>}
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
      {/* Color bar — 결근이면 rose로 강조 */}
      <div
        style={{
          width: 3,
          height: 18,
          background: isMissed ? 'var(--rose)' : meta.color,
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
          {embedded && effectiveTSS > 0 && <span onClick={event => event.stopPropagation()} style={{ whiteSpace: 'nowrap' }}><GlossaryText>{`${effectiveTSS} TSS`}</GlossaryText></span>}
        </div>
      )}
      {dailyLoad}
      {saved && <>
        <Text as="p" variant="caption" tone="secondary">{savedStatus}</Text>
        {saved.linkage !== "confirmed" && (saved.linkage !== "none" || ["completed", "partial", "markedComplete"].includes(saved.outcome)) && <Text as="p" variant="caption" tone="secondary">{t(`planRecords.basis.${saved.linkage}`)}</Text>}
        {saved.postponedToLocalDate && <Text as="p" variant="caption" tone="secondary">{t("planRecords.postponedDate", {date: saved.postponedToLocalDate})}</Text>}
        {saved.activityLinks.map(link => <LocalizedLink key={link.id} data-testid="K4-5-5" to={`/activity/${encodeURIComponent(link.id)}`} onClick={event => event.stopPropagation()}>{t(link.kind === "candidate" ? "planRecords.viewCandidate" : "today.viewActivity")}</LocalizedLink>)}
      </>}
      {/* 자동 조정 칩 — week 단위 canonical factor 사용 (day별 ratio 누적 오차 회피) */}
      {isAdjusted && weekAdjustmentFactor != null && (
        <div style={{ position: 'absolute', bottom: 4, left: 6 }}>
          <AdjustedChip factor={weekAdjustmentFactor} />
        </div>
      )}
      {!isAdjusted && downshift?.shouldDownshift && downshift.suggestedSwap && (
        <div style={{ position: 'absolute', bottom: 4, left: 6 }}>
          <RecoveryDownshiftMarker suggestedSwap={downshift.suggestedSwap} tsb={downshift.reasonTsb} />
        </div>
      )}
      {dateControl(<>
        <span>{dateLabel}</span>
        {/* 완료 — 달성률 + ✓ (이상값 방지를 위해 999% 캡) */}
        {isDone && (
          <>
            {embedded && completionRatio != null && (
              <span style={{
                fontSize: "var(--fs-xs)",
                color: 'var(--ink-1)',
              }}>
                {Math.min(999, Math.round(completionRatio * 100))}%
              </span>
            )}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: 'var(--lime)' }}>
              <path
                d="M1.5 5l2.5 2.5 5-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
        {/* 결근 — em-dash 마크 (접근성: aria-label로 의미 전달) */}
        {isMissed && (
          <span
            role="img"
            aria-label={t('page.missed')}
            style={{ color: 'var(--rose)', fontSize: "var(--fs-xs)", lineHeight: 1 }}
          >—</span>
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
          fontWeight: isToday || isMissed ? 700 : 500,
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
          <Button variant="secondary" size="sm" leadingIcon={<RefreshCw size={ICON_SIZE.md} aria-hidden="true" />} data-testid="K4-3-3" onClick={() => { void onReroll(); }}>
            {t('buttons.reroll')}
          </Button>
        )}
        {onGoalReset && (
          <Button variant="secondary" size="sm" leadingIcon={<Target size={ICON_SIZE.md} aria-hidden="true" />} data-testid="K4-3-4" onClick={onGoalReset}>
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
  const { user, profile } = useAuth();
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
    completedTSS,
    progress,
    weeksLeft,
    isTodayCell,
    retryLoad,
  } = model;
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
  const pendingWorkout = (day: PlanDay) => embedded
    ? !day.completed && !day.skipped && day.workout !== 'rest' && day.workout !== 'goal'
    : isPendingPlanWorkout(day, { date: kstDayKey(day.date), today: todayKey });
  const remainingSessions = weeks.reduce((total, week) => total + week.days.filter(pendingWorkout).length, 0);
  const planScope = summarizeStoredPlan(weeks, goalDate, Date.now(), { legacy: embedded });
  const scopeNotice = goalDate && planScope.afterGoal > 0 ? <Text data-testid="plan-scope-notice" as="p" variant="bodySmall" tone="secondary" style={{ padding: "var(--space-3) var(--space-4)" }}>{t("scope.summary", planScope)}</Text> : null;
  const nextAction = weeks.slice(currentWeekIndex).flatMap((week) => week.days.map((day, dayIndex) => ({ day, weekId: week.id, dayIndex })))
    .find(({ day }) => kstDayKey(day.date) >= todayKey && pendingWorkout(day));
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
  const calendarDates = (isMobile ? mobilePlanViewModel.currentWeek?.days ?? [] : visibleWeeks.flatMap(week => week.days)).map(day => kstDayKey(day.date)).filter(Boolean).sort();
  const calendarRange = { start: calendarDates[0] ?? "", end: calendarDates[calendarDates.length - 1] ?? "" };
  const calendarLoads = usePlanLoadComparison({ uid: user?.uid, discipline, weeks, range: calendarRange, ftp: profile?.ftp,
    enabled: !embedded && !!goal && goalMatchesDiscipline && !loading && !loadError });
  const calendarLoadsByDate = useMemo(() => new Map(calendarLoads.days.map(day => [day.date, day])), [calendarLoads.days]);
  const calendarLoadNotice = !embedded && <div style={{ marginBottom: "var(--space-3)" }}>
    <Text as="p" variant="caption" tone="tertiary">{t("loadComparison.calendarBasis")}</Text>
    {["error", "incomplete", "invalid"].includes(calendarLoads.state) && <div role="status"><Text as="p" variant="bodySmall" tone="warning">{t(calendarLoads.state === "invalid" ? "loadComparison.invalidRange" : "loadComparison.incomplete")}</Text><Button variant="secondary" size="sm" onClick={calendarLoads.retry}>{t("loadComparison.retry")}</Button></div>}
  </div>;
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
      dayLoads: calendarLoadsByDate,
      loadState: calendarLoads.state,
      nextAction: embedded ? undefined : nextAction ?? null,
      embedded,
      currentWeek: mobilePlanViewModel.currentWeek,
      weekLabel: mobilePlanViewModel.weekLabel,
      canPrevWeek: mobilePlanViewModel.canPrevWeek,
      canNextWeek: mobilePlanViewModel.canNextWeek,
      goalTitle: goal?.title ?? goal?.courseName,
      goalDiscipline: goal?.discipline,
      goalDate,
      daysLeft,
      progressPct: progress,
      completedTSS,
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
        {calendarLoadNotice}
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
                      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
                    })}
                  </span>
                </span>
              )}
              <span>
                <span style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-mono)' }}>{goalDate ? goalCountdown(goalDate.getTime()) : `${t('page.daysLeftPrefix')}${daysLeft}`}</span>
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
                <strong style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-md)' }}>{progress}%</strong>
              </div>
              <div role="progressbar" aria-label={t('metrics.progress')} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 'var(--r-xs)', background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, progress))}%`, background: 'var(--lime)' }} />
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
              { label: t('metrics.sessionsLeft'), value: String(remainingSessions), unit: t('mobile.sessionsUnit'), color: 'var(--ink-0)' },
              ...(totalTSS > 0 ? [{ label: t('metrics.completedTSS'), value: completedTSS.toLocaleString(), unit: `/ ${totalTSS.toLocaleString()}`, color: 'var(--ink-0)' }] : []),
              { label: t('metrics.weeksLeft'), value: String(weeksLeft),    unit: t('metrics.weeksUnit'),  color: 'var(--ink-0)' },
            ].map(({ label, value, unit, color }) => (
              <div
                key={label}
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
          <>
          {calendarLoadNotice}
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
                          embedded={embedded}
                          selected={kstDayKey(day.date) === selectedDate}
                          day={day}
                          dayLoad={calendarLoadsByDate.get(kstDayKey(day.date))}
                          loadState={calendarLoads.state}
                          isToday={isTodayCell(day)}
                          goalDate={goalDate}
                          weekAdjustmentFactor={wk.adjustmentFactor}
                          currentTsb={currentTsb}
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
                    </div>
                  </div>
                );
              })
            )}
          </Card>
          </>
        )}

        {/* Legend */}
        {!loading && <Legend />}

      </div>

    </div>
  );
}
