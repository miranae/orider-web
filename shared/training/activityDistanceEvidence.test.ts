import { describe, expect, it } from 'vitest';
import { resolveObservedDistanceKm } from './activityDistanceEvidence';

describe('거리 출처 도입 버전의 호환 경계', () => {
  it('출처 필드가 없던 v32의 양수 거리는 보존한다', () => {
    expect(resolveObservedDistanceKm({ version: 32, distanceKm: 10 })).toBe(10);
  });
  it('출처가 필요한 v33의 필드 누락은 결측으로 유지한다', () => {
    expect(resolveObservedDistanceKm({ version: 33, distanceKm: 10 })).toBeNull();
  });
  it.each([32, 33])('v%s의 명시적 결측 출처는 양수 거리로 승격하지 않는다', version => {
    expect(resolveObservedDistanceKm({ version, distanceKm: 10, distanceSource: null })).toBeNull();
  });
});
