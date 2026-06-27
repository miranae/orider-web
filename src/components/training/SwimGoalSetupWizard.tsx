import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { FEAS_COLORS, FEAS_LABEL_KEYS } from './constants';
import type { FeasibilityLabel } from '@shared/types/goal';
import { DateField } from '../redesign';
import { Button, Card, Chip, Text } from "../../theme/components";

// ── 수영 이벤트 라이브러리 ──────────────────────────────────────────────────
const EVENTS = [
  { id: 'test1500', dist: 1500,  cat: 'Test' },
  { id: 'ow1500',   dist: 1500,  cat: 'OW'   },
  { id: 'tri750',   dist: 750,   cat: 'Tri'  },
  { id: 'tri1500',  dist: 1500,  cat: 'Tri'  },
  { id: 'ow3000',   dist: 3000,  cat: 'OW'   },
  { id: 'swim5k',   dist: 5000,  cat: 'Long' },
] as const;

type SwimGoalType = 'completion' | 'time' | 'technique';

// ── 유틸리티 ─────────────────────────────────────────────────────────────────
function secToMmss(s: number): string {
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const rs = Math.round(abs - m * 60);
  return `${m}:${String(rs).padStart(2, '0')}`;
}

function formatDist(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 1)} km` : `${meters} m`;
}

// ── Feasibility 계산 (CSS 기반) ─────────────────────────────────────────────
interface SwimFeasibility {
  label: FeasibilityLabel;
  targetPace100: number;  // sec/100m
  cssPaceSec: number;     // sec/100m
  gapSec: number;
}

function calcSwimFeasibility(
  distM: number,
  goalType: SwimGoalType,
  targetTotalSec: number,
  cssPaceSec: number,
): SwimFeasibility {
  const targetPace100 = (targetTotalSec / distM) * 100;
  const gapSec = targetPace100 - cssPaceSec;

  let label: FeasibilityLabel;
  if (goalType === 'completion' || goalType === 'technique') label = 'on_track';
  else if (gapSec > 15) label = 'easy';
  else if (gapSec > 0) label = 'on_track';
  else if (gapSec > -8) label = 'stretch';
  else label = 'risky';

  return { label, targetPace100, cssPaceSec, gapSec };
}

// ── 컴포넌트 ────────────────────────────────────────────────────────────────
interface SwimGoalSetupWizardProps {
  Stepper: React.ComponentType<{ current: number; steps: string[] }>;
}

export default function SwimGoalSetupWizard({ Stepper }: SwimGoalSetupWizardProps) {
  const { t } = useTranslation('training');
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState<string>('tri1500');
  const [goalType, setGoalType] = useState<SwimGoalType>('time');
  const [eventDate, setEventDate] = useState('');
  const [goalMin, setGoalMin] = useState(28);
  const [goalSec, setGoalSec] = useState(0);
  const [weeklySessions, setWeeklySessions] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const cssPaceSec: number = (typeof profile?.css === 'number' && profile.css > 0)
    ? profile.css
    : 108; // 기본 CSS 1:48/100m

  const ev = EVENTS.find(e => e.id === eventId)!;
  const targetTotalSec = goalMin * 60 + goalSec;
  const feas = calcSwimFeasibility(ev.dist, goalType, targetTotalSec, cssPaceSec);
  const feasColor = goalType === 'technique' ? 'var(--aqua)' : FEAS_COLORS[feas.label];

  const isTri = ev.cat === 'Tri';
  const isOW = ev.cat === 'OW';

  // 남은 주수
  const today = new Date();
  const eventDateObj = eventDate ? new Date(eventDate) : today;
  const weeksLeft = Math.max(1, Math.round(
    (eventDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7),
  ));

  const buildW = Math.round(weeksLeft * 0.55);
  const peakW = Math.round(weeksLeft * 0.30);
  const taperW = Math.max(1, weeksLeft - buildW - peakW);

  const minDate = new Date(today.getTime() + 4 * 7 * 24 * 60 * 60 * 1000);
  const minDateStr = minDate.toISOString().slice(0, 10);

  const canNext = step === 1 ? true : step === 2 ? eventDate !== '' : true;

  const handleNext = () => setStep(s => Math.min(3, s + 1));
  const handlePrev = () => setStep(s => Math.max(1, s - 1));
  const handleStart = async () => {
    if (submitting) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const createGoal = httpsCallable(functions, 'createGoal');
      const result = await createGoal({
        eventId,
        eventType: goalType,
        eventDate,
        targetDurationMin: Math.round(targetTotalSec / 60),
        weeklySessions,
        discipline: 'swim',
      });
      const data = result.data as { goalId: string };
      navigate(`/plan?goalId=${data.goalId}`);
    } catch (err) {
      console.error('수영 목표 생성 실패:', err);
      setCreateError(t('errors.creationError'));
      setSubmitting(false);
    }
  };

  const stepLabels = [
    t('goals.stepLabels.swimEvent'),
    t('goals.stepLabels.goalDetails'),
    t('goals.stepLabels.planPreview'),
  ];

  return (
    <>
      <Stepper current={step} steps={stepLabels} />

      {/* Step 1: 이벤트 선택 */}
      {step === 1 && (
        <Card padding="none" style={{ padding: 26 }}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-0)', marginBottom: 'var(--space-1)' }}>
              {t('swimWizard.selectHeading')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {t('swimWizard.selectSubtitle')}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {EVENTS.map(e => {
              const sel = e.id === eventId;
              const diffColor = e.dist >= 3000 ? 'var(--rose)' : e.dist >= 1500 ? 'var(--amber)' : 'var(--lime)';
              return (
                <button
                  key={e.id}
                  onClick={() => setEventId(e.id)}
                  style={{
                    textAlign: 'left', padding: 'var(--space-4)', borderRadius: 'var(--r-md)',
                    background: sel ? 'color-mix(in oklch, var(--aqua) 8%, var(--bg-2))' : 'var(--bg-2)',
                    border: `${sel ? 2 : 1}px solid ${sel ? 'var(--aqua)' : 'var(--line-soft)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>{t(`swimWizard.event.${e.id}.name`)}</span>
                    <Chip style={{ color: diffColor, borderColor: diffColor }}>{e.cat}</Chip>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 10 }}>{t(`swimWizard.event.${e.id}.kind`)}</div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                    <span><span style={{ color: 'var(--ink-3)' }}>{t('swimWizard.distanceLabel')} </span><span style={{ color: 'var(--ink-0)' }}>{formatDist(e.dist)}</span></span>
                    <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>{t(`swimWizard.event.${e.id}.tag`)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Step 2: 목표 설정 */}
      {step === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
          <div>
            {/* 목표 유형 */}
            <Text as="label" variant="eyebrow" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>{t('swimWizard.goalTypeLabel')}</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['completion', 'time', 'technique'] as const).map((v) => (
                <label
                  key={v}
                  style={{
                    padding: 14, borderRadius: 6, cursor: 'pointer',
                    background: goalType === v ? 'color-mix(in oklch, var(--aqua) 6%, var(--bg-2))' : 'var(--bg-2)',
                    border: '1px solid ' + (goalType === v ? 'var(--aqua)' : 'var(--line-soft)'),
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}
                >
                  <div
                    style={{
                      marginTop: 3, width: 16, height: 16, borderRadius: '50%',
                      border: '2px solid ' + (goalType === v ? 'var(--aqua)' : 'var(--line)'),
                      background: goalType === v ? 'var(--aqua)' : 'transparent',
                      flexShrink: 0, cursor: 'pointer',
                    }}
                    onClick={() => setGoalType(v)}
                  />
                  <div onClick={() => setGoalType(v)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{t(`swimWizard.goalType.${v}`)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{t(`swimWizard.goalTypeDesc.${v}`)}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* 목표일 */}
            <Text as="label" variant="eyebrow" style={{ display: 'block', marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>{t('swimWizard.targetDate')}</Text>
            <DateField
              value={eventDate}
              min={minDateStr}
              onChange={setEventDate}
              placeholder={t('swimWizard.targetDatePlaceholder')}
            />
            {eventDate && (
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                {t('swimWizard.daysLeft', { days: weeksLeft * 7, weeks: weeksLeft })}
              </div>
            )}

            {/* 목표 완주 시간 */}
            {goalType === 'time' && (
              <>
                <Text as="label" variant="eyebrow" style={{ display: 'block', marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>{t('swimWizard.targetTime')}</Text>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="number" value={goalMin} onChange={e => setGoalMin(+e.target.value)} min={0} max={120}
                    style={{ width: 72, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 16, color: 'var(--ink-0)', fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)' }}>{t('swimWizard.minUnit')}</span>
                  <input type="number" value={goalSec} onChange={e => setGoalSec(+e.target.value)} min={0} max={59}
                    style={{ width: 72, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 16, color: 'var(--ink-0)', fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)' }}>{t('swimWizard.secUnit')}</span>
                </div>
                <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t('swimWizard.requiredPace')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: feasColor, fontWeight: 600 }}>
                    {secToMmss(feas.targetPace100)}/100m
                  </span>
                </div>
              </>
            )}

            {/* 주당 운동 횟수 */}
            <Text as="label" variant="eyebrow" style={{ display: 'block', marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>{t('swimWizard.weeklySessions')}</Text>
            <div style={{ display: 'flex', gap: 6 }}>
              {([1, 2, 3, 4, 5] as const).map(n => (
                <button
                  key={n} type="button"
                  onClick={() => setWeeklySessions(n)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 6, fontSize: 14, fontFamily: 'var(--font-mono)',
                    background: weeklySessions === n ? 'var(--aqua)' : 'var(--bg-2)',
                    color: weeklySessions === n ? '#041820' : 'var(--ink-3)',
                    border: '1px solid ' + (weeklySessions === n ? 'var(--aqua)' : 'var(--line-soft)'),
                    cursor: 'pointer', fontWeight: weeklySessions === n ? 600 : 400,
                  }}
                >
                  {t('swimWizard.sessionCount', { n })}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>
              {t('swimWizard.sessionsHint')}
            </div>

            {/* OW/Tri 보정 안내 */}
            {isOW && (
              <div style={{ marginTop: 'var(--space-5)', padding: 14, background: 'color-mix(in oklch, var(--aqua) 6%, var(--bg-2))', borderRadius: 6, border: '1px solid color-mix(in oklch, var(--aqua) 20%, transparent)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5, display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--aqua)', flexShrink: 0, marginTop: 1, fontSize: 14 }}>🌊</span>
                <div>
                  <strong style={{ color: 'var(--ink-0)' }}>{t('swimWizard.owNote')}</strong> · {t('swimWizard.owNoteBody')}
                </div>
              </div>
            )}
            {isTri && (
              <div style={{ marginTop: 'var(--space-3)', padding: 14, background: 'color-mix(in oklch, var(--aqua) 6%, var(--bg-2))', borderRadius: 6, border: '1px solid color-mix(in oklch, var(--aqua) 20%, transparent)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5, display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--aqua)', flexShrink: 0, marginTop: 1, fontSize: 14 }}>🏊‍♂️</span>
                <div>
                  <strong style={{ color: 'var(--ink-0)' }}>{t('swimWizard.triNote')}</strong> · {t('swimWizard.triNoteBody')}
                </div>
              </div>
            )}
          </div>

          {/* Feasibility 패널 */}
          <div style={{ padding: 'var(--space-5)', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line-soft)', borderLeft: `3px solid ${feasColor}`, alignSelf: 'start' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 500, marginBottom: 'var(--space-3)' }}>
              {t('swimWizard.feasibilityLabel')}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: feasColor, letterSpacing: '-0.02em', marginBottom: 'var(--space-1)' }}>
              {t(FEAS_LABEL_KEYS[feas.label] ?? 'feasLabels.on_track')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              {t(`swimWizard.feasDesc.${feas.label}`)}
            </div>

            <div style={{ height: 1, background: 'var(--line-soft)', margin: '14px 0' }} />

            {goalType === 'time' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('swimWizard.feasRequiredPace')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: feasColor, fontWeight: 600 }}>{secToMmss(feas.targetPace100)}/100m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('swimWizard.feasCss')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--aqua)' }}>{secToMmss(cssPaceSec)}/100m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('swimWizard.feasPb1500')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{secToMmss(cssPaceSec * 15)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12, borderTop: '1px dashed var(--line-soft)', marginTop: 6, paddingTop: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('swimWizard.feasGap')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: feasColor, fontWeight: 600 }}>
                    {feas.gapSec >= 0 ? '+' : ''}{secToMmss(feas.gapSec)}/100m
                  </span>
                </div>
              </>
            )}
            {eventDate && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12, borderTop: goalType === 'time' ? '1px solid var(--line-soft)' : 'none', marginTop: goalType === 'time' ? 12 : 0, paddingTop: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('swimWizard.trainingPeriod')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{t('swimWizard.periodValue', { weeks: weeksLeft, sessions: weeksLeft * weeklySessions })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('swimWizard.peakWeeklyDist')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>
                    {(weeklySessions * 2.2).toFixed(1)} km
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('swimWizard.projectedCss')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--aqua)' }}>
                    {secToMmss(cssPaceSec - Math.round(weeksLeft / 4))}/100m
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step 3: 계획 확인 */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {([
              [t('swimWizard.kpi.totalWeeks'), String(weeksLeft), t('phase.weeksUnit')],
              [t('swimWizard.kpi.totalSessions'), String(weeksLeft * weeklySessions), null],
              [t('swimWizard.kpi.totalDist'), (weeksLeft * weeklySessions * 2.5).toFixed(0), 'km'],
              [t('swimWizard.kpi.tsbGoal'), '+10', null],
            ] as const).map(([k, v, u]) => (
              <div key={k} style={{ padding: 14, background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--line-soft)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 500, marginBottom: 6 }}>{k}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink-0)', letterSpacing: '-0.02em' }}>{v}</span>
                  {u && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)' }}>{u}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* 기간별 구성 */}
          <div style={{ padding: 22, background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--line-soft)' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 2 }}>{t('swimWizard.phasesTitle')}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('swimWizard.phasesSubtitle')}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `${buildW}fr ${peakW}fr ${taperW}fr`, gap: 1, border: '1px solid var(--line-soft)', borderRadius: 6, overflow: 'hidden' }}>
              {([
                ['buildup', buildW, 'oklch(0.70 0.09 220)'],
                ['peak', peakW, 'var(--aqua)'],
                ['taper', taperW, 'var(--amber)'],
              ] as const).map(([key, weeks, color]) => (
                <div key={key} style={{ padding: 'var(--space-4)', background: 'var(--bg-2)', borderLeft: `3px solid ${color}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)' }}>{t(`swimWizard.phase.${key}`)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{weeks}{t('phase.weeksUnit')}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {key === 'peak' && isOW ? t('swimWizard.phaseDesc.peakOw') : t(`swimWizard.phaseDesc.${key}`)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 페이스 존 */}
          <div style={{ padding: 22, background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--line-soft)' }}>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 2 }}>{t('swimWizard.paceZonesTitle')}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('swimWizard.paceZonesSubtitle', { pace: secToMmss(cssPaceSec) })}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-2)' }}>
              {([
                ['z1', cssPaceSec + 25, cssPaceSec + 40, 'oklch(0.70 0.10 220)'],
                ['z2', cssPaceSec + 12, cssPaceSec + 25, 'oklch(0.75 0.11 200)'],
                ['z3', cssPaceSec + 4, cssPaceSec + 12, 'oklch(0.78 0.12 180)'],
                ['z4', cssPaceSec - 3, cssPaceSec + 4, 'var(--aqua)'],
                ['z5', cssPaceSec - 15, cssPaceSec - 8, 'oklch(0.78 0.14 160)'],
              ] as const).map(([key, fast, slow, color]) => (
                <div key={key} style={{ padding: 'var(--space-3)', background: 'var(--bg-2)', borderRadius: 6, borderLeft: `3px solid ${color}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color, marginBottom: 6, fontWeight: 600 }}>{t(`swimWizard.paceZone.${key}`)}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-0)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    {secToMmss(fast)} – {secToMmss(slow)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>/100m</div>
                </div>
              ))}
            </div>
          </div>

          {/* TSB 곡선 */}
          <div style={{ padding: 22, background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--line-soft)' }}>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 2 }}>{t('swimWizard.tsbTitle')}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('swimWizard.tsbSubtitle')}</div>
            </div>
            <svg viewBox="0 0 800 160" style={{ width: '100%', height: 160 }} preserveAspectRatio="none">
              <line x1="0" x2="800" y1="80" y2="80" stroke="var(--line-soft)" strokeDasharray="4 4" />
              {(() => {
                const tsbProj = Array.from({ length: weeksLeft + 1 }, (_, i) => {
                  if (i < buildW) return -3 - (i / buildW) * 12;
                  if (i < buildW + peakW) return -15 + ((i - buildW) / peakW) * 8;
                  return -7 + ((i - buildW - peakW) / Math.max(1, taperW)) * 19;
                });
                const pts = tsbProj.map((v, i) => [i * (800 / weeksLeft), 80 - v * 2.8] as [number, number]);
                const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
                return (
                  <>
                    <path d={`${d} L 800 160 L 0 160 Z`} fill="url(#swimTsbF)" />
                    <path d={d} stroke="var(--aqua)" strokeWidth="2" fill="none" />
                    <circle cx={800} cy={pts[pts.length - 1]![1]} r="5" fill="var(--aqua)" stroke="#041820" strokeWidth="1.5" />
                  </>
                );
              })()}
              <defs>
                <linearGradient id="swimTsbF" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--aqua)" stopOpacity="0.2" />
                  <stop offset="1" stopColor="var(--aqua)" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 'var(--space-1)' }}>
              <span>{t('swimWizard.tsbToday')}</span>
              <span>{t('swimWizard.tsbBuildupLabel', { weeks: buildW })}</span>
              <span>{t('swimWizard.tsbPeakLabel', { weeks: buildW + peakW })}</span>
              <span>{t('swimWizard.tsbGoalDay', { date: eventDate })}</span>
            </div>
          </div>

          {/* 안내 */}
          <div style={{ padding: 'var(--space-4)', background: 'color-mix(in oklch, var(--aqua) 6%, var(--bg-1))', border: '1px solid color-mix(in oklch, var(--aqua) 25%, var(--line-soft))', borderRadius: 8, fontSize: 12, color: 'var(--ink-1)', lineHeight: 1.6, display: 'flex', gap: 'var(--space-3)' }}>
            <svg width={18} height={18} viewBox="0 0 18 18" fill="none" style={{ color: 'var(--aqua)', flexShrink: 0, marginTop: 2 }}>
              <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <strong style={{ color: 'var(--ink-0)' }}>{t('swimWizard.infoTitle')}</strong>{' '}
              {t('swimWizard.infoBody')}
            </div>
          </div>
        </div>
      )}

      {/* 에러 */}
      {createError && (
        <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', background: 'color-mix(in oklch, var(--rose) 10%, var(--bg-1))', border: '1px solid var(--rose)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--rose)' }}>
          {createError}
        </div>
      )}

      {/* Footer — sticky bottom 으로 첫 화면에서도 다음 버튼이 늘 보이게. */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 'var(--space-6)',
          position: 'sticky',
          bottom: 0,
          padding: 'var(--space-3) 0',
          background: 'linear-gradient(180deg, color-mix(in oklch, var(--bg-1) 0%, transparent) 0%, var(--bg-1) 30%)',
          borderTop: '1px solid var(--line-soft)',
          zIndex: 5,
        }}
      >
        <Button variant="ghost" onClick={handlePrev} style={{ opacity: step === 1 ? 0 : 1, pointerEvents: step === 1 ? 'none' : 'auto' }}>
          {t('footerButtons.prev')}
        </Button>
        <div style={{ flex: 1 }} />
        {step < 3 ? (
          <Button variant="primary" onClick={handleNext} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.4, cursor: canNext ? 'pointer' : 'not-allowed' }}>
            {t('footerButtons.next')}
          </Button>
        ) : (
          <Button variant="primary" onClick={handleStart} disabled={submitting}>
            {submitting ? t('footerButtons.starting') : t('footerButtons.start')}
          </Button>
        )}
      </div>
    </>
  );
}
