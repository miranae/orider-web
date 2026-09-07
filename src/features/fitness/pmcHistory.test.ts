import { describe, expect, it } from 'vitest'
import type { FitnessPoint } from '../../utils/fitnessMetrics'
import { buildPmcHistory, buildPmcYearComparison, describePmcHistory, getPmcUnit, type PmcHistoryPoint } from './pmcHistory'
import type { FitnessTimeseriesDoc } from '../../../shared/types/fitness-timeseries'

const point = (date: string, value = 10): FitnessPoint => ({ date, ctl: value, atl: value * 2, tsb: -value, dailyLoad: value * 3 })
const source = (points: FitnessPoint[], discipline: FitnessTimeseriesDoc['discipline'] = 'bike'): FitnessTimeseriesDoc => ({
  discipline, schemaVersion: 1, computedAt: Date.parse('2026-09-06T12:00:00Z'),
  startDate: points[0]?.date ?? null, endDate: points.at(-1)?.date ?? null, pointCount: points.length, points,
})

describe('PMC 부하 반영과 계산 출처', () => {
  it('서로 다른 종목으로 운동해도 저장된 0 부하와 통합 계산을 정상적으로 구분한다', () => {
    const bike = [point('2026-09-05', 20), point('2026-09-06', 0)]
    const run = [point('2026-09-05', 0), point('2026-09-06', 10)]
    const swim = bike.map(p => ({ ...p, dailyLoad: 0 }))
    const integrated = [point('2026-09-05', 20), point('2026-09-06', 10)]
    expect(describePmcHistory(integrated, [source(bike), source(run, 'run'), source(swim, 'swim')]))
      .toEqual(integrated.map(p => ({ ...p, loadStatus: 'snapshot', calculationStatus: 'derived' })))
  })

  it('문서 종료일 이후, 시작일 이전, 빈 종목과 fallback을 휴식으로 확정하지 않는다', () => {
    const points = [point('2026-09-05'), point('2026-09-06')]
    for (const missing of [source([points[0]]), source([points[1]]), source([]), null]) {
      const described = describePmcHistory(points, [source(points), missing])
      expect(described.some(p => p.loadStatus === 'unconfirmed' && p.calculationStatus === 'estimated')).toBe(true)
    }
    expect(describePmcHistory(points, [null]).every(p => p.loadStatus === 'unconfirmed')).toBe(true)
    expect(describePmcHistory(points, [{ ...source(points), computedAt: NaN }])[0])
      .toMatchObject({ loadStatus: 'unconfirmed', calculationStatus: 'server' })
  })

  it('같은 날 누적 부하가 바뀌면 최신 스냅샷 값을 그대로 사용한다', () => {
    const morning = { ...point('2026-09-06'), dailyLoad: 40 }
    const evening = { ...morning, ctl: 11, atl: 22, tsb: -11, dailyLoad: 70 }
    expect(describePmcHistory([morning], [source([morning])])[0].dailyLoad).toBe(40)
    const latest = describePmcHistory([evening], [source([evening])])
    expect(buildPmcHistory(latest, 30, evening.date).buckets.at(-1))
      .toMatchObject({ totalLoad: 70, ctl: 11, atl: 22, loadStatus: 'snapshot', calculationStatus: 'server' })
  })

  it('독립 상태 입력 계약을 지원하고 주·월의 누락은 부하 미확인으로 남긴다', () => {
    // 수동 상태 입력 계약 테스트이며 현재 서버의 처리 대기 상태 검증은 아니다.
    const known: PmcHistoryPoint = { ...point('2026-09-01', 0), loadStatus: 'snapshot', calculationStatus: 'estimated' }
    expect(buildPmcHistory([known], 30, known.date).buckets.at(-1))
      .toMatchObject({ totalLoad: 0, loadStatus: 'snapshot', calculationStatus: 'estimated', loadSnapshotDays: 1 })
    for (const range of [180, 'all'] as const) {
      expect(buildPmcHistory([known], range, '2026-09-03').buckets.at(-1))
        .toMatchObject({ loadStatus: 'unconfirmed', calculationStatus: 'estimated', partial: true })
    }
    expect(buildPmcYearComparison([known], [2026], known.date).series[0].buckets[8])
      .toMatchObject({ expectedDays: 1, loadStatus: 'snapshot', calculationStatus: 'estimated' })
  })

  it('같은 값의 출처가 충돌하면 순서에 관계없이 수치는 보존하고 보수적 상태를 합친다', () => {
    const known: PmcHistoryPoint = { ...point('2026-09-06'), loadStatus: 'snapshot', calculationStatus: 'server' }
    const unknown: PmcHistoryPoint = { ...known, loadStatus: 'unconfirmed', calculationStatus: 'estimated' }
    const result = buildPmcHistory([known, unknown], 30, known.date)
    expect(result).toEqual(buildPmcHistory([unknown, known], 30, known.date))
    expect(result.buckets.at(-1)).toMatchObject({ ctl: known.ctl, totalLoad: known.dailyLoad,
      observedDays: 1, loadStatus: 'unconfirmed', calculationStatus: 'estimated' })
  })
})

