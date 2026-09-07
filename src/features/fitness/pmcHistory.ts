import type { FitnessPoint } from '../../utils/fitnessMetrics'
import type { FitnessTimeseriesDoc } from '../../../shared/types/fitness-timeseries'

export type PmcRange = 30 | 90 | 180 | 360 | '3y' | 'all'
export type PmcUnit = 'day' | 'week' | 'month'

/** snapshot은 계산 시점에 저장된 부하이며 활동 수집 완료를 뜻하지 않는다. */
export interface PmcHistoryPoint extends Omit<FitnessPoint, 'ctl' | 'atl' | 'tsb'> {
  ctl: number | null
  atl: number | null
  tsb: number | null
  loadStatus?: 'final' | 'snapshot' | 'unconfirmed'
  calculationStatus?: 'server' | 'derived' | 'estimated' | 'pending' | 'failed' | 'stale'
}
const calculationPriority: NonNullable<PmcHistoryPoint['calculationStatus']>[] = ['failed', 'stale', 'pending', 'estimated', 'derived', 'server']

export function hasFitnessLoadLifecycle(source: FitnessTimeseriesDoc | null): boolean {
  const load = source?.loadSnapshot
  const pmc = source?.pmc
  return !!load && !!pmc && Number.isInteger(load.inputRevision) && load.inputRevision > 0
    && Number.isFinite(load.asOf) && typeof load.inputDigest === 'string'
    && validDate(load.coverageStartDate) && validDate(load.coverageEndDate) && load.coverageStartDate <= load.coverageEndDate
    && validReadTime(load.inputReadTime)
    && Array.isArray(load.points) && load.points.every(point => point !== null && typeof point === 'object')
    && new Set(load.points.map(point => point.date)).size === load.points.length
    && load.points.every(point => validDate(point.date) && point.date >= load.coverageStartDate && point.date <= load.coverageEndDate
      && Number.isFinite(point.dailyLoad) && point.dailyLoad >= 0
      && (point.status === 'final' || point.status === 'unknown'))
    && ['pending', 'processed', 'failed'].includes(pmc.status) && Number.isFinite(pmc.deadlineAt)
    && pmc.inputRevision === load.inputRevision && typeof pmc.attemptId === 'string'
    && (pmc.processedInputRevision === null || Number.isInteger(pmc.processedInputRevision))
}

function validReadTime(value: { seconds: number; nanoseconds: number } | undefined): boolean {
  return !!value && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds) && value.nanoseconds >= 0 && value.nanoseconds < 1e9
}

function invalidated(source: FitnessTimeseriesDoc | null): boolean {
  const dirty = source?.inputInvalidatedAt
  if (!dirty) return false
  const read = source?.loadSnapshot?.inputReadTime
  return !validReadTime(dirty) || !validReadTime(read) || dirty.seconds > read!.seconds
    || dirty.seconds === read!.seconds && dirty.nanoseconds > read!.nanoseconds
}

