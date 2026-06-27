/**
 * 코호트 백분위 랭킹 — `stats/percentiles_bike` 단일 공개 doc.
 *
 * G9 (2026-06-06)
 *
 * 서버(functions/src/analysis/cohort-percentiles.ts)가 주 1회 cron 으로 전체 사용자의
 *  pdc_bike(ftpEst·20m W/kg·vo2maxEst) 표본을 코호트(전체·성별·연령대)별 백분위 구간으로
 *  집계한다. 클라는 이 doc 1회 read 후 percentile-util 로 자기 값의 백분위를 로컬 매핑한다.
 *
 * 비용모델: BigQuery 대신 Firestore 집계 → 클라는 stats doc 1회 read.
 *
 * functions tsconfig 가 shared 를 include 하지 않아 서버는 이 타입을 직접 import 하지 않고
 *  동일 doc 형태를 인라인 생성한다(pdc.ts mirror 패턴). 형태 변경 시 양쪽 동기화.
 */

/** 백분위 구간 — 분위점(percentile point) → 값. 예 { 10: 180, 50: 245, 99: 410 }. */
export type CohortBreakpoints = Partial<Record<10 | 25 | 50 | 75 | 90 | 95 | 99, number>>;

/** 메트릭별 코호트 → 구간표. 코호트 키: "all" | "male" | "female" | "u20"|"20s"|"30s"|"40s"|"50s"|"60plus". */
export interface CohortMetric {
  cohorts: Record<string, CohortBreakpoints>;
}

export interface CohortPercentiles {
  /** 집계 시각 (epoch ms). */
  computedAt: number;
  /** 전체("all") 코호트 표본 크기 (3 메트릭 중 최대). */
  sampleSize: number;
  /** 코호트 구간 저장 하한 — 이 미만 코호트는 cohorts 에 없음(클라가 "all" 폴백). */
  minCohortSamples: number;
  /** 계산된 분위점 목록. */
  percentilePoints: number[];
  /** MAX_DOCS_PER_RUN 도달로 표본이 잘렸는지 (후속 분할 신호). */
  truncated: boolean;
  metrics: {
    ftp: CohortMetric;
    wkg20m: CohortMetric;
    vo2max: CohortMetric;
  };
  version: number;
}

/** UI 코호트 선택 옵션 키. */
export type CohortKey =
  | "all" | "male" | "female"
  | "u20" | "20s" | "30s" | "40s" | "50s" | "60plus";