describe('PMC 표시 집계', () => {
  it('일/주/월 단위를 선택한다', () => {
    expect([30, 90, 180, 360, '3y', 'all'].map(range => getPmcUnit(range as 30 | 90 | 180 | 360 | '3y' | 'all')))
      .toEqual(['day', 'day', 'week', 'week', 'month', 'month'])
  })

  it('일별 기간은 오늘 포함 30/90일이며 입력 값을 재계산하지 않는다', () => {
    const points = [point('2026-09-06', 12)]
    for (const range of [30, 90] as const) {
      const history = buildPmcHistory(points, range, '2026-09-06')
      expect(history.buckets).toHaveLength(range)
      expect(history.buckets.at(-1)).toMatchObject({ ctl: 12, atl: 24, tsb: -12, totalLoad: 36, partial: false })
      expect(history.buckets[0]).toMatchObject({ ctl: null, totalLoad: null, observedDays: 0, expectedDays: 1 })
    }
  })

  it('주 경계는 연도가 바뀌어도 ISO 월요일이며 윈도우 경계는 부분 집계한다', () => {
    const history = buildPmcHistory([point('2024-12-30'), point('2025-01-01', 20)], 180, '2025-01-02')
    expect(history.buckets.at(-1)).toMatchObject({
      key: '2024-12-30', calendarEndDate: '2025-01-05', endDate: '2025-01-02',
      ctl: 15, atl: 30, tsb: -15, totalLoad: 90, observedDays: 2, expectedDays: 4, partial: true,
    })
    expect(history.buckets[0].startDate).toBe(history.startDate)
    expect(history.buckets.reduce((sum, bucket) => sum + bucket.expectedDays, 0)).toBe(180)
  })

  it('3년은 현재 월 포함 36개월이며 윤년 2월의 29일을 센다', () => {
    const history = buildPmcHistory([point('2024-02-29')], '3y', '2026-09-06')
    expect(history.startDate).toBe('2023-10-01')
    expect(history.buckets).toHaveLength(36)
    expect(history.buckets.find(bucket => bucket.key === '2024-02-01'))
      .toMatchObject({ expectedDays: 29, observedDays: 1, partial: true })
    expect(history.buckets.at(-1)).toMatchObject({ expectedDays: 6, partial: true })
  })

  it('전체 범위는 3년을 넘는 이력과 처음 부분 월을 보존한다', () => {
    const history = buildPmcHistory([point('2020-01-15'), point('2026-09-06')], 'all', '2026-09-06')
    expect(history.buckets).toHaveLength(81)
    expect(history.buckets[0]).toMatchObject({ startDate: '2020-01-15', expectedDays: 17, partial: true })
    expect(history.availableYears).toEqual([2026, 2020])
  })

  it('실제 0은 유효하며 독립 TSB 평균과 부하 합계를 유지한다', () => {
    const points = [point('2026-08-01', 0), { ...point('2026-08-02', 10), tsb: 99 }]
    const bucket = buildPmcHistory(points, 'all', '2026-08-02').buckets[0]
    expect(bucket).toMatchObject({ ctl: 5, atl: 10, tsb: 49.5, totalLoad: 30, observedDays: 2 })
    expect(buildPmcHistory([point('2026-08-01', 0)], 30, '2026-08-01').buckets.at(-1))
      .toMatchObject({ ctl: 0, totalLoad: 0, partial: false })
  })

  it('누락 월은 0으로 채우지 않고 모든 메트릭을 null로 남긴다', () => {
    const history = buildPmcHistory([point('2026-01-01'), point('2026-03-01')], 'all', '2026-03-01')
    expect(history.buckets[1]).toMatchObject({ ctl: null, atl: null, tsb: null, totalLoad: null, observedDays: 0 })
  })

  it('정렬/중복/유효하지 않은 날짜와 값/미래 날짜를 결정적으로 처리하고 입력은 보존한다', () => {
    const points = [point('2026-09-02'), point('2026-09-01', 20), point('2026-09-01'),
      point('2026-02-30'), point('not-date'), point('2026-09-03', Infinity),
      { ...point('2026-09-04'), tsb: NaN }, point('2026-09-07')]
    const original = structuredClone(points)
    const history = buildPmcHistory(points, 'all', '2026-09-06')
    expect(history).toEqual(buildPmcHistory([...points].reverse(), 'all', '2026-09-06'))
    expect(history.buckets[0]).toMatchObject({ observedDays: 1, totalLoad: 30, ctl: 10 })
    expect(points).toEqual(original)
  })

  it('동일한 중복은 한 번만 세고 충돌 뒤의 중복이 제외한 날짜를 복원하지 않는다', () => {
    const points = [point('2026-09-01'), point('2026-09-01'), point('2026-09-02'),
      point('2026-09-02', 20), point('2026-09-02'), point('2026-09-02', 20)]
    const history = buildPmcHistory(points, 30, '2026-09-02')
    expect(history).toEqual(buildPmcHistory([...points].reverse(), 30, '2026-09-02'))
    expect(history.buckets.at(-2)).toMatchObject({ ctl: 10, totalLoad: 30, observedDays: 1 })
    expect(history.buckets.at(-1)).toMatchObject({ ctl: null, totalLoad: null, observedDays: 0, partial: true })
  })

  it('표시 단위가 달라도 같은 관측 이력의 부하 합계는 동일하다', () => {
    const points = Array.from({ length: 20 }, (_, index) => point(`2026-08-${String(index + 1).padStart(2, '0')}`, index))
    for (const range of [30, 90, 180, 360, '3y', 'all'] as const) {
      const history = buildPmcHistory(points, range, '2026-08-20')
      expect(history.buckets.reduce((sum, bucket) => sum + (bucket.totalLoad ?? 0), 0)).toBe(570)
    }
  })

  it('빈 이력도 현재 연도와 명시적 빈 구간을 반환한다', () => {
    expect(buildPmcHistory([], 'all', '2026-09-06')).toMatchObject({ availableYears: [2026], startDate: '2026-09-06' })
    expect(() => buildPmcHistory([], 30, '2026-02-30')).toThrow(RangeError)
  })
})

