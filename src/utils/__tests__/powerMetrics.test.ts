import { describe, it, expect } from 'vitest'
import { calculateNP, calculateIF, calculateTSS, calculateVI } from '../powerMetrics'

describe('powerMetrics', () => {
  it('NP: constant 200W returns ~200', () => {
    const watts = Array(60).fill(200)
    expect(calculateNP(watts)).toBeCloseTo(200, 0)
  })

  it('NP: under 30 samples returns null', () => {
    expect(calculateNP(Array(20).fill(200))).toBeNull()
  })

  it('NP: variable power higher than average', () => {
    // 60초 100W → 60초 300W 블록: 30초 롤링 윈도우가 100~300 사이로 변동
    const watts = [...Array(60).fill(100), ...Array(60).fill(300)]
    const np = calculateNP(watts)!
    const avg = watts.reduce((a, b) => a + b, 0) / watts.length
    expect(np).toBeGreaterThan(avg)
  })

  it('IF: at FTP returns ~1.0', () => {
    const watts = Array(60).fill(200)
    expect(calculateIF(watts, 200)).toBeCloseTo(1.0, 1)
  })

  it('TSS: 1 hour at FTP returns ~100', () => {
    const watts = Array(3600).fill(200)
    expect(calculateTSS(watts, 200)).toBeCloseTo(100, -1)
  })

  it('VI: constant power returns ~1.0', () => {
    const watts = Array(60).fill(200)
    expect(calculateVI(watts)).toBeCloseTo(1.0, 1)
  })
})
