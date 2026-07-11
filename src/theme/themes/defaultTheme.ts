import type { OriderTheme } from '../OriderTheme';
import { GENERATED_DEFAULT_SCHEME } from '../generated';
import { DEFAULT_DIMENS } from '../tokens/dimens';
import { DEFAULT_TYPOGRAPHY } from '../tokens/typography';

/** 기본 테마 — design-tokens/orider.tokens.json 에서 생성. */
export const DEFAULT_THEME: OriderTheme = {
  id: 'default',
  label: '기본',
  labelKey: 'designTheme.default',
  typography: DEFAULT_TYPOGRAPHY,
  dimens: DEFAULT_DIMENS,
  scheme: GENERATED_DEFAULT_SCHEME,
};
