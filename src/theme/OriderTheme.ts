import type { ChartColorTokens, ColorTokens } from './tokens/colors';
import type { DimenTokens } from './tokens/dimens';
import type { TypographyTokens } from './tokens/typography';

/**
 * 테마 인터페이스 — 런타임 교체 가능.
 *
 * 앱(Compose) `OriderTheme.kt` 와 정합. 차이점:
 * - 웹은 라이트/다크가 한 테마 안에 분리된 두 variant (`scheme` 필드)
 *   → `OriderThemeProvider` 가 사용자 light/dark 선택에 따라 해당 variant 의 CSS 변수를 주입.
 * - `Compose` 의 `Shape` 는 `dimens.cornerRadius*` 로 통합.
 *
 * 새 테마 추가 방법:
 * 1. `theme/themes/{name}.ts` 에 `OriderTheme` 구현체 작성
 * 2. `theme/themes/index.ts` `THEMES` 레지스트리에 등록
 * 3. 사용자 노출은 `OriderThemeProvider` 의 `availableThemes` 에 자동 반영
 */
export interface OriderTheme {
  /** 사용자 식별자. 영문 kebab-case. */
  id: string;
  /** UI 표시명 (한국어 fallback). */
  label: string;
  /** i18n 키 (common namespace). 있으면 label 대신 t(labelKey) 로 표시. */
  labelKey?: string;
  /** 라이트/다크 variant. */
  scheme: {
    light: OriderThemeVariant;
    dark: OriderThemeVariant;
  };
  typography: TypographyTokens;
  dimens: DimenTokens;
}

export interface OriderThemeVariant {
  colors: ColorTokens;
  chartColors: ChartColorTokens;
}
