import { describe, it, expect } from 'vitest'
import {
  calculateFitness,
  calculateCurrentCtl,
  CTL_DAYS,
  ATL_DAYS,
  type DailyLoadInput,
} from './fitness'

/** 일정 부하의 N일치 0-fill 배열 생성. */
function constLoad(days: number, load: number): DailyLoadInput[] {
  return Array.from({ length: days }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    totalLoad: load,
  }))
}

describe('calculateFitness', () => {
  it('빈 입력은 빈 시계열', () => {
    expect(calculateFitness([])).toEqual([])
  })

  it('CTL/ATL 은 0 에서 시작해 상승, 초기엔 TSB<0', () => {
    const series = calculateFitness(constLoad(50, 100))
    expect(series.length).toBe(50)
    const last = series[series.length - 1]!
    // 50일 일정 부하면 ATL(7일)이 CTL(42일)보다 빨리 수렴 → 둘 다 100 에 접근, ATL 이 더 큼
    expect(last.atl).toBeGreaterThan(last.ctl)
    expect(last.tsb).toBeLessThanOrEqual(0)
    expect(last.ctl).toBeGreaterThan(50)
  })

  it('충분히 길면 일정 부하의 CTL 은 부하값에 수렴', () => {
    const series = calculateFitness(constLoad(400, 80))
    expect(series[series.length - 1]!.ctl).toBeCloseTo(80, 0)
  })

  it('기본 round=true 는 소수 1자리, round=false 는 원시 정밀도', () => {
    const input = constLoad(10, 77)
    const rounded = calculateFitness(input)
    const raw = calculateFitness(input, { round: false })
    for (let i = 0; i < input.length; i++) {
      expect(rounded[i]!.ctl).toBeCloseTo(Math.round(raw[i]!.ctl * 10) / 10, 10)
    }
    // 원시값은 반올림본과 미세하게 다를 수 있어야(=실제 full precision)
    const anyUnrounded = raw.some((p) => p.ctl !== Math.round(p.ctl * 10) / 10)
    expect(anyUnrounded).toBe(true)
  })

  it('seedCtl/seedAtl 으로 시작점을 이어받으면 워밍업을 건너뛴다', () => {
    const load = constLoad(30, 60)
    // 시드 0 vs 시드 50 — 시드본이 같은 날 더 높은 CTL(0 에서 워밍업 안 함)
    const cold = calculateFitness(load, { round: false })
    const seeded = calculateFitness(load, { seedCtl: 50, seedAtl: 50, round: false })
    expect(seeded[0]!.ctl).toBeGreaterThan(cold[0]!.ctl)
    // 충분히 길면 시드 영향은 사라지지만 30일(<1τ 워밍업 부족)에선 여전히 큰 차이
    expect(seeded[seeded.length - 1]!.ctl).toBeGreaterThan(cold[cold.length - 1]!.ctl)
  })

  it('seed 와 동등성: [워밍업+표시] 한 번에 계산 == 워밍업 CTL 로 표시구간 시드', () => {
    const warmup = constLoad(200, 90)
    const display = constLoad(60, 90).map((d, i) => ({ date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, totalLoad: d.totalLoad }))
    const full = calculateFitness([...warmup, ...display], { round: false })
    const seedCtl = calculateCurrentCtl(warmup)
    const seedAtl = (() => {
      // ATL 시드도 동일 워밍업으로 산출
      let atl = 0
      const decay = 1 - 1 / ATL_DAYS
      for (const d of warmup) atl = atl * decay + d.totalLoad * (1 / ATL_DAYS)
      return atl
    })()
    const seeded = calculateFitness(display, { seedCtl, seedAtl, round: false })
    const fullDisplayTail = full.slice(warmup.length)
    // 시드본 표시구간 == 풀계산 표시구간 (부동소수 허용)
    for (let i = 0; i < display.length; i++) {
      expect(seeded[i]!.ctl).toBeCloseTo(fullDisplayTail[i]!.ctl, 6)
      expect(seeded[i]!.atl).toBeCloseTo(fullDisplayTail[i]!.atl, 6)
    }
  })
})

describe('calculateCurrentCtl', () => {
  it('빈 입력은 seedCtl(기본 0) 반환', () => {
    expect(calculateCurrentCtl([])).toBe(0)
    expect(calculateCurrentCtl([], { seedCtl: 42 })).toBe(42)
  })

  it('calculateFitness 마지막 포인트 CTL(원시)과 일치', () => {
    const load = constLoad(120, 70)
    const series = calculateFitness(load, { round: false })
    expect(calculateCurrentCtl(load)).toBeCloseTo(series[series.length - 1]!.ctl, 9)
  })
})

describe('상수', () => {
  it('CTL=42, ATL=7', () => {
    expect(CTL_DAYS).toBe(42)
    expect(ATL_DAYS).toBe(7)
  })
})
