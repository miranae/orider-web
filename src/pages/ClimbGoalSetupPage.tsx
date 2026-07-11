import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useLocalizedNavigate as useNavigate } from '../hooks/useLocalizedNavigate';
import PermissionGate from '../components/redesign/states/PermissionGate';
import { Button, Card, Field, Input, Text } from '../theme/components';
import { functions } from '../services/firebase';
import { buildClimbGoalRequest, climbGoalDateBounds } from '../features/training/climbGoal';

export default function ClimbGoalSetupPage() {
  const { t } = useTranslation('training');
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('20');
  const [wkg, setWkg] = useState('');
  const [date, setDate] = useState('');
  const [sessions, setSessions] = useState('4');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const dateBounds = climbGoalDateBounds();

  if (authLoading) return <Text as="div" variant="body" style={{ padding: 'var(--space-6)', color: 'var(--ink-3)' }}>{t('climbGoal.loading')}</Text>;
  if (!user) return <PermissionGate title={t('climbGoal.loginTitle')} description={t('climbGoal.loginDescription')} actionLabel={t('climbGoal.loginAction')} onAction={() => { void signInWithGoogle(); }} />;

  const submit = async () => {
    try {
      setSubmitting(true); setError(false);
      const payload = buildClimbGoalRequest({
        climbName: name, climbDurationMin: Number(duration), targetWkg: wkg ? Number(wkg) : undefined,
        targetDate: date, weeklySessions: Number(sessions) as 1 | 2 | 3 | 4 | 5 | 6,
      });
      const result = await httpsCallable(functions, 'createGoal')(payload);
      navigate(`/plan?goalId=${(result.data as { goalId: string }).goalId}`);
    } catch { setError(true); setSubmitting(false); }
  };

  return <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-6)' }}>
    <Text as="h1" variant="title">{t('climbGoal.title')}</Text>
    <Text as="p" variant="body" style={{ color: 'var(--ink-3)', marginTop: 'var(--space-2)' }}>{t('climbGoal.description')}</Text>
    <Card style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
      <Field label={t('climbGoal.name')}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <Field label={t('climbGoal.duration')}><Input type="number" min={3} max={240} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
      <Field label={t('climbGoal.wkg')}><Input type="number" min={1} max={8} step={0.1} value={wkg} onChange={(e) => setWkg(e.target.value)} /></Field>
      <Field label={t('climbGoal.date')}><Input type="date" min={dateBounds.min} max={dateBounds.max} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={t('climbGoal.sessions')}><Input type="number" min={1} max={6} value={sessions} onChange={(e) => setSessions(e.target.value)} /></Field>
      {error && <Text variant="caption" style={{ color: 'var(--rose)' }}>{t('climbGoal.error')}</Text>}
      <Button onClick={() => { void submit(); }} disabled={submitting}>{t('climbGoal.submit')}</Button>
    </Card>
  </div>;
}
