/**
 * 코호트 백분위 매핑 (클라 측) — `stats/percentiles_bike` 구간표로 사용자 값의 백분위 추정.
 *
 * G9 (2026-06-06)
 *
 * 서버 functions/src/analysis/percentile-util.ts 의 percentileOf 와 동일 알고리즘.
 *  functions tsconfig 가 shared 를 include 하지 않아 양쪽에 복제(pdc.ts mirror 패턴).
 *  진실은 percentile-util.test.ts 로 고정.
 */

import type { CohortBreakpoints } from "../types/cohort-percentiles";

type PercentilePoint = 10 | 25 | 50 | 75 | 90 | 95 | 99;
const PERCENTILE_POINTS: PercentilePoint[] = [10, 25, 50, 75, 90, 95, 99];

/**
 * 사용자 값이 코호트 분포에서 차지하는 백분위(0~100)를 구간표로 추정.
 *
 * 인접 분위점 사이 선형 보간. 최저 분위점 이하면 그 분위점, 최고 이상이면 그 분위점(외삽 없음).
 *  유효 분위점 < 2 면 null.
 *
 * @returns 백분위 정수(하위 N%). 상위% = 100 - N. 매핑 불가 시 null.
 */
export function percentileOf(value: number, breakpoints: CohortBreakpoints): number | null {
  if (!Number.isFinite(value)) return null;
  const points: Array<[PercentilePoint, number]> = [];
  for (const p of PERCENTILE_POINTS) {
    const v = breakpoints[p];
    if (typeof v === "number" && Number.isFinite(v)) points.push([p, v]);
  }
  if (points.length < 2) return null;

  const first = points[0]!;
  if (value <= first[1]) return first[0];
  const last = points[points.length - 1]!;
  if (value >= last[1]) return last[0];

  for (let i = 1; i < points.length; i++) {
    const [hiP, hiV] = points[i]!;
    if (value <= hiV) {
      const [loP, loV] = points[i - 1]!;
      if (hiV === loV) return hiP;
      const t = (value - loV) / (hiV - loV);
      return Math.round(loP + t * (hiP - loP));
    }
  }
  return last[0];
}
