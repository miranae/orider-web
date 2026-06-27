import { describe, expect, it, beforeEach } from 'vitest';
import { _testApplyTheme } from './OriderThemeProvider';
import { APP_PARITY_THEME, DEFAULT_THEME } from './themes';

describe('OriderTheme CSS 변수 주입', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-design-theme');
  });

  it('기본 테마 다크 variant 적용 시 --bg-0/--ink-0/--lime 가 OKLCH 값으로 설정', () => {
    _testApplyTheme(DEFAULT_THEME, 'dark');
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--bg-0')).toContain('oklch');
    expect(style.getPropertyValue('--ink-0')).toContain('oklch');
    expect(style.getPropertyValue('--lime')).toContain('oklch');
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

  it('라이트/다크 variant 교체 시 토큰이 갱신', () => {
    _testApplyTheme(DEFAULT_THEME, 'light');
    const light = document.documentElement.style.getPropertyValue('--bg-0');
    _testApplyTheme(DEFAULT_THEME, 'dark');
    const dark = document.documentElement.style.getPropertyValue('--bg-0');
    expect(light).not.toBe(dark);
  });
});
