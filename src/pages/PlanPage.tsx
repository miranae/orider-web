import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useLocalizedNavigate as useNavigate } from "../hooks/useLocalizedNavigate";
import {
  collection, query, where, limit, getDocs, orderBy, doc, updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firestore, functions } from "../services/firebase";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import type { Goal, PlanWeek, PlanDay } from "@shared/types/goal";
import { computePlanProgress } from "@shared/training/planMetrics";
import { generateICS, downloadICS } from "../utils/icsExport";
import WorkoutEditModal from "../components/training/WorkoutEditModal";
import AdaptationBanner from "../components/training/AdaptationBanner";
import AdjustedChip from "../components/training/AdjustedChip";
import { useMobile } from "../hooks/useMobile";
import { useFreshTraining } from "../hooks/useFreshTraining";
import { useToast } from "../contexts/ToastContext";
import { RevalidatingIndicator } from "../components/training/RevalidatingIndicator";
import MobilePlanPage from "../components/mobile/MobilePlanPage";
import DisciplineTabs from "../components/redesign/DisciplineTabs";
import { EmptyState } from "../components/redesign";
import { Button, Card, Text } from "../theme/components";
import { buildDayNames, buildWorkoutMeta, formatDateLabel, phaseColor, phaseLabel } from "../features/training/plan/planDisplay";

interface DayCellProps {
  day: PlanDay;
  isToday: boolean;
  /** 주 단위 조정 factor (canonical 값). day별 ratio 재계산 대신 사용. */
  weekAdjustmentFactor?: number;
  onClick?: () => void;
}

