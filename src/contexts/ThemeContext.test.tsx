import { act, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOST_THEME_CHANGE_EVENT, ThemeProvider, useTheme } from './ThemeContext';
import { OriderThemeProvider } from '../theme/OriderThemeProvider';

let change: ((event: { matches: boolean }) => void) | undefined;
function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return <button onClick={() => setTheme(theme === 'system' ? 'light' : 'system')}>{theme}:{resolvedTheme}</button>;
}
function mount() {
  render(<ThemeProvider><OriderThemeProvider><Probe /></OriderThemeProvider></ThemeProvider>);
}
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    addEventListener: (_: string, handler: typeof change) => { change = handler; },
    removeEventListener: vi.fn(),
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('시스템 테마 연동', () => {
  it('실행 중 색상을 전환하고 글자와 간격을 유지한다', () => {
    mount();
    const root = document.documentElement;
    expect(screen.getByRole('button')).toHaveTextContent('system:light');
    const background = root.style.getPropertyValue('--bg-0');
    const font = root.style.getPropertyValue('--fs-base');
    const spacing = root.style.getPropertyValue('--space-4');
    act(() => change?.({ matches: true }));
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(root.style.getPropertyValue('--bg-0')).not.toBe(background);
    expect(root.style.getPropertyValue('--fs-base')).toBe(font);
    expect(root.style.getPropertyValue('--space-4')).toBe(spacing);
    act(() => change?.({ matches: false }));
    expect(root.dataset.theme).toBe('light');
    expect(root.style.getPropertyValue('--bg-0')).toBe(background);
  });
  it('주행 정책을 벗어나면 저장 선호를 바꾸지 않고 시스템으로 복귀한다', () => {
    const tree = (forceDark: boolean) => <ThemeProvider forceDark={forceDark}><OriderThemeProvider><Probe /></OriderThemeProvider></ThemeProvider>;
    const { rerender } = render(tree(true));
    expect(screen.getByRole('button')).toHaveTextContent('system:dark');
    expect(localStorage.getItem('orider.theme')).toBeNull();
    rerender(tree(false));
    expect(screen.getByRole('button')).toHaveTextContent('system:light');
  });
  it('임베드는 시스템 변경에도 호스트의 절전 다크를 유지한다', () => {
    render(<ThemeProvider hostControlled><OriderThemeProvider><Probe /></OriderThemeProvider></ThemeProvider>);
    act(() => window.dispatchEvent(new CustomEvent(HOST_THEME_CHANGE_EVENT, { detail: { mode: 'dark' } })));
    act(() => change?.({ matches: false }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => window.dispatchEvent(new CustomEvent(HOST_THEME_CHANGE_EVENT, { detail: { mode: 'light' } })));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('orider.theme')).toBeNull();
  });
  it('명시적으로 선택한 테마는 보존하고 시스템으로 복귀할 수 있다', () => {
    localStorage.setItem('orider.theme', 'dark');
    mount();
    expect(screen.getByRole('button')).toHaveTextContent('dark:dark');
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button')).toHaveTextContent('system:light');
    expect(localStorage.getItem('orider.theme')).toBeNull();
  });
});
