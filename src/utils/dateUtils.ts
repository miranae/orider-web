/** epoch ms → 로컬 날짜 문자열 (YYYY-MM-DD) */
export function toLocalDate(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 정본 PMC 일별 축과 같은 UTC 날짜. 활동/계획의 로컬 날짜와 분리한다. */
export function toUtcDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** 활동 발생 시각. 날짜 비교는 달력 날짜로 하므로 자정과 DST 경계도 지난 24시간과 구분한다. */
export function activityTimestampParts(epochMs: number, locale: string, now = Date.now(), timeZone?: string) {
  if (!Number.isFinite(epochMs) || epochMs <= 0 || !Number.isFinite(new Date(epochMs).getTime())) return null;
  const date = new Date(epochMs);
  const calendarDay = (value: number) => {
    const parts = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone }).formatToParts(value);
    const part = (type: string) => Number(parts.find(entry => entry.type === type)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'));
  };
  const difference = calendarDay(now) - calendarDay(epochMs);
  return {
    day: difference === 0 ? 'today' as const : difference === 86400000 ? 'yesterday' as const : 'date' as const,
    date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone }).format(date),
    time: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(date),
    iso: date.toISOString(),
  };
}
