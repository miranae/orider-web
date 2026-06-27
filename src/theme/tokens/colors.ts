/**
 * 색상 토큰 — 웹 단일 진실원.
 *
 * 앱(KMP) `OriderColorTokens.kt` 와 의미 단위 정합. 값은 웹에 맞게 OKLCH 우선,
 * 앱 패리티 테마는 hex 직지정 (앱과 동일한 OLED 다크 + Strava Orange).
 *
 * 본 모듈은 *데이터* 만 정의. CSS 변수 주입은 `OriderThemeProvider` 에서 수행.
 */
export interface ColorTokens {
  // Background (4단계 elevation)
  background: string;       // bg-0
  surface: string;          // bg-1
  surfaceVariant: string;   // bg-2
  surfaceElevated: string;  // bg-3
  surfaceHigh: string;      // bg-4

  // Divider / Border
  divider: string;          // line-soft
  border: string;           // line

  // Text (4단계)
  textPrimary: string;      // ink-0
  textSecondary: string;    // ink-1
  textTertiary: string;     // ink-2
  textQuaternary: string;   // ink-3
  textDisabled: string;     // ink-4

  // Brand / Accent
  accent: string;           // 앱: Strava Orange / 웹: lime
  accentDark: string;
  accentLight: string;
  accentSoftBg: string;
  accentSoftBorder: string;

  // Primary
  primary: string;
  primaryDark: string;
  primaryFg: string;        // 버튼 위 텍스트

  // Status (4종)
  success: string;
  warning: string;
  error: string;
  info: string;             // aqua

  // Radar (3단계 위험도)
  radarSafe: string;
  radarCaution: string;
  radarDanger: string;

  // Brand discipline (3종)
  brandBike: string;
  brandRun: string;
  brandSwim: string;

  // Training zones (5단계)
  zone1: string;
  zone2: string;
  zone3: string;
  zone4: string;
  zone5: string;
}

export interface ChartColorTokens {
  speed: string;
  altitude: string;
  cadence: string;
  heartRate: string;
  power: string;
  grid: string;          // 미세 격자
  gridAxis: string;      // 축
  gridLabel: string;
}
