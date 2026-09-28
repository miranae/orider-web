import { describe, expect, it } from 'vitest';
import { planCalendarDate, planDayKey, planDayStartMs, planMonthBounds } from './planDate';

describe('KST 계획 날짜 계약', () => {
  it.each(['America/Los_Angeles', 'Asia/Tokyo', 'UTC'])('브라우저 %s에서도 같은 계획 날짜와 쿼리 범위다', (timezone) => {
    const original = process.env.TZ;
    try {
      process.env.TZ = timezone;
      const instant = Date.parse('2026-09-30T15:05:00Z');
      expect(planDayKey(instant)).toBe('2026-10-01');
      expect(planDayStartMs(instant)).toBe(Date.parse('2026-09-30T15:00:00Z'));
      expect(planCalendarDate(instant).getUTCDate()).toBe(1);
      expect(planMonthBounds(2026, 9)).toEqual({ start: Date.parse('2026-09-30T15:00:00Z'), end: Date.parse('2026-10-31T15:00:00Z') - 1 });
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
