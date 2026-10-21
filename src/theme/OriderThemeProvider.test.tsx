import { describe, expect, it, beforeEach } from 'vitest';
import { _testApplyTheme } from './OriderThemeProvider';
import { APP_PARITY_THEME, DEFAULT_THEME } from './themes';
import { FONT_SIZE_RAMP } from './tokens/typography';

describe('OriderTheme CSS 변수 주입', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-design-theme');
    document.documentElement.removeAttribute('data-type-scale');
  });

  it('기본 테마 다크 variant의 배경·본문·강조색 토큰을 그대로 주입', () => {
    _testApplyTheme(DEFAULT_THEME, 'dark');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--bg-0')).toBe(DEFAULT_THEME.scheme.dark.colors.background);
    expect(style.getPropertyValue('--ink-0')).toBe(DEFAULT_THEME.scheme.dark.colors.textPrimary);
    expect(style.getPropertyValue('--lime')).toBe(DEFAULT_THEME.scheme.dark.colors.accent);
    expect(document.documentElement.getAttribute('data-design-theme')).toBe('default');
  });

  it('앱 패리티 테마는 Teal accent + #121212 OLED 다크 노출', () => {
    _testApplyTheme(APP_PARITY_THEME, 'dark');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--bg-0')).toBe('#121212');
    expect(style.getPropertyValue('--lime')).toBe('#4FD5D1');
    expect(document.documentElement.getAttribute('data-design-theme')).toBe('app-parity');
  });

  it('dimens 와 typography 가 모두 CSS 변수로 주입', () => {
    _testApplyTheme(APP_PARITY_THEME, 'dark');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--dim-button-height')).toBe('48px');
    expect(style.getPropertyValue('--fs-data-hero')).toBe('96px');
    expect(style.getPropertyValue('--ft-title-weight')).toBe('700');
  });

  it('fractional spacing and extended font tokens are defined', () => {
    _testApplyTheme(DEFAULT_THEME, 'dark');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--space-0')).toBe('0');
    expect(style.getPropertyValue('--space-0-5')).toBe('2px');
    expect(style.getPropertyValue('--space-1-5')).toBe('6px');
    // HIG 단계 — 최소 12px 은 모바일 접근성 하한 (#401)
    expect(style.getPropertyValue('--fs-2xs')).toBe('12px');
    expect(style.getPropertyValue('--fs-xs')).toBe('13px');
    expect(style.getPropertyValue('--fs-sm')).toBe('15px');
    expect(style.getPropertyValue('--fs-base')).toBe('16px');
    expect(style.getPropertyValue('--fs-md')).toBe('17px');
    expect(style.getPropertyValue('--fs-lg')).toBe('20px');
    expect(style.getPropertyValue('--fs-xl')).toBe('22px');
    expect(style.getPropertyValue('--fs-2xl')).toBe('28px');
    expect(style.getPropertyValue('--fs-3xl')).toBe('34px');
    expect(style.getPropertyValue('--fs-4xl')).toBe('40px');
    expect(style.getPropertyValue('--fs-5xl')).toBe('48px');
  });

  it('font-size 램프는 단조 증가하고 12px 미만이 없다', () => {
    const sizes = Object.values(FONT_SIZE_RAMP);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    sizes.slice(1).forEach((size, i) => expect(size).toBeGreaterThan(sizes[i]));
  });

  it('기본 본문은 HIG Body(17)', () => {
    _testApplyTheme(DEFAULT_THEME, 'light');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--ft-body-size')).toBe('17px');
    expect(style.getPropertyValue('--ft-body-small-size')).toBe('15px');
    expect(style.getPropertyValue('--ft-page-title-size')).toBe('34px');
  });

  it('임베드(legacy)는 HIG 이전 크기를 주입하고 데이터 위계는 테마 값을 유지', () => {
    _testApplyTheme(APP_PARITY_THEME, 'dark', 'legacy');
    const style = document.documentElement.style;
    expect(document.documentElement.getAttribute('data-type-scale')).toBe('legacy');
    expect(style.getPropertyValue('--fs-xs')).toBe('12px');
    expect(style.getPropertyValue('--fs-sm')).toBe('12px');
    expect(style.getPropertyValue('--fs-md')).toBe('15px');
    expect(style.getPropertyValue('--fs-3xl')).toBe('32px');
    expect(style.getPropertyValue('--ft-body-size')).toBe('15px');
    expect(style.getPropertyValue('--ft-page-title-size')).toBe('32px');
    expect(style.getPropertyValue('--fs-data-hero')).toBe('96px');
  });

  it('legacy 에서 기본(hig)으로 돌아오면 HIG 값으로 복귀', () => {
    _testApplyTheme(DEFAULT_THEME, 'light', 'legacy');
    _testApplyTheme(DEFAULT_THEME, 'light');
    const style = document.documentElement.style;
    expect(document.documentElement.getAttribute('data-type-scale')).toBe('hig');
    expect(style.getPropertyValue('--fs-md')).toBe('17px');
    expect(style.getPropertyValue('--ft-body-size')).toBe('17px');
  });

  it('라이트/다크 variant 교체 시 토큰이 갱신', () => {
    _testApplyTheme(DEFAULT_THEME, 'light');
    const light = document.documentElement.style.getPropertyValue('--bg-0');
    _testApplyTheme(DEFAULT_THEME, 'dark');
    const dark = document.documentElement.style.getPropertyValue('--bg-0');
    expect(light).not.toBe(dark);
  });
});
