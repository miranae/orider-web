/**
 * 주 경계 계산 — `Asia/Seoul` 고정 (설계 문서 §3.4c).
 *
 * 왜 고정인가: 주간 리캡은 "지난주 몇 번 달렸나"를 말한다. 사용자가 해외에서 앱을 열었다고
 * 지난주의 범위가 달라지면 같은 주에 대해 다른 숫자를 보게 된다. 서비스가 한국 사용자 기준이므로
 * 주 경계를 KST 로 고정한다. (기존 `useWeeklyStats` 는 브라우저 로컬 `getDay()` 를 쓴다 —
 * 12주 차트용이라 이번 범위에서 건드리지 않았다. 별도 이슈.)
 *
 * KST 는 서머타임이 없는 UTC+9 고정이라 오프셋 상수 하나로 정확히 계산된다.
 */

const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 86400000;
export const WEEK_MS = 7 * DAY_MS;

/** 주어진 시각이 속한 주의 시작(월요일 00:00 KST) epoch ms. */
export function seoulWeekStartMs(ms: number): number {
  const shifted = ms + KST_OFFSET_MS; // KST 벽시계를 UTC 필드로 읽기 위한 시프트
  const d = new Date(shifted);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // 0=월 … 6=일
  const midnightShifted = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnightShifted - daysSinceMonday * DAY_MS - KST_OFFSET_MS;
}

/** KST 기준 요일 (0=월 … 6=일). */
export function seoulWeekday(ms: number): number {
  return (new Date(ms + KST_OFFSET_MS).getUTCDay() + 6) % 7;
}

export interface WeekRange {
  startMs: number;
  /** 배타적 상한. */
  endMs: number;
}

/**
 * 현재 주를 기준으로 `weeksAgo` 주 전의 범위.
 * weeksAgo=0 → 이번 주, 1 → 지난주, 2 → 그 전주.
 */
export function seoulWeekRange(nowMs: number, weeksAgo: number): WeekRange {
  const thisWeekStart = seoulWeekStartMs(nowMs);
  const startMs = thisWeekStart - weeksAgo * WEEK_MS;
  return { startMs, endMs: startMs + WEEK_MS };
}

export function isWithin(ms: number, range: WeekRange): boolean {
  return ms >= range.startMs && ms < range.endMs;
}
