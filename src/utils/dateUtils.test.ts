import { describe, expect, it } from 'vitest';
import { activityTimestampParts } from './dateUtils';

describe('activityTimestampParts', () => {
  it('formats the actual start minute in Korean and English', () => {
    const start = Date.parse('2026-10-20T10:16:00Z');
    const now = Date.parse('2026-10-20T13:00:00Z');
    expect(activityTimestampParts(start, 'ko', now, 'Asia/Seoul')).toMatchObject({ day: 'today', time: '오후 7:16', iso: '2026-10-20T10:16:00.000Z' });
    expect(activityTimestampParts(start, 'en', now, 'Asia/Seoul')).toMatchObject({ day: 'today', time: '7:16 PM' });
  });
  it('uses calendar boundaries rather than the number of elapsed hours', () => {
    expect(activityTimestampParts(Date.parse('2026-10-19T14:59:00Z'), 'ko', Date.parse('2026-10-19T15:01:00Z'), 'Asia/Seoul')?.day).toBe('yesterday');
    expect(activityTimestampParts(Date.parse('2026-10-18T14:59:00Z'), 'ko', Date.parse('2026-10-19T15:01:00Z'), 'Asia/Seoul')?.day).toBe('date');
  });
  it('keeps yesterday correct across a daylight-saving boundary', () => {
    expect(activityTimestampParts(Date.parse('2026-03-07T17:00:00Z'), 'en', Date.parse('2026-03-08T16:00:00Z'), 'America/New_York')).toMatchObject({ day: 'yesterday', time: '12:00 PM' });
  });
  it('retains the full date for older records', () => {
    expect(activityTimestampParts(Date.parse('2025-12-31T10:16:00Z'), 'en', Date.parse('2026-10-20T10:16:00Z'), 'Asia/Seoul')).toMatchObject({ day: 'date', date: 'Dec 31, 2025', time: '7:16 PM' });
  });
  it.each([0, -1, NaN, Infinity, 9e15])('does not invent a start time for %s', value => {
    expect(activityTimestampParts(value, 'ko')).toBeNull();
  });
});
