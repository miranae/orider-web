/**
 * 타이포그래피 토큰 — 웹 단일 진실원.
 *
 * 앱(KMP) `OriderTypeTokens.kt` 와 의미 단위 정합.
 * 사이즈는 px (앱 sp/pt 1:1 매핑은 아니지만 비례 유지).
 *
 * 패밀리:
 * - 본문: Pretendard Variable (CJK 우선)
 * - 수치: JetBrains Mono (tnum, zero)
 */
export type FontWeight = 400 | 500 | 600 | 700;

export interface TypeToken {
  size: number;        // px
  weight: FontWeight;
  lineHeight?: number; // unitless
  letterSpacing?: string; // 'em' 단위, e.g. '-0.02em'
  mono?: boolean;      // JetBrains Mono 사용 여부
}

export interface TypographyTokens {
  // === 데이터 표시 (4단계 위계) — 앱 dataHero/Large/Medium/Small 정합 ===
  dataHero: TypeToken;    // 라이드 메인 수치 (속도 96)
  dataLarge: TypeToken;   // 48
  dataMedium: TypeToken;  // 32
  dataSmall: TypeToken;   // 20

  // === UI 텍스트 ===
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

export const DEFAULT_TYPOGRAPHY: TypographyTokens = {
  dataHero:   { size: 44, weight: 500, mono: true, letterSpacing: '-0.03em', lineHeight: 1 },
  dataLarge:  { size: 28, weight: 500, mono: true, letterSpacing: '-0.02em', lineHeight: 1 },
  dataMedium: { size: 18, weight: 500, mono: true, letterSpacing: '-0.01em', lineHeight: 1 },
  dataSmall:  { size: 14, weight: 500, mono: true, lineHeight: 1.2 },

  title:      { size: 20, weight: 700, lineHeight: 1.3 },
  subtitle:   { size: 16, weight: 600, lineHeight: 1.4, letterSpacing: '0.015em' },
  bodyLarge:  { size: 16, weight: 500, lineHeight: 1.5 },
  body:       { size: 14, weight: 400, lineHeight: 1.5 },
  bodyMedium: { size: 14, weight: 500, lineHeight: 1.5 },
  bodySmall:  { size: 13, weight: 400, lineHeight: 1.5 },
  caption:    { size: 12, weight: 400, lineHeight: 1.4 },
  label:      { size: 13, weight: 500, lineHeight: 1.3, letterSpacing: '0.05em' },
  status:     { size: 13, weight: 500, lineHeight: 1.3, letterSpacing: '0.05em' },
  eyebrow:    { size: 10, weight: 500, mono: true, letterSpacing: '0.14em' },
};

/** 앱 패리티 — 모바일 컴퓨터 화면 가독성용 큰 데이터 위계. */
export const APP_PARITY_TYPOGRAPHY: TypographyTokens = {
  ...DEFAULT_TYPOGRAPHY,
  dataHero:   { size: 96, weight: 700, mono: true, letterSpacing: '-0.02em', lineHeight: 1 },
  dataLarge:  { size: 48, weight: 600, mono: true, letterSpacing: '-0.01em', lineHeight: 1 },
  dataMedium: { size: 32, weight: 500, mono: true, lineHeight: 1 },
  dataSmall:  { size: 20, weight: 500, mono: true, lineHeight: 1.1 },
};
