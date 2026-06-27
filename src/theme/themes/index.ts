import type { OriderTheme } from '../OriderTheme';
import { APP_PARITY_THEME } from './appParityTheme';
import { DEFAULT_THEME } from './defaultTheme';

export { DEFAULT_THEME, APP_PARITY_THEME };

/**
 * 사용 가능한 테마 레지스트리. 새 테마 추가 시 여기에 등록하면
 * `OriderThemeProvider` 가 자동 노출.
 */
export const THEMES: Record<string, OriderTheme> = {
  [DEFAULT_THEME.id]: DEFAULT_THEME,
  [APP_PARITY_THEME.id]: APP_PARITY_THEME,
};

export type ThemeId = keyof typeof THEMES | string;
