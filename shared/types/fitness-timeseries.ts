/**
 * 정본 피트니스 시계열 doc 타입 — `users/{uid}/fitness/timeseries_{discipline}`.
 *
 * 서버(functions/src/training/fitness-timeseries.ts)가 활동 인입/revalidate 시
 * 전체 라이프타임 일별 CTL/ATL/TSB 를 계산해 저장하고, 웹(FitnessPage 등)이 읽어
 * 차트·KPI 에 사용한다. 본인 읽기 / backend 쓰기 (firestore 규칙 fitness/{docId}).
 *
 * functions 는 tsconfig include 제약으로 본 파일을 직접 import 할 수 없어 동일 구조를
 * functions/src/training/fitness-timeseries.ts(FitnessTimeseriesDoc)에 둔다 — 양쪽 동기화 필수.
 */
import type { FitnessPoint } from '../training/fitness'

export const FITNESS_TIMESERIES_SCHEMA_VERSION = 1

export type TimeseriesDiscipline = 'bike' | 'run' | 'swim'

export interface FitnessTimeseriesDoc {
  discipline: TimeseriesDiscipline
  schemaVersion: number
  /** 계산 시각(ms). projection.computedAt 와 동기화. */
  computedAt: number
  /** 시계열 첫 포인트 날짜 (UTC 'YYYY-MM-DD'). points 비면 null. */
  startDate: string | null
  /** 시계열 마지막 포인트 날짜 (= 계산일, UTC). points 비면 null. */
  endDate: string | null
  pointCount: number
  /** 첫 활동일~오늘 0-fill 일별 포인트. 0-시드는 첫 활동 지점에서 정확. */
  points: FitnessPoint[]
}
