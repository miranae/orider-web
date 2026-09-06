import type { FitnessPoint } from '../../utils/fitnessMetrics'

export type PmcRange = 30 | 90 | 180 | 360 | '3y' | 'all'
export type PmcUnit = 'day' | 'week' | 'month'

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

function normalize(points: readonly FitnessPoint[], today: string): FitnessPoint[] {
  const byDate = new Map<string, FitnessPoint>()
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
    } else if (!previous) {
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

function bucketize(points: FitnessPoint[], unit: PmcUnit, startDate: string, endDate: string): PmcBucket[] {
  const grouped = new Map<string, FitnessPoint[]>()
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
    const mean = (metric: 'ctl' | 'atl' | 'tsb') => observed.length
      ? observed.reduce((sum, point) => sum + point[metric], 0) / observed.length : null
    buckets.push({
      key, startDate: start, endDate: end, calendarStartDate: key, calendarEndDate,
      ctl: mean('ctl'), atl: mean('atl'), tsb: mean('tsb'),
      totalLoad: observed.length ? observed.reduce((sum, point) => sum + point.dailyLoad, 0) : null,
      observedDays: observed.length, expectedDays,
      partial: start !== key || end !== calendarEndDate || observed.length < expectedDays,
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
export function buildPmcHistory(points: readonly FitnessPoint[], range: PmcRange, today: string) {
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
export function buildPmcYearComparison(points: readonly FitnessPoint[], years: readonly number[], today: string) {
  requireToday(today)
  const normalized = normalize(points, today)
  const series = [...new Set(years)].filter(year => Number.isInteger(year) && year >= 1000 && year <= 9999)
    .map(year => ({
      year,
      buckets: bucketize(normalized, 'month', `${year}-01-01`, `${year}-12-31`).map(bucket => {
        if (bucket.startDate <= today && bucket.endDate > today) {
          return { ...bucket, endDate: today,
            expectedDays: Math.round((stamp(today) - stamp(bucket.startDate)) / DAY) + 1,
            partial: true }
        }
        return bucket
      }),
    }))
  return { availableYears: availableYears(normalized, today), series }
}
