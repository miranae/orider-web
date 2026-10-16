import { CalendarDays } from "lucide-react";
import { useGoalFitnessInputs } from "../../hooks/useGoalFitnessInputs";
import { GoalInputNotice } from "./GoalInputNotice";
import { useSearchParams } from "react-router-dom";
import { goalCreatedPath } from "../../utils/internalReturnPath";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { logClientError } from '../../services/errorLogger';
import { FEAS_COLORS, FEAS_LABEL_KEYS } from './constants';
import type { FeasibilityLabel } from '@shared/types/goal';
import { DateField } from '../redesign';
import "./goal-preview.css";
import { Button, Card, Chip, Input, Text } from "../../theme/components";

// ── 러닝 이벤트 라이브러리 ──────────────────────────────────────────────────
const EVENTS = [
  { id: '5k',    dist: 5.0,   cat: 'Short' },
  { id: '10k',   dist: 10.0,   cat: 'Mid'   },
  { id: 'half',  dist: 21.1,  cat: 'Long'  },
  { id: 'full',  dist: 42.2,  cat: 'Long'  },
  { id: 'seoul', dist: 42.2,  cat: 'Long'  },
  { id: 'trail', dist: 24.0, cat: 'Trail' },
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

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

  const inputs = useGoalFitnessInputs();
  const lthrPaceSec = inputs.thresholdPace;

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


  const minDate = new Date(today.getTime() + 4 * 7 * 24 * 60 * 60 * 1000);
  const minDateStr = minDate.toISOString().slice(0, 10);

  const canNext = step === 1 ? true : step === 2 ? eventDate >= minDateStr && (goalType === 'completion' || Number.isFinite(targetTotalSec) && targetTotalSec > 0) : true;

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
      navigate(goalCreatedPath(searchParams, "run", data.goalId));
    } catch (err) {
      logClientError('RunGoalSetupWizard.handleStart', err, { eventId, goalType, eventDate, weeklySessions });
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
        <Card data-testid="K3-3-3" padding="none" style={{ padding: "var(--space-4)" }}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Text as="h2" variant="subtitle" style={{ margin: '0 0 var(--space-1)' }}>
              {t('runWizard.selectHeading')}
            </Text>
            <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-2)' }}>
              {t('runWizard.selectSubtitle')}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))', gap: "var(--space-2)" }}>
            {EVENTS.map(e => {
              const sel = e.id === eventId;
              const diffColor = e.dist >= 30 ? 'var(--rose)' : e.dist >= 15 ? 'var(--amber)' : 'var(--lime)';
              return (
                <button
                  key={e.id} type="button" aria-pressed={sel}
                  onClick={() => setEventId(e.id)}
                  style={{
                    textAlign: 'left', padding: 'var(--space-4)', borderRadius: 'var(--r-md)',
                    background: sel ? 'color-mix(in oklch, var(--lime) 8%, var(--bg-2))' : 'var(--bg-2)',
                    border: `${sel ? 2 : 1}px solid ${sel ? 'var(--lime)' : 'var(--line-soft)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>{t(`runWizard.event.${e.id}.name`)}</span>
                    <Chip style={{ color: "var(--ink-1)", borderColor: diffColor }}>{t(`runWizard.category.${e.cat}`)}</Chip>
                  </div>
                  <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-2)', marginBottom: "var(--space-2)" }}>{t(`runWizard.event.${e.id}.kind`)}</div>
                  <div style={{ display: 'flex', gap: "var(--space-3)", fontSize: "var(--fs-md)" }}>
                    <span><span style={{ color: 'var(--ink-2)' }}>{t('runWizard.distanceLabel')} </span><span style={{ color: 'var(--ink-0)', fontFamily: 'var(--font-mono)' }}>{e.dist} km</span></span>
                    <span style={{ marginLeft: 'auto', color: 'var(--ink-2)' }}>{t(`runWizard.event.${e.id}.tag`)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Step 2: 목표 설정 */}
      {step === 2 && (
        <div data-testid="K3-3-4" className="run-goal-details">
          <div>
            {/* 목표 유형 */}
            <fieldset className="run-goal-types">
              <legend><Text variant="bodyMedium">{t('runWizard.goalTypeLabel')}</Text></legend>
              {(['completion', 'time', 'race'] as const).map((v) => (
                <label
                  key={v}
                  style={{
                    padding: "var(--space-3)", borderRadius: "var(--r-md)", cursor: 'pointer',
                    background: goalType === v ? 'color-mix(in oklch, var(--lime) 6%, var(--bg-2))' : 'var(--bg-2)',
                    border: '1px solid ' + (goalType === v ? 'var(--lime)' : 'var(--line-soft)'),
                    display: 'flex', alignItems: 'flex-start', gap: "var(--space-2)",
                  }}
                >
                  <input type="radio" name="run-goal-type" value={v} checked={goalType === v} onChange={() => setGoalType(v)} />
                  <div>
                    <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: 'var(--ink-0)' }}>{t(`runWizard.goalType.${v}`)}</div>
                    <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-2)', marginTop: "var(--space-0-5)" }}>{t(`runWizard.goalTypeDesc.${v}`)}</div>
                  </div>
                </label>
              ))}
            </fieldset>

            {/* 목표일 */}
            <label htmlFor="run-goal-date" style={{ display: 'block', marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}><Text variant="bodyMedium">{t('runWizard.targetDate')}</Text></label>
            <DateField portal icon={<CalendarDays size={16} />}
              id="run-goal-date"
              value={eventDate}
              min={minDateStr}
              onChange={setEventDate}
              placeholder={t('runWizard.targetDatePlaceholder')}
            />
            {eventDate && (
              <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-2)', marginTop: "var(--space-1-5)" }}>
                {t('runWizard.daysLeft', { days: Math.ceil((eventDateObj.getTime() - today.getTime()) / 86400000), weeks: weeksLeft })}
              </div>
            )}

            {/* 목표 완주 시간 */}
            {goalType !== 'completion' && (
              <>
                <fieldset className="run-goal-time">
                  <legend><Text variant="bodyMedium">{t('runWizard.targetTime')}</Text></legend>
                  {([
                    ['hours', goalHour, setGoalHour, 12, 'hourUnit'],
                    ['minutes', goalMin, setGoalMin, 59, 'minUnit'],
                    ['seconds', goalSec, setGoalSec, 59, 'secUnit'],
                  ] as const).map(([key, value, setValue, max, unit]) => <label key={key}>
                    <Input mono style={{ minHeight: 'var(--dim-button-height)' }} type="number" aria-label={t(`runWizard.timeInput.${key}`)} value={value} min={0} max={max}
                      onChange={event => setValue(Math.max(0, Math.min(max, Number(event.target.value))))} />
                    <Text variant="caption">{t(`runWizard.${unit}`)}</Text>
                  </label>)}
                </fieldset>
                <div style={{ marginTop: "var(--space-2)", padding: '10px 12px', background: 'var(--bg-2)', borderRadius: "var(--r-md)", border: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: "var(--fs-md)", color: 'var(--ink-2)' }}>{t('runWizard.requiredPace')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: "var(--fs-sm)", color: "var(--ink-1)", fontWeight: 600 }}>
                    {secToMmss(feas.targetPaceSec)}/km
                  </span>
                </div>
              </>
            )}

            {/* 주당 운동 횟수 */}
            <Text as="label" variant="bodyMedium" style={{ display: 'block', marginTop: 'var(--space-5)', marginBottom: 'var(--space-2)' }}>{t('runWizard.weeklySessions')}</Text>
            <div role="group" aria-label={t('runWizard.weeklySessions')} style={{ display: 'flex', gap: "var(--space-1-5)" }}>
              {([1, 2, 3, 4, 5, 6] as const).map(n => (
                <button
                  key={n} type="button" aria-pressed={weeklySessions === n}
                  onClick={() => setWeeklySessions(n)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: "var(--r-md)", fontSize: "var(--fs-sm)",
                    background: weeklySessions === n ? 'var(--accent-soft-bg)' : 'var(--bg-2)',
                    color: weeklySessions === n ? 'var(--ink-1)' : 'var(--ink-2)',
                    border: '1px solid ' + (weeklySessions === n ? 'var(--accent-soft-border)' : 'var(--line-soft)'),
                    cursor: 'pointer', fontWeight: weeklySessions === n ? 600 : 400,
                  }}
                >
                  {t('runWizard.sessionCount', { n })}
                </button>
              ))}
            </div>
            <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-2)', marginTop: "var(--space-1-5)" }}>
              {t('runWizard.sessionsHint')}
            </div>
          </div>

          {/* Feasibility 패널 */}
          <div data-testid="K3-3-5" style={{ padding: 'var(--space-5)', background: 'var(--bg-2)', borderRadius: "var(--r-lg)", border: '1px solid var(--line-soft)', borderLeft: `3px solid ${feasColor}`, alignSelf: 'start' }}>
            <GoalInputNotice discipline="run" assumed={inputs.thresholdPaceSource === "assumed"} />
            <Text as="div" variant="bodyMedium" tone="tertiary" style={{ marginBottom: 'var(--space-3)' }}>
              {t('runWizard.feasibilityLabel')}
            </Text>
            <Text as="div" variant="title" style={{ marginBottom: 'var(--space-1)' }}>
              {goalType === 'completion' ? t('runWizard.completionComparison') : t(FEAS_LABEL_KEYS[feas.label] ?? 'feasLabels.on_track')}
            </Text>
            <div style={{ fontSize: "var(--fs-md)", color: 'var(--ink-2)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              {t(goalType === 'completion' ? 'runWizard.completionComparisonHelp' : `runWizard.feasDesc.${feas.label}`)}
            </div>

            <div style={{ height: 1, background: 'var(--line-soft)', margin: '14px 0' }} />

            {goalType !== 'completion' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: "var(--fs-md)" }}>
                  <span style={{ color: 'var(--ink-2)' }}>{t('runWizard.feasRequiredPace')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: "var(--ink-1)", fontWeight: 600 }}>{secToMmss(feas.targetPaceSec)}/km</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: "var(--fs-md)" }}>
                  <span style={{ color: 'var(--ink-2)' }}>{t('runWizard.feasLthrPace')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{secToMmss(lthrPaceSec)}/km</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: "var(--fs-md)", borderTop: '1px dashed var(--line-soft)', marginTop: "var(--space-1-5)", paddingTop: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--ink-2)' }}>{t('runWizard.feasGap')}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: "var(--ink-1)", fontWeight: 600 }}>
                    {feas.gapSec >= 0 ? '+' : '−'}{secToMmss(Math.abs(feas.gapSec))}/km
                  </span>
                </div>
              </>
            )}
            {eventDate && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: "var(--fs-md)", borderTop: goalType !== 'completion' ? '1px solid var(--line-soft)' : 'none', marginTop: goalType !== 'completion' ? 12 : 0, paddingTop: 'var(--space-3)' }}>
                <span style={{ color: 'var(--ink-2)' }}>{t('runWizard.trainingPeriod')}</span>
                <span style={{ color: 'var(--ink-1)' }}>{t('runWizard.periodValue', { weeks: weeksLeft, sessions: weeklySessions })}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: 입력 내용 검토 — 실제 계획은 서버 생성 후 확인 */}
      {step === 3 && <Card data-testid="K3-3-6" className="goal-preview" padding="compact">
        <Text as="h2" variant="subtitle">{t('previewReview.title')}</Text>
        <Text as="p" variant="bodySmall" tone="secondary">{t('previewReview.notSaved')}</Text>
        <dl className="goal-preview__facts">
          {[
            [t('previewReview.event'), t(`runWizard.event.${ev.id}.name`)],
            [t('previewReview.distance'), `${ev.dist} km`],
            [t('previewReview.date'), eventDate],
            [t('previewReview.goalType'), t(`runWizard.goalType.${goalType}`)],
            [t('previewReview.frequency'), t('previewReview.sessions', { count: weeklySessions })],
            [t('previewReview.remaining'), t('previewReview.weeks', { weeks: weeksLeft })],
            ...(goalType !== 'completion' ? [[t('previewReview.duration'), `${goalHour}${t('runWizard.hourUnit')} ${goalMin}${t('runWizard.minUnit')} ${goalSec}${t('runWizard.secUnit')}`]] : []),
          ].map(([label, value]) => <div key={label}><Text as="dt" variant="caption" tone="secondary">{label}</Text><Text as="dd" variant="bodyMedium" weight={600}>{value}</Text></div>)}
        </dl>
        <Text as="p" variant="bodySmall" tone="secondary">{t('previewReview.pendingPlan')}</Text>
      </Card>}

      {/* 에러 */}
      {createError && (
        <div data-testid="K3-3-8" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', background: 'color-mix(in oklch, var(--rose) 10%, var(--bg-1))', border: '1px solid var(--rose)', borderRadius: 'var(--r-md)', fontSize: "var(--fs-sm)", color: 'var(--rose)' }}>
          {createError}
        </div>
      )}

      {/* Footer — sticky bottom 으로 첫 화면에서도 다음 버튼이 늘 보이게 (UX). */}
      <div
        style={{
          display: 'flex',
          gap: "var(--space-2)",
          marginTop: 'var(--space-6)',
          position: 'sticky',
          bottom: 0,
          padding: 'var(--space-3) 0',
          background: 'linear-gradient(180deg, color-mix(in oklch, var(--bg-1) 0%, transparent) 0%, var(--bg-1) 30%)',
          borderTop: '1px solid var(--line-soft)',
          zIndex: 5,
        }}
      >
        <Button variant="ghost" disabled={step === 1 || submitting} onClick={handlePrev} style={{ opacity: step === 1 ? 0 : 1, pointerEvents: step === 1 ? 'none' : 'auto' }}>
          {t('footerButtons.prev')}
        </Button>
        <div style={{ flex: 1 }} />
        {step < 3 ? (
          <Button variant="primary" onClick={handleNext} disabled={!canNext} style={{ opacity: canNext ? 1 : 0.4, cursor: canNext ? 'pointer' : 'not-allowed' }}>
            {t('footerButtons.next')}
          </Button>
        ) : (
          <Button variant="primary" data-testid="K3-3-7" onClick={handleStart} disabled={submitting}>
            {submitting ? t('footerButtons.starting') : t('footerButtons.start')}
          </Button>
        )}
      </div>
    </>
  );
}
