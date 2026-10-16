import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { EventType, FeasibilityLabel } from '@shared/types/goal';
import { calcFeasibility as calcFeasibilityCore } from '@shared/training/feasibility';
import { FEAS_COLORS, FEAS_LABEL_KEYS } from './constants';
import { DateField } from '../redesign';
import { Text } from '../../theme/components';

// ─── 클라이언트 사이드 feasibility 계산 (서버와 동일 규칙) ──────────────────
// shared/training/feasibility.ts 가 단일 소스 — 완주(거리/난이도 기반) 분기만 추가.

interface CourseSnap {
  distKm: number;
  elevM: number;
  climbs?: Array<{ gain: number; dist: number; cat: number }>;
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
      course: { dist: course.distKm, elev: course.elevM, climbs: course.climbs },
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
    course: { dist: course.distKm, elev: course.elevM, climbs: course.climbs },
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
  courseClimbs?: Array<{ gain: number; dist: number; cat: number }>;
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
  courseClimbs,
  value,
  onChange,
  userFtp,
  userWeightKg,
  userTsb,
}: GoalDetailsStepProps) {
  const { t } = useTranslation("training");
  const fieldId = useId();
  const { eventType, eventDate, targetDurationMin, weeklySessions } = value;

  // 목표 시간 분해 (시간/분)
  const targetH = targetDurationMin != null ? Math.floor(targetDurationMin / 60) : 6;
  const targetM = targetDurationMin != null ? targetDurationMin % 60 : 0;

  // feasibility 계산 (현재 TSB 반영)
  const feas = calcFeasibility(
    { distKm: courseDist, elevM: courseElev, climbs: courseClimbs },
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
  const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    && Number.isFinite(eventDateObj.getTime())
    && eventDateObj.toISOString().slice(0, 10) === eventDate
    && eventDate >= minDateStr;

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
    <Text as="div" variant="body" data-testid="K3-3-4" className="grid grid-cols-1 md:grid-cols-2"
      style={{
        gap: 'var(--space-6)',
      }}
    >
      {/* ── 왼쪽 컬럼: 입력 ── */}
      <div style={{ minWidth: 0 }}>
        {/* 이벤트 유형 */}
        <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <Text as="legend" variant="bodyMedium"
          style={{
            display: 'block',
            color: 'var(--ink-2)',
            marginBottom: 'var(--space-2)',
          }}>{t('goalDetails.eventTypeLabel')}</Text>
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
              <input type="radio" name={`${fieldId}-event-type`} value={v} checked={eventType === v}
                aria-label={t(`goalDetails.eventType.${v}`)} aria-describedby={`${fieldId}-event-${v}-description`}
                onChange={() => handleEventTypeChange(v)}
                style={{ marginTop: "var(--space-1)", accentColor: "var(--lime)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "var(--fs-sm)", color: 'var(--ink-0)' }}>{t(`goalDetails.eventType.${v}`)}</div>
                <div id={`${fieldId}-event-${v}-description`} style={{ fontSize: "var(--fs-md)", color: 'var(--ink-3)', marginTop: "var(--space-0-5)" }}>{t(`goalDetails.eventTypeDesc.${v}`)}</div>
              </div>
            </label>
          ))}
        </div>

        </fieldset>
        {/* 목표일 */}
        <label className="ds-text ds-text--body-medium" htmlFor={`${fieldId}-date`}
          style={{
            display: 'block',
            color: 'var(--ink-2)',
            marginTop: 'var(--space-5)',
            marginBottom: 'var(--space-2)',
          }}>{t('goalDetails.targetDate')}</label>
        <DateField id={`${fieldId}-date`}
          value={eventDate}
          min={minDateStr}
          onChange={handleDateChange}
          placeholder={t('goalDetails.targetDatePlaceholder')}
        />
        {hasValidDate && <div
          style={{
            color: 'var(--ink-3)',
            marginTop: "var(--space-1-5)",
          }}
        >
          {t('goalDetails.daysLeft', { days: weeksLeft * 7, weeks: weeksLeft })}
        </div>}

        {/* 목표 시간 (완주 제외) */}
        {eventType !== 'completion' && (
          <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <Text as="legend" variant="bodyMedium"
              style={{
                display: 'block',
                color: 'var(--ink-2)',
                marginTop: 'var(--space-5)',
                marginBottom: 'var(--space-2)',
              }}>{t('goalDetails.targetDuration')}</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: "var(--space-2)", alignItems: 'center' }}>
              <input
                type="number"
                id={`${fieldId}-hours`} aria-label={`${t('goalDetails.targetDuration')} · ${t('goalDetails.hourUnit')}`}
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
              <label htmlFor={`${fieldId}-hours`} style={{ fontSize: "var(--fs-sm)", color: 'var(--ink-2)' }}>
                {t('goalDetails.hourUnit')}
              </label>
              <input
                type="number"
                id={`${fieldId}-minutes`} aria-label={`${t('goalDetails.targetDuration')} · ${t('goalDetails.minUnit')}`}
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
              <label htmlFor={`${fieldId}-minutes`} style={{ fontSize: "var(--fs-sm)", color: 'var(--ink-2)' }}>
                {t('goalDetails.minUnit')}
              </label>
              {avgSpeed && (
                <span
                  style={{
                    marginLeft: 'auto',
                    color: 'var(--ink-3)',
                  }}
                >
                  {t('goalDetails.avgSpeed', { speed: avgSpeed })}
                </span>
              )}
            </div>
          </fieldset>
        )}

        {/* 주당 운동 횟수 */}
        <Text as="div" variant="bodyMedium"
          style={{
            display: 'block',
            color: 'var(--ink-2)',
            marginTop: 'var(--space-5)',
            marginBottom: 'var(--space-2)',
          }}>{t('goalDetails.weeklySessions')}</Text>
        <div style={{ display: 'flex', gap: "var(--space-1-5)" }}>
          {([1, 2, 3, 4, 5, 6] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleSessionsChange(n)}
              aria-pressed={weeklySessions === n}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: "var(--r-md)",
                fontSize: "var(--fs-sm)",
                background:
                  weeklySessions === n ? 'var(--accent-soft-bg)' : 'var(--bg-2)',
                color:
                  weeklySessions === n ? 'var(--ink-1)' : 'var(--ink-2)',
                border:
                  '1px solid ' +
                  (weeklySessions === n ? 'var(--accent-soft-border)' : 'var(--line-soft)'),
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
      <div data-testid="K3-3-5"
        style={{
          padding: 'var(--space-5)',
          background: 'var(--bg-2)',
          borderRadius: "var(--r-lg)",
          border: '1px solid var(--line-soft)',
          borderLeft: `3px solid ${hasValidDate ? feasColor : 'var(--line-soft)'}`,
          alignSelf: 'start',
        }}
      >
        <Text as="div" variant="bodyMedium"
          style={{
            color: 'var(--ink-2)',
            marginBottom: 'var(--space-3)',
          }}>{t('goalDetails.feasibilityLabel')}</Text>

        {!hasValidDate ? <Text as="p" variant="body" tone="tertiary" style={{ margin: 0 }}>{t('goalDetails.targetDatePlaceholder')}</Text> : <>

        {/* 큰 레이블 */}
        <Text as="div" variant="title"
          style={{
            color: feasColor,
            marginBottom: 'var(--space-1)',
          }}
        >
          {t(FEAS_LABEL_KEYS[feas.label] ?? 'feasLabels.on_track')}
        </Text>

        <div
          style={{
            fontSize: "var(--fs-md)",
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
                fontSize: "var(--fs-md)",
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
                fontSize: "var(--fs-md)",
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
                      fontSize: "var(--fs-md)",
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
                fontSize: "var(--fs-md)",
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
            fontSize: "var(--fs-md)",
            borderTop: eventType !== 'completion' ? '1px solid var(--line-soft)' : 'none',
            marginTop: eventType !== 'completion' ? 12 : 0,
            paddingTop: 'var(--space-3)',
          }}
        >
          <span style={{ color: 'var(--ink-3)' }}>{t('goalDetails.trainingPeriod')}</span>
          <span style={{ color: 'var(--ink-1)' }}>
            {t('goalDetails.periodValue', { weeks: weeksLeft, sessions: weeksLeft * weeklySessions })}
          </span>
        </div>
        </>}
      </div>
    </Text>
  );
}
