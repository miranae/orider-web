import { useTranslation } from 'react-i18next';
import { planDayKey } from '@shared/training/planDate';
import type { PlanWeek } from '@shared/types/goal';
import { Text } from '../../../theme/components';
import type { PlanCalendarLoads } from './PlanDayLoadComparison';
/** Weekly fulfillment describes the week once, without rewriting any day's execution. */
export default function PlanWeekLoadSummary({ week, dayLoads, state }: { week: PlanWeek; dayLoads: PlanCalendarLoads['dayLoads']; state: PlanCalendarLoads['loadState'] }) {
  const { t, i18n } = useTranslation('training');
  const fulfillment = state === 'ready' ? week.days.map(day => dayLoads?.get(planDayKey(day.date))?.fulfilledWeek).find(value => value?.weekNumber === week.weekNumber) : undefined;
  if (!fulfillment) return null;
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value);
  return <div className="plan-week-load-summary" role="group" aria-label={t('loadComparison.weekEvidence', { week: week.weekNumber })}>
    <Text variant="bodySmall" weight={600}>{t('loadComparison.fulfillment.week', { week: week.weekNumber })}{fulfillment.estimated ? ` · ${t('page.tssEstimated')}` : ''}</Text>
    <Text variant="caption" tone="secondary">{t('loadComparison.fulfillment.weekBasis', { actual: number(fulfillment.actualTss), planned: number(fulfillment.plannedTss) })}</Text>
  </div>;
}