function DayCell({ day, isToday, weekAdjustmentFactor, onClick }: DayCellProps) {
  const { t } = useTranslation('training');
  const WORKOUT_META = useMemo(() => buildWorkoutMeta(t), [t]);
  const meta = WORKOUT_META[day.workout] ?? WORKOUT_META.rest;
  const isRest = day.workout === 'rest';
  const isGoal = day.workout === 'goal';
  const isSkipped = day.skipped === true;
  const isPast = day.date < Date.now() && !isToday;
  // 결근: 과거 일자 + 미완료 + 미스킵 + 비휴식/비목표일
  const isMissed = isPast && !day.completed && !day.skipped && !isRest && !isGoal;
  const dimmed = isPast && !day.completed && !isRest;
  // 자동 적응 — adjustedTSS/adjustedDurationMin이 있으면 그 값을 표시
  const isAdjusted = day.adjustedTSS != null && !isRest && !isGoal;
  const effectiveTSS = day.adjustedTSS ?? day.plannedTSS;
  const effectiveDur = day.adjustedDurationMin ?? day.plannedDurationMin;
  // 완료 달성률: actualTSS / plannedTSS. actualTSS=0(데이터 미수집)은 0%가 아닌 미표시로 처리.
  const completionRatio = day.completed && day.actualTSS != null && day.actualTSS > 0 && day.plannedTSS > 0
    ? day.actualTSS / day.plannedTSS
    : null;

  // 건너뛴 날은 휴식처럼 흐리게 + 취소선
  if (isSkipped) {
    return (
      <div
        onClick={onClick}
        style={{
          padding: '6px 6px',
          borderRadius: 4,
          minHeight: 62,
          cursor: 'pointer',
          background: 'var(--bg-2)',
          border: '1px solid var(--line-soft)',
          opacity: 0.35,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--ink-3)', textDecoration: 'line-through', paddingLeft: 6 }}>
          {meta.label}
        </div>
        <div style={{ fontSize: 9, color: 'var(--ink-4)', paddingLeft: 6, fontFamily: 'var(--font-mono)' }}>
          {t('page.skipped')}
        </div>
        {/* 날짜 — 우상단 */}
        <div style={{
          position: 'absolute', top: 4, right: 4,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)',
        }}>
          {formatDateLabel(day.date, day.dayOfWeek)}
        </div>
      </div>
    );
  }

  if (isGoal) {
    return (
      <div
        style={{
          padding: '6px 4px',
          borderRadius: 4,
          minHeight: 62,
          background: 'var(--lime)',
          color: 'var(--primary-fg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: isToday ? '2px solid var(--ink-0)' : 'none',
          position: 'relative',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <div style={{ fontSize: 11, fontWeight: 700, marginTop: 'var(--space-1)', letterSpacing: '0.04em' }}>{t('page.goalDay')}</div>
        {/* 날짜 — 우상단 */}
        <div style={{
          position: 'absolute', top: 4, right: 4,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--primary-fg)', opacity: 0.7,
        }}>
          {formatDateLabel(day.date, day.dayOfWeek)}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={!isGoal ? onClick : undefined}
      style={{
        padding: '6px 6px',
        borderRadius: 4,
        minHeight: 62,
        cursor: !isGoal ? 'pointer' : 'default',
        background: isToday
          ? 'color-mix(in oklch, var(--lime) 10%, var(--bg-2))'
          : 'var(--bg-2)',
        border: `1px solid ${isToday ? 'var(--lime)' : 'var(--line-soft)'}`,
        opacity: isRest ? 0.4 : dimmed ? 0.5 : 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      {/* Color bar — 결근이면 rose로 강조 */}
      <div
        style={{
          width: 3,
          height: 18,
          background: isMissed ? 'var(--rose)' : meta.color,
          borderRadius: 2,
          position: 'absolute',
          top: 6,
          left: 0,
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: 'var(--ink-0)',
          fontWeight: 500,
          paddingLeft: 6,
          lineHeight: 1.2,
        }}
      >
        {meta.label}
      </div>
      {effectiveTSS > 0 && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-2)',
            paddingLeft: 6,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {(() => {
            const dur = effectiveDur ?? 0;
            const w = day.workout;
            if (!isRest && !isGoal && dur > 0) {
              const isRun = w.includes('Run');
              const isSwim = w.includes('Swim');
              if (isSwim) {
                const m = Math.round(dur * 40);
                return `${m}m · `;
              } else if (isRun) {
                const km = (dur * 0.15).toFixed(1);
                return `${km}km · `;
              } else {
                const km = (dur * 0.45).toFixed(1);
                return `${km}km · `;
              }
            }
            return '';
          })()}{effectiveTSS} TSS
        </div>
      )}
      {/* 자동 조정 칩 — week 단위 canonical factor 사용 (day별 ratio 누적 오차 회피) */}
      {isAdjusted && weekAdjustmentFactor != null && (
        <div style={{ position: 'absolute', bottom: 4, left: 6 }}>
          <AdjustedChip factor={weekAdjustmentFactor} />
        </div>
      )}
      {/* 날짜 + 달성/결근 표시 — 우상단 */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          maxWidth: 'calc(100% - 8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: isToday ? 'var(--lime)' : isMissed ? 'var(--rose)' : 'var(--ink-3)',
          fontWeight: isToday || isMissed ? 700 : 500,
        }}
      >
        <span>{formatDateLabel(day.date, day.dayOfWeek)}</span>
        {/* 완료 — 달성률 + ✓ (이상값 방지를 위해 999% 캡) */}
        {day.completed && (
          <>
            {completionRatio != null && (
              <span style={{
                fontSize: 9,
                color: completionRatio >= 0.8 ? 'var(--lime)' : 'var(--amber)',
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
            style={{ color: 'var(--rose)', fontSize: 12, lineHeight: 1 }}
          >—</span>
        )}
      </div>
      {/* TODAY badge */}
      {isToday && (
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            fontSize: 8,
            color: 'var(--lime)',
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          TODAY
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────

function SkeletonGrid() {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const DAY_NAMES = useMemo(() => buildDayNames(tCommon), [tCommon]);
  return (
    <Card padding="none" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '80px repeat(7, 1fr) 100px',
          padding: '10px 14px',
          borderBottom: '1px solid var(--line-soft)',
          background: 'var(--bg-2)',
          gap: 6,
        }}
      >
        <Text as="div" variant="eyebrow">{t('page.weekHeader')}</Text>
        {DAY_NAMES.map((d) => (
          <Text key={d} as="div" variant="eyebrow" style={{ textAlign: 'center' }}>{d}</Text>
        ))}
        <Text as="div" variant="eyebrow" style={{ textAlign: 'right' }}>{t('page.tssHeader')}</Text>
      </div>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '80px repeat(7, 1fr) 100px',
            gap: 6,
            padding: '10px 14px',
            borderBottom: i < 11 ? '1px solid var(--line-soft)' : 'none',
          }}
        >
          <div
            style={{
              height: 62,
              background: 'var(--bg-2)',
              borderRadius: 4,
              opacity: 0.5,
            }}
          />
          {Array.from({ length: 7 }).map((_, j) => (
            <div
              key={j}
              style={{
                height: 62,
                background: 'var(--bg-2)',
                borderRadius: 4,
                opacity: 0.3,
              }}
            />
          ))}
          <div
            style={{
              height: 62,
              background: 'var(--bg-2)',
              borderRadius: 4,
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
  onIcsExport: () => void;
  onGoalReset: () => void;
  onReroll: () => void;
  onAbandon: () => void;
}

function PhaseBar({ weeks, goal, onIcsExport, onGoalReset, onReroll, onAbandon }: PhaseBarProps) {
  const { t } = useTranslation('training');
  const buildCount  = weeks.filter((w) => w.phase === 'build').length;
  const peakCount   = weeks.filter((w) => w.phase === 'peak').length;
  const taperCount  = weeks.filter((w) => w.phase === 'taper').length;
  const total = weeks.length || 1;

  const segments = [
    { phase: t('phase.build'), count: buildCount, color: 'var(--aqua)' },
    { phase: t('phase.peak'), count: peakCount,  color: 'var(--lime)' },
    { phase: t('phase.taper'), count: taperCount, color: 'var(--amber)' },
  ].filter((s) => s.count > 0);

  return (
    <Card padding="none"
      style={{
        padding: '12px 14px',
        marginBottom: 'var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
    >
      <Text as="div" variant="eyebrow" style={{ flexShrink: 0 }}>{t('phase.label')}</Text>
      <div
        style={{
          flex: 1,
          minWidth: 160,
          display: 'flex',
          height: 20,
          borderRadius: 4,
          overflow: 'hidden',
          gap: 2,
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
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--primary-fg)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              paddingInline: 'var(--space-1)',
            }}
          >
            {phase} {count}{t('phase.weeksUnit')}
          </div>
        ))}
      </div>
      {/* Action buttons inline with phase bar */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
        {goal && (
          <Button variant="secondary" size="sm" onClick={onIcsExport}>
            {t('buttons.ics')}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onReroll}>
          {t('buttons.reroll')}
        </Button>
        <Button variant="secondary" size="sm" onClick={onGoalReset}>
          {t('buttons.goalReset')}
        </Button>
        <Button variant="secondary" size="sm"
          style={{ color: 'var(--rose)' }}
          onClick={onAbandon}
        >
          {t('buttons.abandonGoal')}
        </Button>
      </div>
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
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-4)',
        marginTop: 14,
        padding: '12px 14px',
        fontSize: 11,
        background: 'var(--bg-1)',
        border: '1px solid var(--line-soft)',
        borderRadius: 6,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 3,
              height: 12,
              background: color,
              borderRadius: 2,
              display: 'inline-block',
            }}
          />
          <span style={{ color: 'var(--ink-2)' }}>{label}</span>
        </div>
      ))}
      <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>
        {t('legend.note')}
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function PlanPage() {
  const { t } = useTranslation('training');
  const { t: tCommon } = useTranslation('common');
  const { t: tActivity } = useTranslation('activity');
  const DAY_NAMES = useMemo(() => buildDayNames(tCommon), [tCommon]);
  const { showToast } = useToast();
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const discipline = (searchParams.get("sport") || "bike") as "bike" | "run" | "swim";

  const [goal, setGoal]   = useState<Goal | null>(null);
  const [weeks, setWeeks] = useState<PlanWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<{ day: PlanDay; weekId: string; dayIndex: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // lazy revalidate — plan 페이지는 활동/피로도 기반 자동 조정이 가장 직접 보이는 화면
  const { revalidating, justRecomputed } = useFreshTraining(discipline);

  // Load active goal
  // TODO: 실시간 업데이트를 위해 getDocs 대신 onSnapshot 사용 권장
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        // 종목별 목표 조회, 없으면 discipline 필드 없는 레거시 목표도 조회
        let snap = await getDocs(
          query(
            collection(firestore, "goals"),
            where("userId", "==", user.uid),
            where("status", "==", "active"),
            where("discipline", "==", discipline),
            limit(1),
          ),
        );
        if (snap.empty) {
          // discipline 필드 없는 레거시 목표 fallback
          snap = await getDocs(
            query(
              collection(firestore, "goals"),
              where("userId", "==", user.uid),
              where("status", "==", "active"),
              limit(1),
            ),
          );
        }
        if (snap.empty) {
          setGoal(null);
          setWeeks([]);
          setLoading(false);
          return;
        }
         
        const docSnap = snap.docs[0]!;
        const g = { id: docSnap.id, ...docSnap.data() } as Goal;
        setGoal(g);

        // Load plan weeks from subcollection
        const planSnap = await getDocs(
          query(
            collection(firestore, "goals", g.id, "plan"),
            orderBy("weekNumber"),
          ),
        );
        setWeeks(planSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlanWeek));
      } catch (err) {
        logClientError("PlanPage.load", err, { discipline });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, navigate, discipline, reloadKey]);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate("/goal-setup", { replace: true });
    }
  }, [loading, user, navigate]);

  const goalMatchesDiscipline = !goal || !goal.discipline || goal.discipline === discipline;

  // ── 계산 ───────────────────────────────────────────────────────────
  // Fix: Date.now()를 렌더 시점에 호출하지 않고 useMemo로 안정화
  // 브라우저 로컬 TZ 기준 오늘 0시 (이중 보정 없음)
  const todayMs = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }, []);

  const today = todayMs;

  const goalDate = goal ? new Date(goal.eventDate) : null;
  const daysLeft = goalDate
    ? Math.max(0, Math.round((goalDate.getTime() - today) / 86400000))
    : 0;

  const { totalTSS, completedTSS, progressPct: progress, weeksLeft } =
    computePlanProgress(weeks, today);


  // Figure out today's week/day for highlighting (KST 기준)
  function isTodayCell(day: PlanDay): boolean {
    const d = new Date(day.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === todayMs;
  }

  // ── Render ─────────────────────────────────────────────────────────
  const isMobile = useMobile();
  const [mobileWeekOffset, setMobileWeekOffset] = useState(0);

  if (!loading && !goal) {
    const sportLabel = t(`discipline.${discipline}`);
    const sportIcon = t(`disciplineIcon.${discipline}`);
    return (
      <div style={{ maxWidth: 1440, margin: "0 auto", paddingBottom: 'var(--space-8)' }}>
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid var(--line-soft)", marginBottom: 'var(--space-7)' }}>
          <DisciplineTabs />
        </div>
        <div style={{ padding: "24px 0" }}>
          <EmptyState
            icon={sportIcon}
            title={t('page.planEmpty', { sportLabel })}
            description={t('page.planEmptyDesc', { sportLabel })}
            actions={[
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
      <div style={{ maxWidth: 1440, margin: "0 auto", paddingBottom: 'var(--space-8)' }}>
        <div style={{ padding: "16px 0 12px", borderBottom: "1px solid var(--line-soft)", marginBottom: 'var(--space-7)' }}>
          <DisciplineTabs />
        </div>
        <div style={{ padding: "24px 0" }}>
          <EmptyState
            icon={sportIcon}
            title={t('page.planEmpty', { sportLabel })}
            description={t('page.planEmptyDesc', { sportLabel })}
            actions={[
              { label: t('page.planEmptyAction', { sportLabel }), variant: "primary", href: `/goal-setup?sport=${discipline}` },
            ]}
          />
        </div>
      </div>
    );
  }

  if (isMobile && !loading) {
    // Find the current week index (the one containing today)
    const now = Date.now();
    const currentWeekIdx = weeks.findIndex((w) => w.days.some((d) => {
      if (!d.date) return false;
      const dayStart = new Date(d.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      return now >= dayStart.getTime() && now < dayEnd.getTime();
    }));
    const baseIdx = currentWeekIdx >= 0 ? currentWeekIdx : 0;
    const mobileWeekIdx = Math.max(0, Math.min(weeks.length - 1, baseIdx + mobileWeekOffset));
    const mobileWeek = weeks[mobileWeekIdx] ?? null;
    const mobileWeekLabel = mobileWeekOffset === 0 ? t('mobile.weekThis') : `W${mobileWeekIdx + 1}`;

    return (
      <>
        <MobilePlanPage
          currentWeek={mobileWeek}
          weekLabel={mobileWeekLabel}
          goalId={goal?.id}
          adaptationFlag={goal?.adaptationFlag}
          onWeekPrev={() => setMobileWeekOffset(o => o - 1)}
          onWeekNext={() => setMobileWeekOffset(o => o + 1)}
          onEditWorkout={(day, weekId, dayIndex) => setSelectedDay({ day, weekId, dayIndex })}
          onPlanUpdate={() => {
            // 데이터 리로드
            setReloadKey((k) => k + 1);
            setMobileWeekOffset(0);
          }}
        />
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
              // reloadKey 증가로 로드 effect 재실행(데이터 리로드 + loading 해제). 기존엔
              // setLoading(true) 만 호출해 재로드가 안 일어나 모바일에서 무한 스켈레톤이었다(#535).
              setReloadKey((k) => k + 1);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', paddingBottom: 'var(--space-8)' }}>

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
            gridTemplateColumns: '1.4fr 1fr',
            gap: 40,
            alignItems: 'flex-end',
          }}
        >
          {/* Left: goal name + date */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
              <Text as="div" variant="eyebrow">
                {t('page.planTitle')}
              </Text>
              <DisciplineTabs />
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
                gap: 14,
                marginBottom: 'var(--space-2)',
                flexWrap: 'wrap',
              }}
            >
              <h1
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: 'var(--ink-0)',
                  margin: 0,
                }}
              >
                {loading ? '...' : (goal?.courseName ?? '—')}
              </h1>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--lime)',
                  color: 'var(--lime)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('page.inProgress')}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-5)',
                fontSize: 13,
                color: 'var(--ink-2)',
                fontFamily: 'var(--font-mono)',
                flexWrap: 'wrap',
              }}
            >
              {goalDate && (
                <span>
                  {t('page.goalDateLabel')}{' '}
                  <span style={{ color: 'var(--ink-0)' }}>
                    {goalDate.toLocaleDateString('ko-KR', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                    })}
                  </span>
                </span>
              )}
              <span>
                {t('page.daysLeftPrefix')}<span style={{ color: 'var(--lime)' }}>{daysLeft}</span>
              </span>
              {goal && (
                <span>
                  {goal.courseDist.toFixed(1)} km · ↑{Math.round(goal.courseElev)} m
                </span>
              )}
              {goal?.targetDurationMin && (
                <span>
                  {t('page.targetDuration')}{' '}
                  <span style={{ color: 'var(--ink-0)' }}>
                    {Math.floor(goal.targetDurationMin / 60)}h {goal.targetDurationMin % 60}m
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Right: 4-KPI */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
            }}
          >
            {[
              { label: t('metrics.progress'),   value: `${progress}%`,       unit: null,  color: 'var(--lime)' },
              { label: t('metrics.completedTSS'), value: completedTSS.toLocaleString(), unit: `/ ${totalTSS.toLocaleString()}`, color: 'var(--ink-0)' },
              { label: t('metrics.weeksLeft'), value: String(weeksLeft),    unit: t('metrics.weeksUnit'),  color: 'var(--ink-0)' },
              { label: t('metrics.projectedCTL'), value: goal ? `+${Math.round((goal.snapshot?.ctl ?? 0) * 0.18)}` : '—', unit: null, color: 'var(--lime)' },
            ].map(({ label, value, unit, color }) => (
              <div
                key={label}
                style={{
                  padding: '18px 16px',
                  background: 'var(--bg-2)',
                  borderRadius: 6,
                  border: '1px solid var(--line-soft)',
                }}
              >
                <Text as="div" variant="eyebrow" style={{ marginBottom: 6 }}>{label}</Text>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
                  <Text variant="dataLarge" style={{ color }}>{value}</Text>
                  {unit && (
                    <span
                      style={{
                        fontSize: 13,
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

        {/* Adaptation Banner — warn/critical 일 때만 노출 */}
        {goal?.adaptationFlag && (
          <AdaptationBanner
            goalId={goal.id}
            flag={goal.adaptationFlag}
            onChange={() => setReloadKey((k) => k + 1)}
          />
        )}

        {/* Phase Bar */}
        {!loading && weeks.length > 0 && (
          <PhaseBar
            weeks={weeks}
            goal={goal}
            onIcsExport={() => {
              if (!goal) return;
              const ics = generateICS(weeks, goal.courseName, tActivity);
              downloadICS(ics, `orider-plan-${goal.courseName}.ics`);
            }}
            onReroll={async () => {
              if (!goal) return;
              if (!window.confirm(t('confirmations.rerollConfirm'))) return;
              try {
                const reroll = httpsCallable(functions, "rerollPlan");
                await reroll({ goalId: goal.id });
                window.location.reload();
              } catch (err) {
                logClientError("PlanPage.rerollPlan", err, { goalId: goal.id });
                showToast(t('errors.rerollError'), "error");
              }
            }}
            onGoalReset={() => navigate("/goal-setup")}
            onAbandon={async () => {
              if (!goal) return;
              if (!window.confirm(t('confirmations.abandonConfirm'))) return;
              try {
                await updateDoc(doc(firestore, "goals", goal.id), { status: "abandoned", updatedAt: Date.now() });
                navigate("/");
              } catch (err) {
                logClientError("PlanPage.abandonGoal", err, { goalId: goal.id });
                showToast(t('errors.abandonError'), "error");
              }
            }}
          />
        )}

        {/* Calendar Grid */}
        {loading ? (
          <SkeletonGrid />
        ) : (
          <Card padding="none" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '80px repeat(7, 1fr) 100px',
                padding: '10px 14px',
                borderBottom: '1px solid var(--line-soft)',
                background: 'var(--bg-2)',
                gap: 6,
              }}
            >
              <Text as="div" variant="eyebrow">{t('page.weekHeader')}</Text>
              {DAY_NAMES.map((d, i) => (
                <Text
                  key={d} as="div" variant="eyebrow"
                  style={{
                    textAlign: 'center',
                    color: i >= 5 ? 'var(--ink-2)' : 'var(--ink-3)',
                  }}
                >
                  {d}
                </Text>
              ))}
              <Text as="div" variant="eyebrow" style={{ textAlign: 'right' }}>{t('page.tssHeader')}</Text>
            </div>

            {/* Rows */}
            {weeks.length === 0 ? (
              <div
                style={{
                  padding: '40px 14px',
                  textAlign: 'center',
                  color: 'var(--ink-3)',
                  fontSize: 13,
                }}
              >
                {t('page.planEmptyBody')}
              </div>
            ) : (
              weeks.map((wk, wi) => {
                const weekTSS = wk.days.reduce((s, d) => s + (d.skipped ? 0 : d.plannedTSS), 0);
                const isCurrentWeek = wk.days.some(isTodayCell);
                const pc = phaseColor(wk.phase);

                return (
                  <div
                    key={wk.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px repeat(7, 1fr) 100px',
                      gap: 6,
                      padding: '10px 14px',
                      borderBottom: wi < weeks.length - 1 ? '1px solid var(--line-soft)' : 'none',
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
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--ink-0)',
                        }}
                      >
                        W{wk.weekNumber}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: pc,
                          fontFamily: 'var(--font-mono)',
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
                          day={day}
                          isToday={isTodayCell(day)}
                          weekAdjustmentFactor={wk.adjustmentFactor}
                          onClick={() => setSelectedDay({ day, weekId: wk.id, dayIndex: di })}
                        />
                      );
                    })}

                    {/* Week TSS */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="dataMedium">{weekTSS}</Text>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--ink-3)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        TSS
                      </div>
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

      {/* 워크아웃 수정 모달 */}
      {selectedDay && goal && (
        <WorkoutEditModal
          day={selectedDay.day}
          weekId={selectedDay.weekId}
          dayIndex={selectedDay.dayIndex}
          goalId={goal.id}
          goalDiscipline={goal.discipline}
          onClose={() => setSelectedDay(null)}
          onUpdate={() => {
            setSelectedDay(null);
            getDocs(query(collection(firestore, `goals/${goal.id}/plan`), orderBy("weekNumber")))
              .then((snap) => setWeeks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlanWeek)));
          }}
        />
      )}
    </div>
  );
}
