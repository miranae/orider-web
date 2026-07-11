import { describe, expect, it } from 'vitest';
import { buildClimbGoalRequest, climbGoalDateBounds } from './climbGoal';

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
  it('KST 정오 기준 표시 경계와 validator의 정확한 4/24주 포함 경계가 일치한다', () => {
    const now = new Date('2027-03-01T12:00:00+09:00').getTime();
    expect(climbGoalDateBounds(now)).toEqual({ min: '2027-03-30', max: '2027-08-16' });

    const valid = (targetDate: string) => buildClimbGoalRequest({
      climbName: '남산', climbDurationMin: 20, targetDate, weeklySessions: 4,
    }, now);
    expect(() => valid('2027-03-29')).toThrow('invalid-date-range');
    expect(valid('2027-03-30').targetDate).toBe('2027-03-30');
    expect(valid('2027-08-16').targetDate).toBe('2027-08-16');
    expect(() => valid('2027-08-17')).toThrow('invalid-date-range');
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
