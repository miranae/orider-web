import { CalendarDays } from "lucide-react";
import { DateField } from "../components/redesign";
import GlossaryText from "../components/common/GlossaryText";
import { LocalizedLink } from "../components/LocalizedLink";
import { useSearchParams } from "react-router-dom";
import { goalCreatedPath } from "../utils/internalReturnPath";
import { useId, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useLocalizedNavigate as useNavigate } from '../hooks/useLocalizedNavigate';
import PermissionGate from '../components/redesign/states/PermissionGate';
import { Button, Card, Field, Input, Text } from '../theme/components';
import { functions } from '../services/firebase';
import { buildClimbGoalRequest, climbGoalDateBounds } from '../features/training/climbGoal';

export default function ClimbGoalSetupPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation('training');
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('20');
  const [wkg, setWkg] = useState('');
  const [date, setDate] = useState('');
  const [sessions, setSessions] = useState('4');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const dateBounds = climbGoalDateBounds();
  const fieldId = useId();

  if (authLoading && !user) return <Text as="div" variant="body" style={{ padding: embedded ? 'var(--space-4) 0' : 'var(--space-6)', color: 'var(--ink-3)' }}>{t('climbGoal.loading')}</Text>;
  if (!user || user.isAnonymous) return <PermissionGate title={t('climbGoal.loginTitle')} description={t('climbGoal.loginDescription')} actionLabel={t('climbGoal.loginAction')} onAction={() => { void signInWithGoogle(); }} />;

  const submit = async () => {
    try {
      setSubmitting(true); setError(false);
      const payload = buildClimbGoalRequest({
        climbName: name, climbDurationMin: Number(duration), targetWkg: wkg ? Number(wkg) : undefined,
        targetDate: date, weeklySessions: Number(sessions) as 1 | 2 | 3 | 4 | 5 | 6,
      });
      const result = await httpsCallable(functions, 'createGoal')(payload);
      navigate(goalCreatedPath(searchParams, "bike", (result.data as { goalId: string }).goalId));
    } catch { setError(true); setSubmitting(false); }
  };

  return <div style={{ maxWidth: 640, margin: '0 auto', padding: embedded ? 'var(--space-4) 0' : 'var(--space-6)' }}>
    <Text as={embedded ? "h2" : "h1"} variant={embedded ? "title" : "pageTitle"}>{t('climbGoal.title')}</Text>
    <Text as="p" variant="body" style={{ color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>{t('climbGoal.description')}</Text>
    <Card data-testid="K3-4-1" style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
      <Field label={t('climbGoal.name')} htmlFor={`${fieldId}-name`}><Input id={`${fieldId}-name`} style={{ height: 'var(--dim-button-height)' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label={t('climbGoal.duration')} htmlFor={`${fieldId}-duration`}><Input id={`${fieldId}-duration`} style={{ height: 'var(--dim-button-height)' }} type="number" min={3} max={240} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
      <Field label={t('climbGoal.wkg')} hint={<GlossaryText>W/kg</GlossaryText>} htmlFor={`${fieldId}-wkg`}><Input id={`${fieldId}-wkg`} style={{ height: 'var(--dim-button-height)' }} type="number" min={1} max={8} step={0.1} value={wkg} onChange={(e) => setWkg(e.target.value)} /></Field>
      <Field label={t('climbGoal.date')} htmlFor={`${fieldId}-date`}><DateField id={`${fieldId}-date`} portal icon={<CalendarDays size={16} />} presets={false} min={dateBounds.min} max={dateBounds.max} value={date} onChange={setDate} /></Field>
      <Field label={t('climbGoal.sessions')} htmlFor={`${fieldId}-sessions`}><Input id={`${fieldId}-sessions`} style={{ height: 'var(--dim-button-height)' }} type="number" min={1} max={6} value={sessions} onChange={(e) => setSessions(e.target.value)} /></Field>
      <LocalizedLink data-testid="K3-4-3" to="/explore/segments">{t("goalHub.pickSegment")}</LocalizedLink>
      {error && <Text role="alert" variant="caption" style={{ color: 'var(--rose)' }}>{t('climbGoal.error')}</Text>}
      <Button data-testid="K3-4-2" onClick={() => { void submit(); }} disabled={submitting}>{t('climbGoal.submit')}</Button>
    </Card>
  </div>;
}
