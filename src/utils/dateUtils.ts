/** epoch ms → 로컬 날짜 문자열 (YYYY-MM-DD) */
export function toLocalDate(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 정본 PMC 일별 축과 같은 UTC 날짜. 활동/계획의 로컬 날짜와 분리한다. */
export function toUtcDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}