describe('PMC 연도별 월 비교', () => {
  it('각 연도의 12개월 슬롯, 윤년, 현재 부분 월, 미래 null을 유지한다', () => {
    const comparison = buildPmcYearComparison([point('2024-02-29'), point('2026-09-01'), point('2026-10-01')], [2024, 2026], '2026-09-06')
    expect(comparison.availableYears).toEqual([2026, 2024])
    expect(comparison.series.map(series => series.buckets.length)).toEqual([12, 12])
    expect(comparison.series[0].buckets[1]).toMatchObject({ expectedDays: 29, observedDays: 1 })
    expect(comparison.series[1].buckets[8]).toMatchObject({ endDate: '2026-09-06', expectedDays: 6, observedDays: 1, partial: true })
    expect(comparison.series[1].buckets[9]).toMatchObject({ ctl: null, totalLoad: null, observedDays: 0 })
  })

  it('완전한 월과 불완전한 월을 구분하며 중복 연도는 제거한다', () => {
    const points = Array.from({ length: 28 }, (_, index) => point(`2025-02-${String(index + 1).padStart(2, '0')}`))
    const comparison = buildPmcYearComparison(points, [2025, 2025, NaN], '2026-09-06')
    expect(comparison.series).toHaveLength(1)
    expect(comparison.series[0].buckets[1]).toMatchObject({ partial: false, expectedDays: 28, observedDays: 28, totalLoad: 840 })
    expect(comparison.series[0].buckets[0].partial).toBe(true)
  })
})
