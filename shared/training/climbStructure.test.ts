import { describe, expect, it } from 'vitest';
import { sanitizeCourseClimbs } from './climbStructure';

describe('sanitizeCourseClimbs', () => {
  it('객체 배열의 유효한 클라임만 복사한다', () => {
    expect(sanitizeCourseClimbs([{ gain: 400, dist: 5000, cat: 3 }]))
      .toEqual([{ gain: 400, dist: 5000, cat: 3 }]);
  });

  it.each([null, 'climbs', 1, {}, [null, 'x']])('비배열 또는 비객체 항목 %j를 거부한다', (input) => {
    expect(sanitizeCourseClimbs(input)).toEqual([]);
  });

  it('문자열 수치, NaN/Infinity, 잘못된 거리·상승고도·카테고리를 거부한다', () => {
    expect(sanitizeCourseClimbs([
      { gain: '400', dist: 5000, cat: 3 },
      { gain: Number.NaN, dist: 5000, cat: 3 },
      { gain: 400, dist: Number.POSITIVE_INFINITY, cat: 3 },
      { gain: -1, dist: 5000, cat: 3 },
      { gain: 400, dist: 0, cat: 3 },
      { gain: 400, dist: 5000, cat: 2.5 },
      { gain: 400, dist: 5000, cat: 0 },
      { gain: 400, dist: 5000, cat: 6 },
    ])).toEqual([]);
  });
});
