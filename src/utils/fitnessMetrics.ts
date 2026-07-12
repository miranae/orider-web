import { calculateTSS } from './powerMetrics'
import { trimpToTssEquivalent } from './advancedMetrics'
import { estimateLoad, type LoadSource } from '@shared/training/activityLoad'
import type { Discipline } from './disciplineFilter'

// CTL/ATL/TSB EMA 는 정본 shared/training/fitness.ts 로 단일화됨 — 서버
// (functions/src/training/fitness.ts 미러)와 동일 로직. 여기선 재노출만 한다.
// (DailyLoad → shared 의 DailyLoadInput 와 구조 호환: date/totalLoad 보유.)
export {
  calculateFitness,
  calculateCurrentCtl,
  CTL_DAYS,
  ATL_DAYS,
} from '@shared/training/fitness'
export type { FitnessPoint, DailyLoadInput, FitnessOptions } from '@shared/training/fitness'

export type { LoadSource }

export interface ActivityLoad {
  value: number
  source: LoadSource
}

export interface ActivityLoadEntry {
  date: string // 'YYYY-MM-DD'
  load: number
  source: LoadSource
}

export interface DailyLoad {
  date: string
  totalLoad: number
  activities: { load: number; source: LoadSource }[]
}

/** 활동 1개의 트레이닝 부하 추정: 사전계산 TSS > 스트림 TSS > 파워근사 > HR 스트림 TRIMP > relativeEffort > 시간 기반.
 *
 *  폴백 체인·상수는 shared/training/activityLoad.ts(정본)에 단일화돼 서버
 *  (functions/src/training/activity-load.ts)와 동일하게 동작한다. 본 함수는 web 어댑터로,
 *  watts 스트림이 있으면 calculateTSS 로 실측 TSS 를, heartrate 스트림이 있으면(파워 경로가
 *  실패했을 때) trimpToTssEquivalent 로 TSS 등가 TRIMP 를 구해 코어에 넘긴다(서버는 스트림이
 *  없어 이 단계들 skip). */
export function estimateActivityLoad(params: {
  /** 서버 사전계산 TSS (activity.tss 또는 activity.summary.tss). 있으면 최우선. */
  precomputedTss?: number | null
  watts?: number[]
  ftp?: number
  /** 평균 파워(W). watts 스트림이 없을 때 bike 파워근사(IF²)에 사용. */
  avgPower?: number | null
  /** HR 스트림 — 파워 기반 부하를 구하지 못했을 때 TRIMP 로 폴백(#365). */
  heartrate?: number[]
  /** time 스트림(초) — 스마트 레코딩/일시정지 보정. 미전달 시 1Hz 가정으로 TRIMP 저평가됨. */
  time?: number[]
  /** HR TRIMP 계산용. maxHr 없으면 이 단계 skip. */
  maxHr?: number | null
  restHr?: number | null
  /** LTHR — 있으면 TRIMP→TSS 정규화 임계값으로 사용(없으면 maxHr×0.85 근사). */
  lthr?: number | null
  gender?: 'male' | 'female'
  relativeEffort: number | null
  ridingTimeMillis: number
  /** 'tri'(멀티스포츠 혼합)는 종목 미상으로 간주 → 시간기반 기본 factor. */
  discipline?: Discipline
}): ActivityLoad {
  // 파워 스트림 실측 TSS (파워미터 보유 활동) — web 전용 단계. 코어엔 streamTss 로 전달.
  const streamTss =
    params.watts && params.watts.length >= 30 && params.ftp && params.ftp > 0
      ? calculateTSS(params.watts, params.ftp)
      : null

  // HR 스트림 실측 TRIMP → TSS 등가 (#365) — web 전용 단계. 파워 경로 없을 때만 의미 있지만
  // 계산 자체는 항상 시도해 코어(estimateLoad)의 우선순위 판단에 맡긴다.
  const streamTrimpTss =
    params.heartrate && params.heartrate.length >= 30 && params.maxHr && params.maxHr > 0
      ? trimpToTssEquivalent({
          heartrate: params.heartrate,
          maxHr: params.maxHr,
          restHr: params.restHr ?? undefined,
          thresholdHr: params.lthr ?? undefined,
          gender: params.gender,
          time: params.time,
        })
      : null

  return estimateLoad({
    precomputedTss: params.precomputedTss,
    streamTss,
    avgPower: params.avgPower,
    ftp: params.ftp,
    streamTrimpTss,
    relativeEffort: params.relativeEffort,
    durationMillis: params.ridingTimeMillis,
    discipline: params.discipline && params.discipline !== 'tri' ? params.discipline : undefined,
  })
}

/** 활동 부하 목록 → 일별 합산 (빈 날짜 0으로 채움) */
export function aggregateDailyLoad(
  entries: ActivityLoadEntry[],
  startDate: string,
  endDate: string,
): DailyLoad[] {
  const map = new Map<string, { load: number; source: LoadSource }[]>()
  for (const e of entries) {
    const arr = map.get(e.date) || []
    arr.push({ load: e.load, source: e.source })
    map.set(e.date, arr)
  }

  const result: DailyLoad[] = []
  // 타임존 영향 없이 날짜 증가 (YYYY-MM-DD 문자열 직접 계산)
  let dateStr = startDate
  while (dateStr <= endDate) {
    const dayActivities = map.get(dateStr) || []
    result.push({
      date: dateStr,
      totalLoad: dayActivities.reduce((sum, a) => sum + a.load, 0),
      activities: dayActivities,
    })
    // 다음 날짜 계산
    const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    dateStr = next.toISOString().slice(0, 10)
  }

  return result
}
