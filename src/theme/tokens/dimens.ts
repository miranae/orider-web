/**
 * 치수 토큰 — 웹 단일 진실원.
 *
 * 앱(KMP) `OriderDimensTokens.kt` 와 정합. 단위는 모두 px (앱은 dp/pt 1:1).
 * 4/8/12/16/24/32 의 8pt grid 기반.
 */
export interface DimenTokens {
  // Padding (5단계)
  paddingXs: number;   // 4
  paddingS: number;    // 8
  paddingM: number;    // 16
  paddingL: number;    // 24
  paddingXl: number;   // 32

  // Spacing (앱 RideDimensions 정합)
  itemGap: number;     // 8 — 카드/아이템 사이
  itemInner: number;   // 12 — 카드 내부 요소
  sectionGap: number;  // 16 — 섹션 사이

  // Corner radius (4단계)
  cornerRadiusS: number;   // 4
  cornerRadiusM: number;   // 8
  cornerRadiusL: number;   // 12
  cornerRadiusXl: number;  // 16

  // List item
  listItemHeight: number;   // 56
  listItemSpacing: number;  // 8

  // Card
  cardPadding: number;  // 16
  cardSpacing: number;  // 12

  // Button
  buttonHeight: number;            // 40
  buttonPaddingHorizontal: number; // 14

  // Divider
  dividerThickness: number;  // 1

  // Icon sizes
  iconS: number;   // 16
  iconM: number;   // 24
  iconL: number;   // 32
}

import { GENERATED_DEFAULT_DIMENS } from '../generated';

export const DEFAULT_DIMENS: DimenTokens = GENERATED_DEFAULT_DIMENS;

/** 앱 패리티 — 앱은 r-md=8, r-lg=12 사용. 모바일 터치 타깃 48px. */
export const APP_PARITY_DIMENS: DimenTokens = {
  ...DEFAULT_DIMENS,
  cornerRadiusM: 8,
  cornerRadiusL: 12,
  buttonHeight: 48,
  buttonPaddingHorizontal: 24,
};
