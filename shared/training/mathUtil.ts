/**
 * training 순수 계산 모듈 공용 수치 헬퍼.
 * 각 모듈이 하드롤하던 양수-유한 가드 / clamp / 2자리 반올림을 단일 출처로 통일한다.
 */

/** 유한한 양수인지(>0). null/undefined/NaN/0/음수는 false. */
export function isPositiveFinite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** v 를 [lo, hi] 로 clamp (포함). */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 소수 2자리 반올림. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
