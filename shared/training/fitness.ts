/**
 * CTL/ATL/TSB 지수이동평균(EMA) — 정본(single source of truth).
 *
 * 웹(web/src/utils/fitnessMetrics.ts 가 본 모듈을 재노출)과 서버
 * (functions/src/training/fitness.ts 미러)가 동일 로직을 공유한다. functions 는
 * tsconfig include 제약으로 본 파일을 직접 import 할 수 없어 미러를 두며,
 * functions/src/training/fitness.test.ts 의 parity 테스트가 본 정본을 동적 import 해
 * 미러와 출력 일치를 강제한다. **한쪽 수정 시 반드시 양쪽 + parity 테스트 갱신.**
 *
 * 모델: Banister CTL=42일·ATL=7일 EMA. 입력은 0-fill 된 일별 부하 배열(빈 날 totalLoad=0).
 * 0-fill 은 호출부 책임(web: aggregateDailyLoad, server: 캘린더 enumerate). 본 함수는
 * 순수 recurrence 만 수행 — 날짜 산술/타임존에 비관여한다.
 */

/** CTL(만성 부하) 시정수(일). 42일 EMA. */
export const CTL_DAYS = 42
/** ATL(급성 부하) 시정수(일). 7일 EMA. */
export const ATL_DAYS = 7

export interface DailyLoadInput {
  /** 'YYYY-MM-DD' */
  date: string
  /** 그날 합산 TSS(0-fill 된 빈 날은 0). */
  totalLoad: number
}

export interface FitnessPoint {
  date: string
  ctl: number // Chronic Training Load (42-day EMA)
  atl: number // Acute Training Load (7-day EMA)
  tsb: number // Training Stress Balance = CTL - ATL
  dailyLoad: number
}

export interface FitnessOptions {
  ctlDays?: number
  atlDays?: number
  /**
   * 시계열 시작점 직전의 CTL 시드. 정본 doc/서버 스냅샷을 이어받아 0-시드 워밍업
   * 구간(콜드)을 건너뛸 때 사용. 기본 0(= 종전 동작).
   */
  seedCtl?: number
  /** 시계열 시작점 직전의 ATL 시드. 기본 0. */
  seedAtl?: number
  /**
   * 각 포인트 값을 소수 1자리로 반올림(표시용). 기본 true.
   * 서버가 원시 정밀도를 보존해야 하는 시드/재귀 이어받기 용도에선 false.
   */
  round?: boolean
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * 일별 부하 → CTL/ATL/TSB 시계열.
 *
 * recurrence 는 항상 full precision 으로 carry 하고, 각 포인트 출력만 `round` 에 따라
 * 반올림한다(누적 오차 방지). seedCtl/seedAtl 으로 시작점을 이어받을 수 있다.
 */
export function calculateFitness(
  dailyLoads: ReadonlyArray<DailyLoadInput>,
  opts: FitnessOptions = {},
): FitnessPoint[] {
  if (dailyLoads.length === 0) return []

  const ctlDays = opts.ctlDays ?? CTL_DAYS
  const atlDays = opts.atlDays ?? ATL_DAYS
  const doRound = opts.round ?? true
  const ctlDecay = 1 - 1 / ctlDays
  const ctlFactor = 1 / ctlDays
  const atlDecay = 1 - 1 / atlDays
  const atlFactor = 1 / atlDays

  let ctl = opts.seedCtl ?? 0
  let atl = opts.seedAtl ?? 0
  const result: FitnessPoint[] = []

  for (const day of dailyLoads) {
    ctl = ctl * ctlDecay + day.totalLoad * ctlFactor
    atl = atl * atlDecay + day.totalLoad * atlFactor
    result.push({
      date: day.date,
      ctl: doRound ? round1(ctl) : ctl,
      atl: doRound ? round1(atl) : atl,
      tsb: doRound ? round1(ctl - atl) : ctl - atl,
      dailyLoad: day.totalLoad,
    })
  }

  return result
}

/**
 * 일별 부하 → 현재(마지막) CTL **원시값**(미반올림). 시계열을 만들지 않아 메모리 절약.
 * 서버 projection 시드 등 스칼라 한 개만 필요할 때 사용.
 */
export function calculateCurrentCtl(
  dailyLoads: ReadonlyArray<DailyLoadInput>,
  opts: Pick<FitnessOptions, 'ctlDays' | 'seedCtl'> = {},
): number {
  const ctlDays = opts.ctlDays ?? CTL_DAYS
  let ctl = opts.seedCtl ?? 0
  if (dailyLoads.length === 0) return ctl
  const decay = 1 - 1 / ctlDays
  const factor = 1 / ctlDays
  for (const day of dailyLoads) {
    ctl = ctl * decay + day.totalLoad * factor
  }
  return ctl
}
