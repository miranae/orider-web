import { useTranslation } from "react-i18next";
import type { EventType, FeasibilityLabel } from '@shared/types/goal';
import { calcFeasibility as calcFeasibilityCore } from '@shared/training/feasibility';
import { FEAS_COLORS, FEAS_LABEL_KEYS } from './constants';
import { DateField } from '../redesign';

// ─── 클라이언트 사이드 feasibility 계산 (서버와 동일 규칙) ──────────────────
// shared/training/feasibility.ts 가 단일 소스 — 완주(거리/난이도 기반) 분기만 추가.

interface CourseSnap {
  distKm: number;
  elevM: number;
}
interface TargetSnap {
  durationMin: number; // 완주(completion)이면 0 전달
  eventType: EventType;
}
interface UserSnap {
  ftpW: number;
  weightKg: number;
}
interface FeasibilityResult {
  label: FeasibilityLabel;
  requiredWkg: number;
  sustainableWkg: number;
  gapWkg: number;
  /** 피로도(TSB) 기반 sustainable 보정율(%). 미적용 시 undefined. */
  fatigueAdjustmentPct?: number;
}

function calcFeasibility(
  course: CourseSnap,
  target: TargetSnap,
  snap: UserSnap,
  userTsb?: number | null,
): FeasibilityResult {
  // 완주 모드: 서버(plan-utils.calcFeasibility)는 항상 on_track으로 처리하지만
  // 미리보기는 코스 난이도 가시화를 위해 가상 20km/h로 평가한다 (UX-only).
  if (target.eventType === 'completion' || target.durationMin <= 0) {
    const fakeTargetH = course.distKm > 0 ? course.distKm / 20 : 1; // 20km/h 가정
    const fakeDurationMin = fakeTargetH * 60;
    const r = calcFeasibilityCore({
      course: { dist: course.distKm, elev: course.elevM },
      target: { eventType: 'time', targetDurationMin: fakeDurationMin },
      snap: { ftp: snap.ftpW, weightKg: snap.weightKg },
      fitness: userTsb != null ? { tsb: userTsb } : null,
    });
    return {
      label: r.label,
      requiredWkg: r.requiredWkg ?? 0,
      sustainableWkg: r.sustainableWkg ?? 0,
      gapWkg: r.gapWkg ?? 0,
      fatigueAdjustmentPct: r.fatigueAdjustmentPct,
    };
  }

  const r = calcFeasibilityCore({
    course: { dist: course.distKm, elev: course.elevM },
    target: { eventType: target.eventType, targetDurationMin: target.durationMin },
    snap: { ftp: snap.ftpW, weightKg: snap.weightKg },
    fitness: userTsb != null ? { tsb: userTsb } : null,
  });
  return {
    label: r.label,
    requiredWkg: r.requiredWkg ?? 0,
    sustainableWkg: r.sustainableWkg ?? 0,
    gapWkg: r.gapWkg ?? 0,
    fatigueAdjustmentPct: r.fatigueAdjustmentPct,
  };
}

// ─── Props ───────────────────────────────────────────────────────────────────
export interface GoalDetailsStepValue {
  eventType: EventType;
  eventDate: string;     // YYYY-MM-DD
  targetDurationMin?: number;
  weeklySessions: 1 | 2 | 3 | 4 | 5 | 6;
}

