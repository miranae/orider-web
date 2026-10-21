/**
 * 타이포그래피 토큰 — 웹 단일 진실원.
 *
 * 크기는 Apple HIG 텍스트 스타일(`HIG_TEXT_SIZE`)을 따른다 — 앱(KMP, Material 3)과는 이름(역할)만 정합하고
 * 크기는 다르다 (본문 웹 17 / 앱 14). 데이터 위계(data*)만 앱 비례를 유지.
 *
 * 패밀리:
 * - 본문: Apple 시스템 글꼴 우선 (운영체제 기본 대체 글꼴)
 * - 수치: SFMono-Regular / 시스템 monospace (tnum)
 */
export type FontWeight = 400 | 500 | 600 | 700;

export interface TypeToken {
  size: number;        // px
  weight: FontWeight;
  lineHeight?: number; // unitless
  letterSpacing?: string; // 'em' 단위, e.g. '-0.02em'
  mono?: boolean;      // 시스템 monospace 사용 여부
}

export interface TypographyTokens {
  // === 데이터 표시 (4단계 위계) — 앱 dataHero/Large/Medium/Small 정합 ===
  dataHero: TypeToken;    // 라이드 메인 수치 (속도 96)
  dataLarge: TypeToken;   // 48
  dataMedium: TypeToken;  // 32
  dataSmall: TypeToken;   // 20

  // === UI 텍스트 ===
  pageTitle: TypeToken;
  title: TypeToken;
  subtitle: TypeToken;
  bodyLarge: TypeToken;
  body: TypeToken;
  bodyMedium: TypeToken;
  bodySmall: TypeToken;
  caption: TypeToken;
  label: TypeToken;
  status: TypeToken;
  eyebrow: TypeToken;     // 웹 고유 — uppercase tracking label
}

/**
 * Apple HIG 텍스트 스타일 (iOS 기본 글자 크기 Large 기준, px = pt).
 * 웹 기본 타이포는 이 표에서만 크기를 가져온다 — 다른 곳에 숫자를 두지 말 것.
 * caption2(11) 는 모바일 접근성 하한(#401, 12px) 아래라 램프에서 쓰지 않는다.
 */
export const HIG_TEXT_SIZE = {
  caption2: 11,
  caption1: 12,
  footnote: 13,
  subheadline: 15,
  callout: 16,
  body: 17,
  title3: 20,
  title2: 22,
  title1: 28,
  largeTitle: 34,
} as const;

const H = HIG_TEXT_SIZE;

/**
 * 일반 크기 램프 — `--fs-*` CSS 변수와 `<Text size>` 의 원천.
 * 단계마다 HIG 스타일 하나에 대응해 단조 증가한다.
 * `design-tokens/orider.tokens.json` 의 정적 `--fs-*` (하이드레이션 전 기본값) 도 이 값과 같아야 한다.
 */
export const FONT_SIZE_RAMP = {
  '2xs': H.caption1,
  xs: H.footnote,
  sm: H.subheadline,
  base: H.callout,
  md: H.body,
  lg: H.title3,
  xl: H.title2,
  '2xl': H.title1,
  '3xl': H.largeTitle,
  '4xl': 40,
  '5xl': 48,
} as const;

export type FontSizeStep = keyof typeof FONT_SIZE_RAMP;

export const DEFAULT_TYPOGRAPHY: TypographyTokens = {
  dataHero:   { size: 44, weight: 500, mono: true, letterSpacing: '-0.03em', lineHeight: 1 },
  dataLarge:  { size: 28, weight: 500, mono: true, letterSpacing: '-0.02em', lineHeight: 1 },
  dataMedium: { size: 18, weight: 500, mono: true, letterSpacing: '-0.01em', lineHeight: 1 },
  dataSmall:  { size: 14, weight: 500, mono: true, lineHeight: 1.2 },

  pageTitle:  { size: H.largeTitle,  weight: 700, lineHeight: 1.2 },
  title:      { size: H.title2,      weight: 700, lineHeight: 1.3 },
  subtitle:   { size: H.body,        weight: 600, lineHeight: 1.35, letterSpacing: '-0.01em' }, // Headline
  bodyLarge:  { size: H.body,        weight: 500, lineHeight: 1.5 },
  body:       { size: H.body,        weight: 400, lineHeight: 1.5 },
  bodyMedium: { size: H.body,        weight: 500, lineHeight: 1.5 },
  bodySmall:  { size: H.subheadline, weight: 400, lineHeight: 1.45 },
  caption:    { size: H.caption1,    weight: 400, lineHeight: 1.4 },
  label:      { size: H.footnote,    weight: 500, lineHeight: 1.3, letterSpacing: '0' },
  status:     { size: H.footnote,    weight: 500, lineHeight: 1.3, letterSpacing: '0' },
  eyebrow:    { size: H.caption1,    weight: 500, mono: true, letterSpacing: '0.14em' }, // 최소 12px (#401)
};

/** 앱 패리티 — 모바일 컴퓨터 화면 가독성용 큰 데이터 위계. */
export const APP_PARITY_TYPOGRAPHY: TypographyTokens = {
  ...DEFAULT_TYPOGRAPHY,
  dataHero:   { size: 96, weight: 700, mono: true, letterSpacing: '-0.02em', lineHeight: 1 },
  dataLarge:  { size: 48, weight: 600, mono: true, letterSpacing: '-0.01em', lineHeight: 1 },
  dataMedium: { size: 32, weight: 500, mono: true, lineHeight: 1 },
  dataSmall:  { size: 20, weight: 500, mono: true, lineHeight: 1.1 },
};
