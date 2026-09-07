import type { FitnessPoint } from '../../utils/fitnessMetrics'
import type { FitnessTimeseriesDoc } from '../../../shared/types/fitness-timeseries'

export type PmcRange = 30 | 90 | 180 | 360 | '3y' | 'all'
export type PmcUnit = 'day' | 'week' | 'month'

/** snapshot은 계산 시점에 저장된 부하이며 활동 수집 완료를 뜻하지 않는다. */
export interface PmcHistoryPoint extends FitnessPoint {
  loadStatus?: 'snapshot' | 'unconfirmed'
  calculationStatus?: 'server' | 'derived' | 'estimated'
}

/** 검증된 정본만 전달한다. 빈 문서/범위 밖/누락 날짜는 휴식의 증거가 아니다. */
export function describePmcHistory(
  points: readonly FitnessPoint[], sources: readonly (FitnessTimeseriesDoc | null)[],
): PmcHistoryPoint[] {
  const evidence = sources.map(source => ({
    dates: new Set(source?.points.map(point => point.date)),
    computedDate: source && Number.isFinite(source.computedAt)
      && Number.isFinite(new Date(source.computedAt).getTime())
      ? new Date(source.computedAt).toISOString().slice(0, 10) : null,
  }))
  return points.map(point => {
    const exact = evidence.length > 0 && evidence.every(source => source.dates.has(point.date))
    return {
      ...point,
      loadStatus: exact && evidence.every(source => source.computedDate !== null && source.computedDate >= point.date)
        ? 'snapshot' : 'unconfirmed',
      calculationStatus: exact ? sources.length > 1 ? 'derived' : 'server' : 'estimated',
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
  loadStatus: 'snapshot' | 'unconfirmed'
  calculationStatus: 'server' | 'derived' | 'estimated' | 'missing'
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
      || !metrics.every(metric => Number.isFinite(point[metric]))) continue
    if (conflictingDates.has(point.date)) continue
    const previous = byDate.get(point.date)
    // 정본을 결정할 근거가 없는 충돌 날짜는 임의 선택하지 않고 누락으로 남긴다.
    if (previous && metrics.some(metric => point[metric] !== previous[metric])) {
      byDate.delete(point.date)
      conflictingDates.add(point.date)
    } else if (previous) {
      byDate.set(point.date, {
        ...previous,
        loadStatus: previous.loadStatus === 'snapshot' && point.loadStatus === 'snapshot' ? 'snapshot' : 'unconfirmed',
        calculationStatus: !previous.calculationStatus || !point.calculationStatus
          || previous.calculationStatus === 'estimated' || point.calculationStatus === 'estimated' ? 'estimated'
          : previous.calculationStatus === 'derived' || point.calculationStatus === 'derived' ? 'derived' : 'server',
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
    const loadSnapshotDays = observed.filter(point => point.loadStatus === 'snapshot').length
    const mean = (metric: 'ctl' | 'atl' | 'tsb') => observed.length
      ? observed.reduce((sum, point) => sum + point[metric], 0) / observed.length : null
    buckets.push({
      key, startDate: start, endDate: end, calendarStartDate: key, calendarEndDate,
      ctl: mean('ctl'), atl: mean('atl'), tsb: mean('tsb'),
      totalLoad: observed.length ? observed.reduce((sum, point) => sum + point.dailyLoad, 0) : null,
      observedDays: observed.length, expectedDays,
      partial: start !== key || end !== calendarEndDate || observed.length < expectedDays,
      loadSnapshotDays,
      loadStatus: loadSnapshotDays === expectedDays ? 'snapshot' : 'unconfirmed',
      calculationStatus: !observed.length ? 'missing'
        : observed.some(point => !point.calculationStatus || point.calculationStatus === 'estimated') ? 'estimated'
          : observed.some(point => point.calculationStatus === 'derived') ? 'derived' : 'server',
    })
  }
  return buckets
}

function availableYears(points: FitnessPoint[], today: string): number[] {
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
            loadStatus: bucket.loadSnapshotDays === expectedDays ? 'snapshot' as const : 'unconfirmed' as const,
            partial: true }
        }
        return bucket
      }),
    }))
  return { availableYears: availableYears(normalized, today), series }
}
