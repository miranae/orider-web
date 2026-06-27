/** epoch ms → 로컬 날짜 문자열 (YYYY-MM-DD) */
export function toLocalDate(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
