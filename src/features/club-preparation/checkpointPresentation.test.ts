import { describe, expect, it } from 'vitest';
import { checkpointDistanceValue, checkpointTypeLabel } from './checkpointPresentation';
describe('체크포인트 표시',()=>{
  it('거리 표시만 두 자리로 줄이고 실제 0과 미정을 구별한다',()=>{
    const original=31.264664971566393;
    expect(checkpointDistanceValue(original)).toBe('31.26');expect(original).toBe(31.264664971566393);
    expect(checkpointDistanceValue(0)).toBe('0');expect(checkpointDistanceValue()).toBe('');
  });
  it('알려진 유형 코드는 한국어로 표시하고 자유 입력은 보존한다',()=>{
    expect(checkpointTypeLabel('GENERIC')).toBe('일반 경유지');expect(checkpointTypeLabel('FOOD')).toBe('음식·보급');
    expect(checkpointTypeLabel('CAFE')).toBe('카페');expect(checkpointTypeLabel('정상에서 재집결')).toBe('정상에서 재집결');
    expect(checkpointTypeLabel('CUSTOM_NOTE')).toBe('CUSTOM_NOTE');
  });
});
