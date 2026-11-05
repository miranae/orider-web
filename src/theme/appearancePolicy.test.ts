import { describe, expect, it } from 'vitest';
import { usesLiveDarkAppearance } from './appearancePolicy';
describe('절전 다크 화면 범위', () => {
  it('관전 화면만 다크로 고정하고 일반 상세와 기록은 제외한다', () => {
    for (const path of ['/ko/live/event-1', '/en/club/g1/meetings/m1/live/', '/ko/embed/clubs/g1/meetings/m1/live']) {
      expect(usesLiveDarkAppearance(path)).toBe(true);
    }
    for (const path of ['/ko', '/ko/settings', '/ko/club/g1/meetings/m1', '/ko/activity/a1', '/ko/live/e1/edit']) {
      expect(usesLiveDarkAppearance(path)).toBe(false);
    }
  });
});
