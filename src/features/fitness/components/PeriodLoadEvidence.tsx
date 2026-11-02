import "./fitness-period-evidence.css";
import { useState } from 'react';
import type { FitnessTimeseriesDoc } from '@shared/types/fitness-timeseries';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '../../../components/LocalizedLink';
import { Text, Input, Stack, buttonClass } from '../../../theme/components';
import { periodLoadEvidence } from '../periodLoadEvidence';
import PmcHistoryPanel from './PmcHistoryPanel';

export default function PeriodLoadEvidence({ ownerUid, discipline, periods, timeseries }: {
  ownerUid: string; discipline: 'bike' | 'run' | 'swim'; periods: readonly { fromInclusive: number; toExclusive: number }[]; timeseries: FitnessTimeseriesDoc | null;
}) {
  const { t } = useTranslation('fitness');
  const location = useLocation();
  return <section className="fitness-period-load">
    <Text as="h3" variant="subtitle">{t('periodLoad.title')}</Text>
    <Text as="p" variant="caption" tone="secondary">{t('periodLoad.basis')}</Text>
    <div className="fitness-period-load-grid">{periods.map((period, index) => {
      const evidence = periodLoadEvidence(timeseries?.discipline === discipline ? timeseries : null, period.fromInclusive, period.toExclusive);
      return <section className="fitness-period-summary" key={`${period.fromInclusive}:${period.toExclusive}`}>
        <Text as="h4" variant="subtitle">{t('periodCurve.period', { n: index + 1 })}</Text>
        <Text as="p" variant="caption" tone="secondary">{evidence.start} – {evidence.end}</Text>
        <Text as="p">{t('periodLoad.total', { value: evidence.total == null ? '—' : evidence.total.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}</Text>
        {evidence.observedTotal != null && <Text as="p">{t('periodLoad.completed', { start: evidence.start, end: evidence.observedEnd, value: evidence.observedTotal.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}</Text>}
        {evidence.reason && <Text as="p" role="status" tone="secondary">{t(`periodLoad.${evidence.reason}`)}</Text>}
        {evidence.asOf != null && <Text as="p" variant="caption">{t('periodLoad.asOf', { date: new Date(evidence.asOf).toLocaleString(undefined, { timeZone: 'Asia/Seoul' }) })}</Text>}
        {evidence.observedEnd && <Text as="p" variant="caption">{t('periodLoad.pmcBounds', { start: evidence.start, end: evidence.observedEnd })}</Text>}
        <Text as="p">{(['ctl', 'atl', 'tsb'] as const).map(metric => `${metric.toUpperCase()} ${evidence.before?.[metric]?.toFixed(1) ?? '—'} → ${evidence.after?.[metric]?.toFixed(1) ?? '—'}`).join(' · ')}</Text>
        {evidence.points.length > 0 && <details><summary>{t('periodLoad.trend')}</summary><PmcHistoryPanel points={evidence.points} today={evidence.observedEnd ?? evidence.end} canonical controlledRange="all" rangeChoices={['all']} controlledMode="trend" hideModeControls /></details>}
        <PeriodLogLink key={`${evidence.start}:${evidence.end}`} start={evidence.start} end={evidence.end} discipline={discipline} returnTo={{ uid: ownerUid, pathname: location.pathname, search: location.search, hash: location.hash }} />
      </section>;
    })}</div>
  </section>;
}

function PeriodLogLink({ start, end, discipline, returnTo }: { start: string; end: string; discipline: string; returnTo: { uid: string; pathname: string; search: string; hash: string } }) {
  const { t } = useTranslation('fitness');
  const [date, setDate] = useState(start);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= start && date <= end;
  return <Stack gap="var(--space-2)"><label className="fitness-period-log-date">{t('periodLoad.logDate')}<Input type="date" min={start} max={end} value={date} onChange={event => setDate(event.target.value)} /></label>{valid && <LocalizedLink className={buttonClass({ variant: 'ghost', size: 'sm' })} to={`/athlete/me/activities?sport=${discipline}&date=${date}&day=${date}&detail=record-day`} state={{ fitnessPeriodReturn: returnTo }}>{t('periodLoad.log')}</LocalizedLink>}</Stack>;
}
