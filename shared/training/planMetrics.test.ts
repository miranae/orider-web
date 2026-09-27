import { describe, expect, it } from 'vitest';
import type { PlanWeek } from '../types/goal';
import { computePlanProgress } from './planMetrics';

describe('현재 유효 처방 진행률', () => {
  const week = (actualTSS?: number): PlanWeek[] => [{startDate: 0, days: [{plannedTSS: 100, adjustedTSS: 85, completed: true, actualTSS}]} as PlanWeek];
  it('조정 처방 85를 실제 85로 완료하면 100%이고 원본 계획은 보존한다', () => {
    const input = week(85);
    expect(computePlanProgress(input, 0)).toMatchObject({totalTSS: 85, completedTSS: 85, progressPct: 100});
    expect(input[0].days[0].plannedTSS).toBe(100);
  });
  it('실제 0은 완료 처방값으로 대체하지 않는다', () => {
    expect(computePlanProgress(week(0), 0)).toMatchObject({completedTSS: 0, progressPct: 0});
  });
  it('실측 부하가 없는 완료는 유효 처방 가중 진행률이다', () => {
    expect(computePlanProgress(week(), 0)).toMatchObject({completedTSS: 85, progressPct: 100});
  });
});