/** 검증된 정본만 전달한다. 빈 문서/범위 밖/누락 날짜는 휴식의 증거가 아니다. */
export function describePmcHistory(
  points: readonly FitnessPoint[], sources: readonly (FitnessTimeseriesDoc | null)[], now = Date.now(),
): PmcHistoryPoint[] {
  const evidence = sources.map(source => {
    const saved = new Map((Array.isArray(source?.points) ? source.points : [])
      .filter(point => point && validDate(point.date) && metrics.every(metric => Number.isFinite(point[metric])))
      .map(point => [point.date, point]))
    return {
    dates: new Set(saved.keys()),
    saved,
    source,
    invalidated: invalidated(source),
    invalidLifecycle: !!(source?.loadSnapshot || source?.pmc) && !hasFitnessLoadLifecycle(source),
    load: hasFitnessLoadLifecycle(source) ? new Map(source!.loadSnapshot!.points.map(point => [point.date, point])) : null,
    computedDate: source && Number.isFinite(source.computedAt)
      && Number.isFinite(new Date(source.computedAt).getTime())
      ? new Date(source.computedAt).toISOString().slice(0, 10) : null,
  }})
  const hasLifecycle = evidence.some(entry => entry.load)
  const byDate = new Map<string, PmcHistoryPoint>(points
    .filter(point => !hasLifecycle || evidence.some(entry => entry.dates.has(point.date)))
    .map(point => [point.date, point]))
  const loadDates = evidence.flatMap(entry => entry.load ? [...entry.load.values()].filter(point => point.dailyLoad > 0 || point.status === 'unknown').map(point => point.date) : [])
  const firstDate = [...byDate.keys(), ...loadDates].sort()[0]
    ?? evidence.flatMap(entry => entry.source?.loadSnapshot?.coverageEndDate ?? []).sort().slice(-1)[0]
  for (const entry of evidence) {
    if (!entry.load || !firstDate) continue
    for (const point of entry.load.values()) if (point.date >= firstDate && !byDate.has(point.date)) {
      byDate.set(point.date, { date: point.date, dailyLoad: 0, ctl: null, atl: null, tsb: null })
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(point => {
    const exact = evidence.length > 0 && evidence.every(entry => entry.dates.has(point.date))
    const completePmc = evidence.length > 0 && evidence.every(entry => entry.dates.has(point.date)
      || entry.load?.get(point.date)?.status === 'final' && entry.load.get(point.date)?.dailyLoad === 0
        && entry.source?.points?.length === 0 && entry.source.pmc?.status === 'processed'
        && entry.source.pmc.processedInputRevision === entry.source.loadSnapshot?.inputRevision)
    const covered = evidence.map(entry => entry.load?.get(point.date))
    const lifecycle = evidence.some(entry => entry.load)
    const dirty = evidence.some(entry => entry.invalidated)
    const malformed = evidence.some(entry => entry.invalidLifecycle)
    const allCovered = covered.length > 0 && covered.every(Boolean)
    const failed = evidence.some(entry => entry.load && entry.source?.pmc?.status === 'failed')
    const pending = evidence.some(entry => entry.load && (entry.source?.pmc?.status !== 'processed'
      || entry.source.pmc.processedInputRevision !== entry.source.loadSnapshot!.inputRevision))
    const expired = evidence.some(entry => entry.load && entry.source?.pmc?.status === 'pending' && now > entry.source.pmc.deadlineAt)
    const hasSavedPmc = evidence.some(entry => entry.dates.has(point.date))
    return {
      ...point,
      ...((lifecycle || dirty) && !hasSavedPmc ? completePmc && !pending && !failed && !dirty
        ? { ctl: 0, atl: 0, tsb: 0 } : { ctl: null, atl: null, tsb: null } : {}),
      dailyLoad: lifecycle ? covered.reduce((sum, load, index) => sum + (load?.dailyLoad
        ?? evidence[index]?.saved.get(point.date)?.dailyLoad ?? 0), 0) : point.dailyLoad,
      loadStatus: dirty || malformed ? 'unconfirmed' : lifecycle ? allCovered && covered.every(load => load?.status === 'final') ? 'final' : 'unconfirmed'
        : exact && evidence.every(source => source.computedDate !== null && source.computedDate >= point.date) ? 'snapshot' : 'unconfirmed',
      calculationStatus: dirty ? 'pending' : malformed ? 'estimated' : failed ? 'failed' : expired ? 'stale' : pending ? 'pending'
        : completePmc ? sources.length > 1 ? 'derived' : 'server' : 'estimated',
    }
  })
}

export interface PmcBucket {
  key: string
  startDate: string
  endDate: string
  calendarStartDate: string
  calendarEndDate: string
  ctl: number | null
  atl: number | null
  tsb: number | null
  totalLoad: number | null
  observedDays: number
  expectedDays: number
  partial: boolean
  loadSnapshotDays: number
  loadFinalDays: number
  loadStatus: 'final' | 'snapshot' | 'unconfirmed'
  calculationStatus: NonNullable<PmcHistoryPoint['calculationStatus']> | 'missing'
}

const DAY = 86_400_000
const metrics = ['ctl', 'atl', 'tsb', 'dailyLoad'] as const
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`)
const format = (date: number) => new Date(date).toISOString().slice(0, 10)
const shiftDay = (date: string, days: number) => format(stamp(date) + days * DAY)
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(stamp(date)) && format(stamp(date)) === date

function requireToday(today: string) {
  if (!validDate(today)) throw new RangeError('today must be a valid YYYY-MM-DD date')
}

function normalize(points: readonly PmcHistoryPoint[], today: string): PmcHistoryPoint[] {
  const byDate = new Map<string, PmcHistoryPoint>()
  const conflictingDates = new Set<string>()
  for (const point of points) {
    if (!validDate(point.date) || point.date > today
      || !Number.isFinite(point.dailyLoad)
      || !(['ctl', 'atl', 'tsb'] as const).every(metric => point[metric] === null || Number.isFinite(point[metric]))) continue
    if (conflictingDates.has(point.date)) continue
    const previous = byDate.get(point.date)
    // 정본을 결정할 근거가 없는 충돌 날짜는 임의 선택하지 않고 누락으로 남긴다.
    if (previous && metrics.some(metric => point[metric] !== previous[metric])) {
      byDate.delete(point.date)
      conflictingDates.add(point.date)
    } else if (previous) {
      byDate.set(point.date, {
        ...previous,
        loadStatus: previous.loadStatus === 'final' && point.loadStatus === 'final' ? 'final'
          : [previous.loadStatus, point.loadStatus].every(status => status === 'snapshot' || status === 'final') ? 'snapshot' : 'unconfirmed',
        calculationStatus: calculationPriority.find(status => [previous.calculationStatus ?? 'estimated', point.calculationStatus ?? 'estimated'].includes(status)),
      })
    } else {
      byDate.set(point.date, point)
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function periodStart(date: string, unit: PmcUnit): string {
  if (unit === 'month') return `${date.slice(0, 7)}-01`
  if (unit === 'week') return shiftDay(date, -((new Date(stamp(date)).getUTCDay() + 6) % 7))
  return date
}

function nextPeriod(date: string, unit: PmcUnit): string {
  if (unit !== 'month') return shiftDay(date, unit === 'week' ? 7 : 1)
  const next = new Date(stamp(date))
  next.setUTCMonth(next.getUTCMonth() + 1)
  return format(next.getTime())
}

function bucketize(points: PmcHistoryPoint[], unit: PmcUnit, startDate: string, endDate: string): PmcBucket[] {
  const grouped = new Map<string, PmcHistoryPoint[]>()
  for (const point of points) {
    if (point.date < startDate || point.date > endDate) continue
    const key = periodStart(point.date, unit)
    const group = grouped.get(key) ?? []
    group.push(point)
    grouped.set(key, group)
  }
  const buckets: PmcBucket[] = []
  for (let key = periodStart(startDate, unit); key <= endDate; key = nextPeriod(key, unit)) {
    const calendarEndDate = shiftDay(nextPeriod(key, unit), -1)
    const start = key < startDate ? startDate : key
    const end = calendarEndDate > endDate ? endDate : calendarEndDate
    const observed = grouped.get(key) ?? []
    const expectedDays = Math.round((stamp(end) - stamp(start)) / DAY) + 1
    const loadSnapshotDays = observed.filter(point => point.loadStatus === 'snapshot' || point.loadStatus === 'final').length
    const loadFinalDays = observed.filter(point => point.loadStatus === 'final').length
    const calculated = observed.filter(point => point.ctl !== null && point.atl !== null && point.tsb !== null)
    const mean = (metric: 'ctl' | 'atl' | 'tsb') => calculated.length
      ? calculated.reduce((sum, point) => sum + point[metric]!, 0) / calculated.length : null
    buckets.push({
      key, startDate: start, endDate: end, calendarStartDate: key, calendarEndDate,
      ctl: mean('ctl'), atl: mean('atl'), tsb: mean('tsb'),
      totalLoad: observed.length ? observed.reduce((sum, point) => sum + point.dailyLoad, 0) : null,
      observedDays: calculated.length, expectedDays,
      partial: start !== key || end !== calendarEndDate || calculated.length < expectedDays,
      loadSnapshotDays,
      loadFinalDays,
      loadStatus: loadFinalDays === expectedDays ? 'final' : loadSnapshotDays === expectedDays ? 'snapshot' : 'unconfirmed',
      calculationStatus: !observed.length ? 'missing'
        : calculationPriority.find(status => observed.some(point => (point.calculationStatus ?? 'estimated') === status)) ?? 'estimated',
    })
  }
  return buckets
}

function availableYears(points: PmcHistoryPoint[], today: string): number[] {
  return [...new Set([Number(today.slice(0, 4)), ...points.map(point => Number(point.date.slice(0, 4)))])]
    .sort((a, b) => b - a)
}

export function getPmcUnit(range: PmcRange): PmcUnit {
  return range === 30 || range === 90 ? 'day' : range === 180 || range === 360 ? 'week' : 'month'
}

/** 정본 일별 EMA 값은 변경하지 않고 표시 구간만 요약한다. 누락은 휴식(0)이 아니다. */
export function buildPmcHistory(points: readonly PmcHistoryPoint[], range: PmcRange, today: string) {
  requireToday(today)
  const normalized = normalize(points, today)
  const unit = getPmcUnit(range)
  let startDate: string
  if (range === 'all') startDate = normalized[0]?.date ?? today
  else if (range === '3y') {
    const start = new Date(stamp(`${today.slice(0, 7)}-01`))
    start.setUTCMonth(start.getUTCMonth() - 35)
    startDate = format(start.getTime())
  } else startDate = shiftDay(today, 1 - range)
  return {
    unit, startDate, endDate: today,
    buckets: bucketize(normalized, unit, startDate, today),
    availableYears: availableYears(normalized, today),
  }
}

/** 연도별 동일 월 비교. 미래 월과 기록 없는 월도 빈 슬롯으로 보존한다. */
export function buildPmcYearComparison(points: readonly PmcHistoryPoint[], years: readonly number[], today: string) {
  requireToday(today)
  const normalized = normalize(points, today)
  const series = [...new Set(years)].filter(year => Number.isInteger(year) && year >= 1000 && year <= 9999)
    .map(year => ({
      year,
      buckets: bucketize(normalized, 'month', `${year}-01-01`, `${year}-12-31`).map(bucket => {
        if (bucket.startDate <= today && bucket.endDate > today) {
          const expectedDays = Math.round((stamp(today) - stamp(bucket.startDate)) / DAY) + 1
          return { ...bucket, endDate: today, expectedDays,
            loadStatus: bucket.loadFinalDays === expectedDays ? 'final' as const
              : bucket.loadSnapshotDays === expectedDays ? 'snapshot' as const : 'unconfirmed' as const,
            partial: true }
        }
        return bucket
      }),
    }))
  return { availableYears: availableYears(normalized, today), series }
}
