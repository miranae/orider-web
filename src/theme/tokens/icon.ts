import { HIG_TEXT_SIZE } from './typography';

/**
 * 아이콘 크기 토큰 — Apple HIG(SF Symbols)처럼 곁에 놓이는 글자 단계를 따른다.
 * 아이콘 `size` 에 숫자를 직접 쓰지 말고 이 토큰을 쓴다 (ESLint `design-system/no-numeric-icon-size`).
 */
export const ICON_SIZE = {
  xs: HIG_TEXT_SIZE.footnote,    // 13 — 각주·캡션 옆
  sm: HIG_TEXT_SIZE.subheadline, // 15 — 보조 글자 옆
  md: HIG_TEXT_SIZE.body,        // 17 — 본문 옆, 행 앞
  lg: HIG_TEXT_SIZE.title2,      // 22 — 상단 막대·툴바 버튼, 좋아요·댓글, 하단 탭 (HIG 막대 아이콘)
  xl: HIG_TEXT_SIZE.title1,      // 28 — 빈 상태·축하 등 큰 표시
} as const;

export type IconSizeStep = keyof typeof ICON_SIZE;
