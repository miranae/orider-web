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

// ── 러닝 이벤트 라이브러리 ──────────────────────────────────────────────────
const EVENTS = [
  { id: '5k',    dist: 5.0,   elev: 20,   cat: 'Short' },
  { id: '10k',   dist: 10.0,  elev: 60,   cat: 'Mid'   },
  { id: 'half',  dist: 21.1,  elev: 140,  cat: 'Long'  },
  { id: 'full',  dist: 42.2,  elev: 280,  cat: 'Long'  },
  { id: 'seoul', dist: 42.2,  elev: 320,  cat: 'Long'  },
  { id: 'trail', dist: 24.0,  elev: 1240, cat: 'Trail' },
] as const;

type RunGoalType = 'completion' | 'time' | 'race';

// ── 유틸리티 ─────────────────────────────────────────────────────────────────
function secToMmss(s: number): string {
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const rs = Math.round(abs - m * 60);
  return `${m}:${String(rs).padStart(2, '0')}`;
}

// ── Feasibility 계산 (LTHR 페이스 기반) ─────────────────────────────────────
interface RunFeasibility {
  label: FeasibilityLabel;
  targetPaceSec: number;    // sec/km
  lthrPaceSec: number;      // sec/km
  gapSec: number;           // 음수면 임계보다 빠른 목표
}

function calcRunFeasibility(
  dist: number,
  goalType: RunGoalType,
  targetTotalSec: number,
  lthrPaceSec: number,
): RunFeasibility {
  const targetPaceSec = targetTotalSec / dist;
  const gapSec = targetPaceSec - lthrPaceSec;

  let label: FeasibilityLabel;
  if (goalType === 'completion') label = 'on_track';
  else if (gapSec > 40) label = 'easy';
  else if (gapSec > 10) label = 'on_track';
  else if (gapSec > -20) label = 'stretch';
  else label = 'risky';

  return { label, targetPaceSec, lthrPaceSec, gapSec };
}

// ── 컴포넌트 ────────────────────────────────────────────────────────────────
interface RunGoalSetupWizardProps {
  Stepper: React.ComponentType<{ current: number; steps: string[] }>;
}

