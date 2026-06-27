/**
 * 코호트 분석용 user_property 유틸.
 *
 * Firebase Analytics user_property 는 value 가 string 만 허용 (40자 제한)
 * → 모든 함수가 string 반환. analytics dataset 에서 그룹 by 즉시 가능한 형태.
 */

/** ISO 8601 주차 (YYYY-WW). 가입 코호트 → retention 분석 핵심. */
export function isoWeek(ts: number): string {
  // 음수 / NaN / 0 / Infinity 등 corrupt 값 방어 — Date 가 1970 같은 가짜 결과를 내지 않게.
  if (!Number.isFinite(ts) || ts <= 0) return "unknown";
  const d = new Date(ts);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum); // 목요일 = ISO 주의 대표일
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-${String(weekNum).padStart(2, "0")}`;
}

/** 30일 활동 수 → segmentation bucket. analytics 에서 group_by 단순. */
export function activityCountBucket30d(count: number): string {
  if (count === 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 15) return "6-15";
  return "16+";
}
