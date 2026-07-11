import { describe, expect, it } from 'vitest';
import { buildClimbGoalRequest } from './climbGoal';

describe('buildClimbGoalRequest', () => {
  it('코스 없이 클라임 자체 목표 요청을 만든다', () => {
    expect(buildClimbGoalRequest({ climbName: ' 남산 ', climbDurationMin: 20, targetWkg: 4.1, targetDate: '2027-05-01', weeklySessions: 4 }))
      .toEqual({ goalType: 'climb', climbName: '남산', climbDurationMin: 20, targetWkg: 4.1, targetDate: '2027-05-01', weeklySessions: 4 });
  });
  it('범위 밖 입력을 거부한다', () => {
    expect(() => buildClimbGoalRequest({ climbName: '', climbDurationMin: 20, targetDate: '2027-05-01', weeklySessions: 4 })).toThrow();
    expect(() => buildClimbGoalRequest({ climbName: '남산', climbDurationMin: 2, targetDate: '2027-05-01', weeklySessions: 4 })).toThrow();
    expect(() => buildClimbGoalRequest({ climbName: '남산', climbDurationMin: 20, targetWkg: 9, targetDate: '2027-05-01', weeklySessions: 4 })).toThrow();
  });
});