export default function RunGoalSetupWizard({ Stepper }: RunGoalSetupWizardProps) {
  const { t } = useTranslation('training');
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState<string>('half');
  const [goalType, setGoalType] = useState<RunGoalType>('time');
  const [eventDate, setEventDate] = useState('');
  const [goalHour, setGoalHour] = useState(1);
  const [goalMin, setGoalMin] = useState(50);
  const [goalSec, setGoalSec] = useState(0);
  const [weeklySessions, setWeeklySessions] = useState<1 | 2 | 3 | 4 | 5 | 6>(4);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const lthrPaceSec: number = (typeof profile?.thresholdPace === 'number' && profile.thresholdPace > 0)
    ? profile.thresholdPace
    : 4 * 60 + 35; // 기본 4:35/km

  const ev = EVENTS.find(e => e.id === eventId)!;
  const targetTotalSec = goalHour * 3600 + goalMin * 60 + goalSec;
  const feas = calcRunFeasibility(ev.dist, goalType, targetTotalSec, lthrPaceSec);
  const feasColor = FEAS_COLORS[feas.label];

  // 남은 주수
  const today = new Date();
  const eventDateObj = eventDate ? new Date(eventDate) : today;
  const weeksLeft = Math.max(1, Math.round(
    (eventDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7),
  ));

  const buildW = Math.round(weeksLeft * 0.6);
  const peakW = Math.round(weeksLeft * 0.25);
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
        discipline: 'run',
      });
      const data = result.data as { goalId: string };
      navigate(`/plan?goalId=${data.goalId}`);
    } catch (err) {
      console.error('러닝 목표 생성 실패:', err);
      setCreateError(t('errors.creationError'));
      setSubmitting(false);
    }
  };

  const stepLabels = [
    t('goals.stepLabels.runEvent'),
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
              {t('runWizard.selectHeading')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {t('runWizard.selectSubtitle')}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {EVENTS.map(e => {
              const sel = e.id === eventId;
              const diffColor = e.dist >= 30 ? 'var(--rose)' : e.dist >= 15 ? 'var(--amber)' : 'var(--lime)';
              return (
                <button
                  key={e.id}
                  onClick={() => setEventId(e.id)}
                  style={{
                    textAlign: 'left', padding: 'var(--space-4)', borderRadius: 'var(--r-md)',
                    background: sel ? 'color-mix(in oklch, var(--lime) 8%, var(--bg-2))' : 'var(--bg-2)',
                    border: `${sel ? 2 : 1}px solid ${sel ? 'var(--lime)' : 'var(--line-soft)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>{t(`runWizard.event.${e.id}.name`)}</span>
                    <Chip style={{ color: diffColor, borderColor: diffColor }}>{e.cat}</Chip>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 10 }}>{t(`runWizard.event.${e.id}.kind`)}</div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                    <span><span style={{ color: 'var(--ink-3)' }}>{t('runWizard.distanceLabel')} </span><span style={{ color: 'var(--ink-0)' }}>{e.dist} km</span></span>
                    <span><span style={{ color: 'var(--ink-3)' }}>↑ </span><span style={{ color: 'var(--ink-0)' }}>{e.elev} m</span></span>
                    <span style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}>{t(`runWizard.event.${e.id}.tag`)}</span>
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
            <Text as="label" variant="eyebrow" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>{t('runWizard.goalTypeLabel')}</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['completion', 'time', 'race'] as const).map((v) => (
                <label
                  key={v}
                  style={{
                    padding: 14, borderRadius: 6, cursor: 'pointer',
                    background: goalType === v ? 'color-mix(in oklch, var(--lime) 6%, var(--bg-2))' : 'var(--bg-2)',
                    border: '1px solid ' + (goalType === v ? 'var(--lime)' : 'var(--line-soft)'),
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}
                >
                  <div
                    style={{
                      marginTop: 3, width: 16, height: 16, borderRadius: '50%',
                      border: '2px solid ' + (goalType === v ? 'var(--lime)' : 'var(--line)'),
                      background: goalType === v ? 'var(--lime)' : 'transparent',
                      flexShrink: 0, cursor: 'pointer',
                    }}
                    onClick={() => setGoalType(v)}
                  />
                  <div onClick={() => setGoalType(v)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{t(`runWizard.goalType.${v}`)}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{t(`runWizard.goalTypeDesc.${v}`)}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* 목표일 */}
            <Text as="label" variant="eyebrow" style={{ display: 'block', marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>{t('runWizard.targetDate')}</Text>
            <DateField
              value={eventDate}
              min={minDateStr}
              onChange={setEventDate}
              placeholder={t('runWizard.targetDatePlaceholder')}
            />
            {eventDate && (
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                {t('runWizard.daysLeft', { days: weeksLeft * 7, weeks: weeksLeft })}
              </div>
            )}

            {/* 목표 완주 시간 */}
            {goalType !== 'completion' && (
              <>
                <Text as="label" variant="eyebrow" style={{ display: 'block', marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>{t('runWizard.targetTime')}</Text>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="number" value={goalHour} onChange={e => setGoalHour(+e.target.value)} min={0} max={12}
                    style={{ width: 64, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 16, color: 'var(--ink-0)', fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)' }}>{t('runWizard.hourUnit')}</span>
                  <input type="number" value={goalMin} onChange={e => setGoalMin(+e.target.value)} min={0} max={59}
                    style={{ width: 64, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 16, color: 'var(--ink-0)', fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)' }}>{t('runWizard.minUnit')}</span>
                  <input type="number" value={goalSec} onChange={e => setGoalSec(+e.target.value)} min={0} max={59}
                    style={{ width: 64, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, fontSize: 16, color: 'var(--ink-0)', fontFamily: 'var(--font-mono)', textAlign: 'center' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink-2)' }}>{t('runWizard.secUnit')}</span>
                </div>
                <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t('runWizard.requiredPace')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: feasColor, fontWeight: 600 }}>
                    {secToMmss(feas.targetPaceSec)}/km
                  </span>
                </div>
              </>
            )}

            {/* 주당 운동 횟수 */}
            <Text as="label" variant="eyebrow" style={{ display: 'block', marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>{t('runWizard.weeklySessions')}</Text>
            <div style={{ display: 'flex', gap: 6 }}>
              {([1, 2, 3, 4, 5, 6] as const).map(n => (
                <button
                  key={n} type="button"
                  onClick={() => setWeeklySessions(n)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 6, fontSize: 14, fontFamily: 'var(--font-mono)',
                    background: weeklySessions === n ? 'var(--accent-soft-bg)' : 'var(--bg-2)',
                    color: weeklySessions === n ? 'var(--lime)' : 'var(--ink-3)',
                    border: '1px solid ' + (weeklySessions === n ? 'var(--accent-soft-border)' : 'var(--line-soft)'),
                    cursor: 'pointer', fontWeight: weeklySessions === n ? 600 : 400,
                  }}
                >
                  {t('runWizard.sessionCount', { n })}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>
              {t('runWizard.sessionsHint')}
            </div>
          </div>

          {/* Feasibility 패널 */}
          <div style={{ padding: 'var(--space-5)', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line-soft)', borderLeft: `3px solid ${feasColor}`, alignSelf: 'start' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)', fontWeight: 500, marginBottom: 'var(--space-3)' }}>
              {t('runWizard.feasibilityLabel')}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: feasColor, letterSpacing: '-0.02em', marginBottom: 'var(--space-1)' }}>
              {t(FEAS_LABEL_KEYS[feas.label] ?? 'feasLabels.on_track')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              {t(`runWizard.feasDesc.${feas.label}`)}
            </div>

            <div style={{ height: 1, background: 'var(--line-soft)', margin: '14px 0' }} />

            {goalType !== 'completion' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('runWizard.feasRequiredPace')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: feasColor, fontWeight: 600 }}>{secToMmss(feas.targetPaceSec)}/km</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('runWizard.feasLthrPace')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{secToMmss(lthrPaceSec)}/km</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('runWizard.feasPb5k')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{secToMmss(lthrPaceSec - 30)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12, borderTop: '1px dashed var(--line-soft)', marginTop: 6, paddingTop: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--ink-3)' }}>{t('runWizard.feasGap')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: feasColor, fontWeight: 600 }}>
                    {feas.gapSec >= 0 ? '+' : '−'}{secToMmss(Math.abs(feas.gapSec))}/km
                  </span>
                </div>
              </>
            )}
            {eventDate && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12, borderTop: goalType !== 'completion' ? '1px solid var(--line-soft)' : 'none', marginTop: goalType !== 'completion' ? 12 : 0, paddingTop: 'var(--space-3)' }}>
                <span style={{ color: 'var(--ink-3)' }}>{t('runWizard.trainingPeriod')}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{t('runWizard.periodValue', { weeks: weeksLeft, sessions: weeksLeft * weeklySessions })}</span>
              </div>
            )}
            {eventDate && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12 }}>
                <span style={{ color: 'var(--ink-3)' }}>{t('runWizard.peakWeeklyDist')}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>
                  {Math.round(ev.dist * 2.8)} km
                </span>
              </div>
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
              [t('runWizard.kpi.totalWeeks'), String(weeksLeft), t('phase.weeksUnit')],
              [t('runWizard.kpi.totalSessions'), String(weeksLeft * weeklySessions), null],
              [t('runWizard.kpi.totalDist'), String(Math.round(weeksLeft * ev.dist * 2.2).toLocaleString()), 'km'],
              [t('runWizard.kpi.tsbGoal'), '+12', null],
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
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 2 }}>{t('runWizard.phasesTitle')}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('runWizard.phasesSubtitle')}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `${buildW}fr ${peakW}fr ${taperW}fr`, gap: 1, border: '1px solid var(--line-soft)', borderRadius: 6, overflow: 'hidden' }}>
              {([
                ['buildup', buildW, 'var(--aqua)'],
                ['peak', peakW, 'var(--lime)'],
                ['taper', taperW, 'var(--amber)'],
              ] as const).map(([key, weeks, color]) => (
                <div key={key} style={{ padding: 'var(--space-4)', background: 'var(--bg-2)', borderLeft: `3px solid ${color}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)' }}>{t(`runWizard.phase.${key}`)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{weeks}{t('phase.weeksUnit')}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5 }}>{t(`runWizard.phaseDesc.${key}`)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 페이스 존 */}
          <div style={{ padding: 22, background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--line-soft)' }}>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 2 }}>{t('runWizard.paceZonesTitle')}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('runWizard.paceZonesSubtitle', { pace: secToMmss(lthrPaceSec) })}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-2)' }}>
              {([
                ['z1', lthrPaceSec + 90, lthrPaceSec + 120, 'var(--aqua)'],
                ['z2', lthrPaceSec + 40, lthrPaceSec + 80, 'oklch(0.75 0.11 200)'],
                ['z3', lthrPaceSec + 15, lthrPaceSec + 30, 'var(--amber)'],
                ['z4', lthrPaceSec - 5, lthrPaceSec + 10, 'var(--lime)'],
                ['z5', lthrPaceSec - 25, lthrPaceSec - 10, 'var(--rose)'],
              ] as const).map(([key, fast, slow, color]) => (
                <div key={key} style={{ padding: 'var(--space-3)', background: 'var(--bg-2)', borderRadius: 6, borderLeft: `3px solid ${color}` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color, marginBottom: 6, fontWeight: 600 }}>{t(`runWizard.paceZone.${key}`)}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-0)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    {secToMmss(fast)} – {secToMmss(slow)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>/km</div>
                </div>
              ))}
            </div>
          </div>

          {/* TSB 곡선 */}
          <div style={{ padding: 22, background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--line-soft)' }}>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)', marginBottom: 2 }}>{t('runWizard.tsbTitle')}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('runWizard.tsbSubtitle')}</div>
            </div>
            <svg viewBox="0 0 800 160" style={{ width: '100%', height: 160 }} preserveAspectRatio="none">
              <line x1="0" x2="800" y1="80" y2="80" stroke="var(--line-soft)" strokeDasharray="4 4" />
              {(() => {
                const tsbProj = Array.from({ length: weeksLeft + 1 }, (_, i) => {
                  if (i < buildW) return -5 - (i / buildW) * 15;
                  if (i < buildW + peakW) return -20 + ((i - buildW) / peakW) * 10;
                  return -10 + ((i - buildW - peakW) / Math.max(1, taperW)) * 22;
                });
                const pts = tsbProj.map((v, i) => [i * (800 / weeksLeft), 80 - v * 2.5] as [number, number]);
                const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
                return (
                  <>
                    <path d={`${d} L 800 160 L 0 160 Z`} fill="url(#runTsbF)" />
                    <path d={d} stroke="var(--lime)" strokeWidth="2" fill="none" />
                    <circle cx={800} cy={pts[pts.length - 1]![1]} r="5" fill="var(--lime)" stroke="var(--primary-fg)" strokeWidth="1.5" />
                  </>
                );
              })()}
              <defs>
                <linearGradient id="runTsbF" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--lime)" stopOpacity="0.2" />
                  <stop offset="1" stopColor="var(--lime)" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 'var(--space-1)' }}>
              <span>{t('runWizard.tsbToday')}</span>
              <span>{t('runWizard.tsbBuildupLabel', { weeks: buildW })}</span>
              <span>{t('runWizard.tsbPeakLabel', { weeks: buildW + peakW })}</span>
              <span>{t('runWizard.tsbGoalDay', { date: eventDate })}</span>
            </div>
          </div>

          {/* 안내 */}
          <div style={{ padding: 'var(--space-4)', background: 'color-mix(in oklch, var(--lime) 6%, var(--bg-1))', border: '1px solid color-mix(in oklch, var(--lime) 25%, var(--line-soft))', borderRadius: 8, fontSize: 12, color: 'var(--ink-1)', lineHeight: 1.6, display: 'flex', gap: 'var(--space-3)' }}>
            <svg width={18} height={18} viewBox="0 0 18 18" fill="none" style={{ color: 'var(--lime)', flexShrink: 0, marginTop: 2 }}>
              <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <strong style={{ color: 'var(--ink-0)' }}>{t('runWizard.infoTitle')}</strong>{' '}
              {t('runWizard.infoBody')}
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

      {/* Footer — sticky bottom 으로 첫 화면에서도 다음 버튼이 늘 보이게 (UX). */}
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
