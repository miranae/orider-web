import type { OriderTheme } from '../OriderTheme';
import { APP_PARITY_DIMENS } from '../tokens/dimens';
import { APP_PARITY_TYPOGRAPHY } from '../tokens/typography';

/**
 * 앱 패리티 테마 — 모바일 앱(`OriderColorTokens.kt`) 의 OLED 다크 + Strava Orange 팔레트.
 *
 * 라이트 모드는 정의되지 않은 영역이라 다크 토큰을 라이트 배경으로 미러링한
 * "준라이트" 버전을 제공. 본격적인 라이트 사용은 `default` 테마를 권장.
 *
 * 사용 시점: 모바일 앱과의 시각 패리티가 필요할 때 (예: 그룹 라이브 뷰, 라이딩 컴퓨터
 * 미러링 화면 등). 일반 대시보드에는 `default` 가 더 적합.
 */
export const APP_PARITY_THEME: OriderTheme = {
  id: 'app-parity',
  label: '앱 패리티 (OLED + Teal)',
  labelKey: 'designTheme.appParity',
  typography: APP_PARITY_TYPOGRAPHY,
  dimens: APP_PARITY_DIMENS,
  scheme: {
    dark: {
      colors: {
        background: '#121212',
        surface: '#1A1A1A',
        surfaceVariant: '#242424',
        surfaceElevated: '#2A2A2A',
        surfaceHigh: '#333333',
        divider: '#2A2A2A',
        border: '#333333',
        textPrimary: '#FFFFFF',
        textSecondary: '#B0B0B0',
        textTertiary: '#9E9E9E',
        textQuaternary: '#888888',
        textDisabled: '#666666',
        accent: '#4FD5D1',           // Orider Teal (앱 미러)
        accentDark: '#129390',
        accentLight: '#81EDE8',
        accentSoftBg: 'color-mix(in oklab, #4FD5D1 12%, #1A1A1A)',
        accentSoftBorder: 'color-mix(in oklab, #4FD5D1 30%, transparent)',
        primary: '#4A90E2',
        primaryDark: '#1565C0',
        primaryFg: '#102B2A',
        success: '#4CAF50',
        warning: '#FFA726',
        error: '#EF5350',
        info: '#4A90E2',
        radarSafe: '#2E7D32',
        radarCaution: '#F9A825',
        radarDanger: '#B71C1C',
        brandBike: '#4A90E2',
        brandRun: '#FFA726',
        brandSwim: '#4CAF50',
        zone1: '#4A90E2',
        zone2: '#26A69A',
        zone3: '#9CCC65',
        zone4: '#FFA726',
        zone5: '#EF5350',
      },
      chartColors: {
        speed: '#00E676',
        altitude: '#FF6D00',
        cadence: '#29B6F6',
        heartRate: '#EF5350',
        power: '#AB47BC',
        grid: '#2A2A2A',
        gridAxis: '#3A3A3A',
        gridLabel: '#9E9E9E',
      },
    },
    light: {
      // 앱은 라이트 모드 미정의. 패리티 사용자가 OS 라이트 모드일 때
      // 가독성만 보장하는 변환 — 표면을 흰색 계열, 잉크를 다크로 반전.
      colors: {
        background: '#FAFAFA',
        surface: '#FFFFFF',
        surfaceVariant: '#F5F5F5',
        surfaceElevated: '#EEEEEE',
        surfaceHigh: '#E0E0E0',
        divider: '#E0E0E0',
        border: '#CCCCCC',
        textPrimary: '#121212',
        textSecondary: '#333333',
        textTertiary: '#555555',
        textQuaternary: '#777777',
        textDisabled: '#AAAAAA',
        accent: '#008986',
        accentDark: '#006F6C',
        accentLight: '#42B2AE',
        accentSoftBg: 'color-mix(in oklab, #008986 8%, #FFFFFF)',
        accentSoftBorder: 'color-mix(in oklab, #008986 25%, #E0E0E0)',
        primary: '#1565C0',
        primaryDark: '#0D47A1',
        primaryFg: '#FFFFFF',
        success: '#2E7D32',
        warning: '#E65100',
        error: '#B71C1C',
        info: '#1565C0',
        radarSafe: '#2E7D32',
        radarCaution: '#F9A825',
        radarDanger: '#B71C1C',
        brandBike: '#1565C0',
        brandRun: '#E65100',
        brandSwim: '#2E7D32',
        zone1: '#1565C0',
        zone2: '#00897B',
        zone3: '#689F38',
        zone4: '#E65100',
        zone5: '#B71C1C',
      },
      chartColors: {
        speed: '#00C853',
        altitude: '#E65100',
        cadence: '#0277BD',
        heartRate: '#C62828',
        power: '#6A1B9A',
        grid: 'rgba(0, 0, 0, 0.05)',
        gridAxis: 'rgba(0, 0, 0, 0.18)',
        gridLabel: '#555555',
      },
    },
  },
};
