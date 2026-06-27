import { describe, it, expect } from 'vitest'
import {
  estimateActivityLoad,
  aggregateDailyLoad,
  calculateFitness,
  type DailyLoad,
} from '../fitnessMetrics'

describe('estimateActivityLoad', () => {
  it('uses TSS when watts stream and ftp available', () => {
    const load = estimateActivityLoad({
      watts: Array(3600).fill(200),
      ftp: 200,
      relativeEffort: null,
      ridingTimeMillis: 3600000,
    })
    expect(load.value).toBeCloseTo(100, -1)
    expect(load.source).toBe('tss')
  })

  it('falls back to TRIMP when no watts', () => {
    const load = estimateActivityLoad({
      watts: undefined,
      ftp: undefined,
      relativeEffort: 120,
      ridingTimeMillis: 3600000,
    })
    expect(load.value).toBe(120)
    expect(load.source).toBe('trimp')
  })

  it('falls back to time estimate when no watts or TRIMP', () => {
    const load = estimateActivityLoad({
      watts: undefined,
      ftp: undefined,
      relativeEffort: null,
      ridingTimeMillis: 7200000,  // 2h
    })
    // discipline 미지정 → DEFAULT_TIME_FACTOR 50 → 2h × 50 = 100
    expect(load.value).toBe(100)
    expect(load.source).toBe('time')
  })

  it('uses precomputedTss as highest priority when present', () => {
    const load = estimateActivityLoad({
      precomputedTss: 145,
      watts: [200, 210, 220],
      ftp: 250,
      relativeEffort: 120,
      ridingTimeMillis: 7200000,
    })
    expect(load.value).toBe(145)
    expect(load.source).toBe('tss')
  })

  it('falls through to next when precomputedTss exceeds sanity max (600)', () => {
    // virtualPower 단위 버그로 폭주값(예: 16695)이 저장된 경우 무시하고 다음 폴백 사용
    const load = estimateActivityLoad({
      precomputedTss: 16695,
      relativeEffort: 120,
      ridingTimeMillis: 3600000,
    })
    expect(load.value).toBe(120)
    expect(load.source).toBe('trimp')
  })

  it('falls through to next when precomputedTss is null/zero/non-finite', () => {
    for (const t of [null, 0, NaN, undefined]) {
      const load = estimateActivityLoad({
        precomputedTss: t as number | null | undefined,
        relativeEffort: 120,
        ridingTimeMillis: 3600000,
      })
      expect(load.source).toBe('trimp')
      expect(load.value).toBe(120)
    }
  })

  it('returns 0 for zero duration without other data', () => {
    const load = estimateActivityLoad({
      watts: undefined,
      ftp: undefined,
      relativeEffort: null,
      ridingTimeMillis: 0,
    })
    expect(load.value).toBe(0)
  })
})

describe('aggregateDailyLoad', () => {
  it('sums multiple activities on the same day', () => {
    const activities = [
      { date: '2026-03-01', load: 50, source: 'tss' as const },
      { date: '2026-03-01', load: 30, source: 'trimp' as const },
      { date: '2026-03-02', load: 80, source: 'tss' as const },
    ]
    const daily = aggregateDailyLoad(activities, '2026-03-01', '2026-03-03')
    expect(daily).toHaveLength(3)
    expect(daily[0]!.totalLoad).toBe(80)
    expect(daily[1]!.totalLoad).toBe(80)
    expect(daily[2]!.totalLoad).toBe(0)
  })

  it('fills gaps with zero-load days', () => {
    const activities = [
      { date: '2026-01-01', load: 100, source: 'tss' as const },
      { date: '2026-01-05', load: 50, source: 'tss' as const },
    ]
    const daily = aggregateDailyLoad(activities, '2026-01-01', '2026-01-05')
    expect(daily).toHaveLength(5)
    expect(daily[1]!.totalLoad).toBe(0)
    expect(daily[4]!.totalLoad).toBe(50)
  })
})

describe('calculateFitness', () => {
  it('CTL/ATL start at 0 and increase with training', () => {
    // 유효한 날짜 생성 (1/1 ~ 2/19, 50일)
    const daily: DailyLoad[] = Array.from({ length: 50 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      return {
        date: d.toISOString().slice(0, 10),
        totalLoad: 80,
        activities: [],
      }
    })
    const fitness = calculateFitness(daily)
    expect(fitness.length).toBe(50)
    const last = fitness[fitness.length - 1]!
    expect(last.ctl).toBeGreaterThan(50)
    expect(last.atl).toBeGreaterThan(70)
    expect(last.tsb).toBeLessThan(0)
  })

  it('TSB recovers after rest days', () => {
    const training: DailyLoad[] = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      return { date: d.toISOString().slice(0, 10), totalLoad: 100, activities: [] }
    })
    const rest: DailyLoad[] = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 31 + i))
      return { date: d.toISOString().slice(0, 10), totalLoad: 0, activities: [] }
    })
    const fitness = calculateFitness([...training, ...rest])
    const lastTraining = fitness[29]!
    const lastRest = fitness[fitness.length - 1]!
    expect(lastRest.tsb).toBeGreaterThan(lastTraining.tsb)
  })

  it('returns empty for empty input', () => {
    expect(calculateFitness([])).toEqual([])
  })
})
