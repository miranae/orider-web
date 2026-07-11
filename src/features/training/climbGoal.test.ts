import { describe, expect, it } from 'vitest';
import { buildClimbGoalRequest } from './climbGoal';

describe('buildClimbGoalRequest', () => {
  it('코스 없이 클라임 자체 목표 요청을 만든다', () => {
    expect(buildClimbGoalRequest({ climbName: ' 남산 ', climbDurationMin: 20, targetWkg: 4.1, targetDate: '2027-05-01', weeklySessions: 4 }, new Date('2027-03-01T00:00:00+09:00').getTime()))
      .toEqual({ goalType: 'climb', climbName: '남산', climbDurationMin: 20, targetWkg: 4.1, targetDate: '2027-05-01', weeklySessions: 4 });
  });
  it('목표일을 4~24주로 제한한다', () => {
    const now = new Date('2027-03-01T00:00:00+09:00').getTime();
    expect(() => buildClimbGoalRequest({ climbName: '남산', climbDurationMin: 20, targetDate: '2027-03-20', weeklySessions: 4 }, now)).toThrow('invalid-date-range');
    expect(() => buildClimbGoalRequest({ climbName: '남산', climbDurationMin: 20, targetDate: '2027-09-01', weeklySessions: 4 }, now)).toThrow('invalid-date-range');
  });
  it('weeklySessions는 정수 1~6만 허용한다', () => {
    const now = new Date('2027-03-01T00:00:00+09:00').getTime();
    expect(() => buildClimbGoalRequest({ climbName: '남산', climbDurationMin: 20, targetDate: '2027-05-01', weeklySessions: 2.5 as never }, now)).toThrow('invalid-sessions');
  });
  it('범위 밖 입력을 거부한다', () => {
    expect(() => buildClimbGoalRequest({ climbName: '', climbDurationMin: 20, targetDate: '2027-05-01', weeklySessions: 4 })).toThrow();
    expect(() => buildClimbGoalRequest({ climbName: '남산', climbDurationMin: 2, targetDate: '2027-05-01', weeklySessions: 4 })).toThrow();
    expect(() => buildClimbGoalRequest({ climbName: '남산', climbDurationMin: 20, targetWkg: 9, targetDate: '2027-05-01', weeklySessions: 4 })).toThrow();
  });
});