interface GoalDetailsStepProps {
  courseDist: number;  // km
  courseElev: number;  // m
  value: GoalDetailsStepValue;
  onChange: (value: GoalDetailsStepValue) => void;
  userFtp: number;
  userWeightKg: number;
  /** 현재 TSB(CTL-ATL). 있으면 sustainable W/kg에 피로도 보정 적용. */
  userTsb?: number | null;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export default function GoalDetailsStep({
  courseDist,
  courseElev,
  value,
  onChange,
  userFtp,
  userWeightKg,
  userTsb,
}: GoalDetailsStepProps) {
  const { t } = useTranslation("training");
  const { eventType, eventDate, targetDurationMin, weeklySessions } = value;

  // 목표 시간 분해 (시간/분)
  const targetH = targetDurationMin != null ? Math.floor(targetDurationMin / 60) : 6;
  const targetM = targetDurationMin != null ? targetDurationMin % 60 : 0;

  // feasibility 계산 (현재 TSB 반영)
  const feas = calcFeasibility(
    { distKm: courseDist, elevM: courseElev },
    { durationMin: targetDurationMin ?? 0, eventType },
    { ftpW: userFtp, weightKg: userWeightKg },
    userTsb,
  );
  const feasColor = FEAS_COLORS[feas.label];

  // 남은 주수 계산
  const today = new Date();
  const eventDateObj = eventDate ? new Date(eventDate) : today;
  const weeksLeft = Math.max(1, Math.round((eventDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)));

  // 최소 목표일: 오늘 + 4주
  const minDate = new Date(today.getTime() + 4 * 7 * 24 * 60 * 60 * 1000);
  const minDateStr = minDate.toISOString().slice(0, 10);

  const handleEventTypeChange = (et: EventType) => {
    onChange({ ...value, eventType: et });
  };

  const handleDateChange = (d: string) => {
    onChange({ ...value, eventDate: d });
  };

  const handleTimeChange = (h: number, m: number) => {
    onChange({ ...value, targetDurationMin: h * 60 + m });
  };

  const handleSessionsChange = (n: 1 | 2 | 3 | 4 | 5 | 6) => {
    onChange({ ...value, weeklySessions: n });
  };

  const avgSpeed =
    eventType !== 'completion' && targetDurationMin && targetDurationMin > 0
      ? (courseDist / (targetDurationMin / 60)).toFixed(1)
      : null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-6)',
      }}
    >
      {/* ── 왼쪽 컬럼: 입력 ── */}
      <div>
        {/* 이벤트 유형 */}
        <label
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: "var(--fs-xs)",
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            fontWeight: 500,
            marginBottom: 'var(--space-2)',
          }}
        >
          {t('goalDetails.eventTypeLabel')}
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--space-1-5)" }}>
          {(
            ['completion', 'time', 'race'] as const
          ).map((v) => (
            <label
              key={v}
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--r-md)",
                cursor: 'pointer',
                background:
                  eventType === v
                    ? 'color-mix(in oklch, var(--lime) 6%, var(--bg-2))'
                    : 'var(--bg-2)',
                border:
                  '1px solid ' +
                  (eventType === v ? 'var(--lime)' : 'var(--line-soft)'),
                display: 'flex',
                alignItems: 'flex-start',
                gap: "var(--space-2)",
              }}
            >
              <div
                style={{
                  marginTop: "var(--space-1)",
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border:
                    '2px solid ' +
                    (eventType === v ? 'var(--lime)' : 'var(--line)'),
                  background:
                    eventType === v ? 'var(--lime)' : 'transparent',
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
                onClick={() => handleEventTypeChange(v)}
              />
              <div onClick={() => handleEventTypeChange(v)} style={{ cursor: 'pointer' }}>
                <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: 'var(--ink-0)' }}>{t(`goalDetails.eventType.${v}`)}</div>
                <div style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)', marginTop: "var(--space-0-5)" }}>{t(`goalDetails.eventTypeDesc.${v}`)}</div>
              </div>
            </label>
          ))}
        </div>

        {/* 목표일 */}
        <label
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: "var(--fs-xs)",
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            fontWeight: 500,
            marginTop: 'var(--space-5)',
            marginBottom: 'var(--space-2)',
          }}
        >
          {t('goalDetails.targetDate')}
        </label>
        <DateField
          value={eventDate}
          min={minDateStr}
          onChange={handleDateChange}
          placeholder={t('goalDetails.targetDatePlaceholder')}
        />
        <div
          style={{
            fontSize: "var(--fs-xs)",
            color: 'var(--ink-3)',
            marginTop: "var(--space-1-5)",
            fontFamily: 'var(--font-mono)',
          }}
        >
          {t('goalDetails.daysLeft', { days: weeksLeft * 7, weeks: weeksLeft })}
        </div>

        {/* 목표 시간 (완주 제외) */}
        {eventType !== 'completion' && (
          <>
            <label
              style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: "var(--fs-xs)",
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-2)',
                fontWeight: 500,
                marginTop: 'var(--space-5)',
                marginBottom: 'var(--space-2)',
              }}
            >
              {t('goalDetails.targetDuration')}
            </label>
            <div style={{ display: 'flex', gap: "var(--space-2)", alignItems: 'center' }}>
              <input
                type="number"
                value={targetH}
                min={1}
                max={24}
                onChange={(e) => handleTimeChange(Number(e.target.value), targetM)}
                style={{
                  width: 70,
                  padding: '10px 12px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line)',
                  borderRadius: "var(--r-md)",
                  fontSize: "var(--fs-base)",
                  color: 'var(--ink-0)',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: "var(--fs-sm)", color: 'var(--ink-2)' }}>
                {t('goalDetails.hourUnit')}
              </span>
              <input
                type="number"
                value={targetM}
                min={0}
                max={59}
                step={5}
                onChange={(e) => handleTimeChange(targetH, Number(e.target.value))}
                style={{
                  width: 70,
                  padding: '10px 12px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line)',
                  borderRadius: "var(--r-md)",
                  fontSize: "var(--fs-base)",
                  color: 'var(--ink-0)',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: "var(--fs-sm)", color: 'var(--ink-2)' }}>
                {t('goalDetails.minUnit')}
              </span>
              {avgSpeed && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: "var(--fs-xs)",
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {t('goalDetails.avgSpeed', { speed: avgSpeed })}
                </span>
              )}
            </div>
          </>
        )}

        {/* 주당 운동 횟수 */}
        <label
          style={{
            display: 'block',
            fontFamily: 'var(--font-mono)',
            fontSize: "var(--fs-xs)",
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            fontWeight: 500,
            marginTop: 'var(--space-5)',
            marginBottom: 'var(--space-2)',
          }}
        >
          {t('goalDetails.weeklySessions')}
        </label>
        <div style={{ display: 'flex', gap: "var(--space-1-5)" }}>
          {([1, 2, 3, 4, 5, 6] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleSessionsChange(n)}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: "var(--r-md)",
                fontSize: "var(--fs-sm)",
                fontFamily: 'var(--font-mono)',
                background:
                  weeklySessions === n ? 'var(--lime)' : 'var(--bg-2)',
                color:
                  weeklySessions === n ? 'var(--primary-fg)' : 'var(--ink-3)',
                border:
                  '1px solid ' +
                  (weeklySessions === n ? 'var(--lime)' : 'var(--line-soft)'),
                cursor: 'pointer',
                fontWeight: weeklySessions === n ? 600 : 400,
              }}
            >
              {t('goalDetails.sessionCount', { n })}
            </button>
          ))}
        </div>
      </div>

      {/* ── 오른쪽 컬럼: Feasibility 패널 ── */}
      <div
        style={{
          padding: 'var(--space-5)',
          background: 'var(--bg-2)',
          borderRadius: "var(--r-lg)",
          border: '1px solid var(--line-soft)',
          borderLeft: `3px solid ${feasColor}`,
          alignSelf: 'start',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: "var(--fs-xs)",
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-2)',
            fontWeight: 500,
            marginBottom: 'var(--space-3)',
          }}
        >
          {t('goalDetails.feasibilityLabel')}
        </div>

        {/* 큰 레이블 */}
        <div
          style={{
            fontSize: "var(--fs-4xl)",
            fontWeight: 700,
            color: feasColor,
            letterSpacing: '-0.02em',
            marginBottom: 'var(--space-1)',
            fontFamily: 'var(--font-sans, sans-serif)',
          }}
        >
          {t(FEAS_LABEL_KEYS[feas.label] ?? 'feasLabels.on_track')}
        </div>

        <div
          style={{
            fontSize: "var(--fs-xs)",
            color: 'var(--ink-3)',
            marginBottom: 'var(--space-5)',
            lineHeight: 1.5,
          }}
        >
          {t(`goalDetails.feasDesc.${feas.label}`)}
        </div>

        <div style={{ height: 1, background: 'var(--line-soft)', margin: '14px 0' }} />

        {/* 파워 스탯 (완주 제외) */}
        {eventType !== 'completion' && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                fontSize: "var(--fs-xs)",
              }}
            >
              <span style={{ color: 'var(--ink-3)' }}>{t('goalDetails.requiredPower')}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: feasColor,
                  fontWeight: 600,
                }}
              >
                {feas.requiredWkg} W/kg · {Math.round(feas.requiredWkg * userWeightKg)} W
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                fontSize: "var(--fs-xs)",
              }}
            >
              <span style={{ color: 'var(--ink-3)' }}>
                {t('goalDetails.sustainablePower')}
                {feas.fatigueAdjustmentPct != null && feas.fatigueAdjustmentPct !== 0 && (
                  <span
                    title={t('goalDetails.fatigueTsbHint', { tsb: userTsb?.toFixed?.(0) ?? '?' })}
                    style={{
                      marginLeft: "var(--space-1-5)",
                      padding: '1px 6px',
                      fontSize: "var(--fs-xs)",
                      borderRadius: "var(--r-sm)",
                      // 기존 디자인 시스템 토큰 활용 — risky=피로 하향, easy=신선 상향
                      background: feas.fatigueAdjustmentPct < 0
                        ? 'color-mix(in oklch, var(--rose) 18%, transparent)'
                        : 'color-mix(in oklch, var(--lime) 18%, transparent)',
                      color: feas.fatigueAdjustmentPct < 0 ? 'var(--rose)' : 'var(--lime)',
                    }}
                  >
                    {t('goalDetails.fatigueAdj', { pct: `${feas.fatigueAdjustmentPct > 0 ? '+' : ''}${feas.fatigueAdjustmentPct}` })}
                  </span>
                )}
              </span>
              <span
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}
              >
                {feas.sustainableWkg} W/kg
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0 8px',
                fontSize: "var(--fs-xs)",
                borderTop: '1px dashed var(--line-soft)',
                marginTop: "var(--space-1-5)",
              }}
            >
              <span style={{ color: 'var(--ink-3)' }}>{t('goalDetails.gap')}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: feasColor,
                  fontWeight: 600,
                }}
              >
                {feas.gapWkg >= 0 ? '+' : ''}
                {feas.gapWkg.toFixed(2)} W/kg
              </span>
            </div>
          </>
        )}

        {/* 운동 가능 기간 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0',
            fontSize: "var(--fs-xs)",
            borderTop: eventType !== 'completion' ? '1px solid var(--line-soft)' : 'none',
            marginTop: eventType !== 'completion' ? 12 : 0,
            paddingTop: 'var(--space-3)',
          }}
        >
          <span style={{ color: 'var(--ink-3)' }}>{t('goalDetails.trainingPeriod')}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>
            {t('goalDetails.periodValue', { weeks: weeksLeft, sessions: weeksLeft * weeklySessions })}
          </span>
        </div>
      </div>
    </div>
  );
}
