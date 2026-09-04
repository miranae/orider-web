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
/**
 * 활동 부하(TSS 등가) — **정본 폴백 체인**(`@shared/training/activityLoad.estimateLoad`)에 위임한다.
 *
 * 스트림에서 TSS·TRIMP 를 다시 계산하던 분기는 지웠다(#2437). 호출부 어디도 스트림을 넘기지
 * 않았고(사전계산 TSS·relativeEffort·시간만), 서버가 `activity_metrics.tss`·`streamTrimpTss` 를
 * 이미 낸다. 웹 사본 원시함수는 삭제됐다.
 */
export function estimateActivityLoad(params: {
  precomputedTss?: number | null
  streamTrimpTss?: number | null
  avgPower?: number | null
  ftp?: number
  relativeEffort: number | null
  ridingTimeMillis: number
  discipline?: Discipline
}): ActivityLoad {
  return estimateLoad({
    precomputedTss: params.precomputedTss,
    avgPower: params.avgPower,
    ftp: params.ftp,
    streamTrimpTss: params.streamTrimpTss,
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
