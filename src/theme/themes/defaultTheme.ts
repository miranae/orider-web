import type { OriderTheme } from '../OriderTheme';
import { DEFAULT_DIMENS } from '../tokens/dimens';
import { DEFAULT_TYPOGRAPHY } from '../tokens/typography';

/**
 * 기본 테마 — 기존 `index.css` 의 OKLCH 라이트/다크 토큰을 그대로 코드화.
 *
 * 변경 시 `index.css` 의 `:root` 및 `:root[data-theme="dark"]` 블록도 동기화 필요
 * (FOUC 방지용 인라인 스크립트가 CSS 변수를 직접 읽기 때문).
 *
 * 자세한 변환 매핑은 `OriderThemeProvider` 의 `applyVariantToRoot` 참조.
 */
export const DEFAULT_THEME: OriderTheme = {
  id: 'default',
  label: '기본',
  labelKey: 'designTheme.default',
  typography: DEFAULT_TYPOGRAPHY,
  dimens: DEFAULT_DIMENS,
  scheme: {
    light: {
      colors: {
        // 2026-05-25 refresh: light variant 도 살짝 따뜻한 (warm-tinted) 그레이로 통일.
        // surface 는 순백 대신 0.005 만큼 회색 — 눈에 더 부드러움.
        background: 'oklch(0.98 0.004 85)',
        surface: 'oklch(0.995 0.002 85)',
        surfaceVariant: 'oklch(0.96 0.005 85)',
        surfaceElevated: 'oklch(0.93 0.006 85)',
        surfaceHigh: 'oklch(0.89 0.007 85)',
        divider: 'oklch(0.91 0.006 85)',
        border: 'oklch(0.855 0.007 85)',
        textPrimary: 'oklch(0.18 0.010 240)',
        textSecondary: 'oklch(0.28 0.010 240)',
        textTertiary: 'oklch(0.45 0.010 240)',
        textQuaternary: 'oklch(0.55 0.009 240)',
        textDisabled: 'oklch(0.65 0.008 240)',
        accent: 'oklch(0.56 0.115 192)',          // teal (Orider 브랜드)
        accentDark: 'oklch(0.48 0.10 192)',
        accentLight: 'oklch(0.70 0.10 192)',
        accentSoftBg: 'color-mix(in oklch, oklch(0.56 0.115 192) 8%, oklch(0.965 0.004 90))',
        accentSoftBorder: 'color-mix(in oklch, oklch(0.56 0.115 192) 25%, oklch(0.915 0.005 90))',
        primary: 'oklch(0.56 0.115 192)',
        primaryDark: 'oklch(0.48 0.10 192)',
        primaryFg: 'oklch(0.99 0.005 90)',
        success: 'oklch(0.58 0.15 144)',   // 초록 (앱 #4CAF50 정합, 브랜드 청록과 분리)
        warning: 'oklch(0.66 0.15 75)',
        error: 'oklch(0.58 0.17 20)',
        info: 'oklch(0.55 0.13 210)',
        radarSafe: 'oklch(0.62 0.17 130)',
        radarCaution: 'oklch(0.66 0.15 75)',
        radarDanger: 'oklch(0.58 0.17 20)',
        brandBike: 'oklch(0.55 0.13 210)',
        brandRun: 'oklch(0.66 0.15 75)',
        brandSwim: 'oklch(0.62 0.17 130)',
        zone1: 'oklch(0.62 0.07 230)',
        zone2: 'oklch(0.62 0.12 170)',
        zone3: 'oklch(0.65 0.16 130)',
        zone4: 'oklch(0.66 0.15 75)',
        zone5: 'oklch(0.58 0.17 20)',
      },
      chartColors: {
        speed: 'oklch(0.62 0.17 130)',
        altitude: 'oklch(0.66 0.15 75)',
        cadence: 'oklch(0.55 0.13 210)',
        heartRate: 'oklch(0.58 0.17 20)',
        power: 'oklch(0.55 0.16 285)',
        grid: 'rgba(0, 0, 0, 0.05)',
        gridAxis: 'rgba(0, 0, 0, 0.18)',
        gridLabel: 'oklch(0.45 0.010 240)',
      },
    },
    dark: {
      colors: {
        // 2026-05-25 refresh: surface 단계 각 -0.02 L (조금 더 깊은 다크) +
        // hue 240 → 250 (살짝 더 푸른 그레이, 차가운 인상). 콘트라스트 동일 유지.
        background: 'oklch(0.13 0.007 250)',
        surface: 'oklch(0.165 0.008 250)',
        surfaceVariant: 'oklch(0.195 0.009 250)',
        surfaceElevated: 'oklch(0.235 0.010 250)',
        surfaceHigh: 'oklch(0.28 0.011 250)',
        divider: 'oklch(0.24 0.010 250)',
        border: 'oklch(0.30 0.011 250)',
        textPrimary: 'oklch(0.97 0.005 90)',
        textSecondary: 'oklch(0.88 0.006 90)',
        textTertiary: 'oklch(0.70 0.008 90)',
        textQuaternary: 'oklch(0.55 0.009 90)',
        textDisabled: 'oklch(0.42 0.009 90)',
        accent: 'oklch(0.80 0.115 192)',
        accentDark: 'oklch(0.60 0.10 192)',
        accentLight: 'oklch(0.80 0.115 192)',
        accentSoftBg: 'color-mix(in oklch, oklch(0.80 0.115 192) 8%, oklch(0.215 0.008 240))',
        accentSoftBorder: 'color-mix(in oklch, oklch(0.80 0.115 192) 25%, oklch(0.26 0.009 240))',
        primary: 'oklch(0.80 0.115 192)',
        primaryDark: 'oklch(0.60 0.10 192)',
        primaryFg: 'oklch(0.18 0.03 192)',
        success: 'oklch(0.70 0.16 144)',
        warning: 'oklch(0.80 0.14 75)',
        error: 'oklch(0.72 0.16 20)',
        info: 'oklch(0.78 0.13 210)',
        radarSafe: 'oklch(0.86 0.18 130)',
        radarCaution: 'oklch(0.80 0.14 75)',
        radarDanger: 'oklch(0.72 0.16 20)',
        brandBike: 'oklch(0.78 0.13 210)',
        brandRun: 'oklch(0.80 0.14 75)',
        brandSwim: 'oklch(0.86 0.18 130)',
        zone1: 'oklch(0.72 0.05 230)',
        zone2: 'oklch(0.74 0.10 170)',
        zone3: 'oklch(0.80 0.14 130)',
        zone4: 'oklch(0.80 0.14 75)',
        zone5: 'oklch(0.72 0.16 20)',
      },
      chartColors: {
        speed: 'oklch(0.86 0.18 130)',
        altitude: 'oklch(0.80 0.14 75)',
        cadence: 'oklch(0.78 0.13 210)',
        heartRate: 'oklch(0.72 0.16 20)',
        power: 'oklch(0.70 0.14 285)',
        grid: 'rgba(255, 255, 255, 0.06)',
        gridAxis: 'rgba(255, 255, 255, 0.14)',
        gridLabel: 'oklch(0.70 0.008 90)',
      },
    },
  },
};
