import type { FitnessTimeseriesDoc } from '@shared/types/fitness-timeseries';
import { describePmcHistory, hasFitnessLoadLifecycle, isFitnessInputInvalidated, type PmcHistoryPoint } from './pmcHistory';
import { trainingCalendarDate } from '../../services/trainingComparisonCalendar';

const DAY = 86_400_000;
export function periodLoadEvidence(source: FitnessTimeseriesDoc | null, from: number, to: number) {
  const validBounds = Number.isFinite(from) && Number.isFinite(to) && from >= 0 && from < to && to <= 8640000000000000;
  const start = validBounds ? trainingCalendarDate(from) : "—", end = validBounds ? trainingCalendarDate(to - 1) : "—";
  const startMs = Date.parse(`${start}T00:00:00+09:00`);
  const endMs = Date.parse(`${end}T00:00:00+09:00`);
  const empty = { start, end, observedEnd: null as string | null, observedTotal: null as number | null, points: [], total: null, before: null, after: null, asOf: source?.loadSnapshot?.asOf ?? null };
  if (!validBounds) return { ...empty, reason: 'unavailable' as const };
  if (from !== startMs) return { ...empty, reason: 'partialDay' as const };
  const partial = to !== endMs + DAY;
  const observedEnd = partial ? trainingCalendarDate(endMs - DAY) : end;
  const observedTo = partial ? endMs : to;
  if (observedTo <= from) return { ...empty, reason: 'partialDay' as const };
  if (!source || !hasFitnessLoadLifecycle(source)) return { ...empty, reason: 'unavailable' as const };
  if (isFitnessInputInvalidated(source)) return { ...empty, reason: 'incomplete' as const };
  const segments = source.loadSnapshot!.dateKeyBasis?.segments ?? [];
  // Include the preceding day: its closing PMC is the comparison's opening state.
  const relevant = segments.filter((s, i) => (s.fromMs ?? -Infinity) < observedTo && (segments[i + 1]?.fromMs ?? Infinity) > startMs - DAY);
  if (!relevant.length || relevant.some(s => s.tz !== 'Asia/Seoul') || (relevant[0]?.fromMs ?? -Infinity) > startMs - DAY) return { ...empty, reason: 'timezone' as const };
  const history = describePmcHistory(source.points, [source]);
  const byDate = new Map(history.map(point => [point.date, point]));
  // Load coverage can precede the first saved PMC point. Final zero days are
  // observed load evidence, but do not establish an opening CTL/ATL/TSB.
  const savedDates = new Set(source.points.map(point => point.date));
  const points: PmcHistoryPoint[] = source.loadSnapshot!.points
    .filter(point => point.date >= start && point.date <= observedEnd)
    .map(point => {
      const pmc = savedDates.has(point.date) ? byDate.get(point.date) : undefined;
      return { date: point.date, dailyLoad: point.dailyLoad,
        loadStatus: point.status === 'final' ? 'final' : 'unconfirmed',
        ctl: pmc?.ctl ?? null, atl: pmc?.atl ?? null, tsb: pmc?.tsb ?? null,
        calculationStatus: pmc?.calculationStatus ?? 'estimated' };
    });
  const days = (observedTo - startMs) / DAY;
  const valid = points.length === days && new Set(points.map(point => point.date)).size === days && points.every(point => point.loadStatus === 'final' && Number.isFinite(point.dailyLoad) && point.dailyLoad >= 0);
  const processed = (point: typeof history[number] | undefined) => point && savedDates.has(point.date) && point.calculationStatus === 'server' && [point.ctl, point.atl, point.tsb].every(value => value != null && Number.isFinite(value)) ? point : null;
  const total = valid ? points.reduce((sum, point) => sum + point.dailyLoad, 0) : NaN;
  const complete = valid && Number.isFinite(total);
  return { start, end, observedEnd, observedTotal: partial && complete ? total : null, points, total: !partial && complete ? total : null,
    before: processed(byDate.get(trainingCalendarDate(startMs - DAY))), after: processed(byDate.get(observedEnd)), asOf: source.loadSnapshot!.asOf,
    reason: !complete ? 'incomplete' as const : partial ? 'partialDay' as const : null };
}
