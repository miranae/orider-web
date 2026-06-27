/**
 * 모바일 앱의 AppSettings / NavigationPreferences를 Web에서 읽고 쓰기 위한 미러 타입.
 *
 * 원본:
 *  - shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/model/Settings.kt
 *  - shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/model/Lap.kt
 *  - shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/model/RideAlert.kt
 *  - shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/model/LayoutConfig.kt
 *  - shared/src/commonMain/kotlin/com/miranae/orider/shared/domain/navigation/NavigationPreferences.kt
 *
 * 직렬화 규약:
 *  - kotlinx.serialization JSON: enum은 entry name 문자열, data class는 필드명 그대로.
 *  - encodeDefaults=true → 모든 필드 명시적으로 출력. ignoreUnknownKeys=true / coerceInputValues=true
 *    이므로 신규 enum 값 / 신규 필드는 다른 클라이언트가 안전하게 무시.
 *  - Web에서도 미지의 키는 보존(passthrough)할 것 — 다른 플랫폼이 추가한 필드를 지우지 않기 위함.
 *
 * Firestore 경로:
 *  - users/{uid}/settings/{deviceId}                         ← AppSettings (JSON in `data`)
 *  - users/{uid}/navigation_preferences/{deviceId}           ← NavigationPreferences (JSON in `data`)
 */

// ── Enums ────────────────────────────────────────────────────────────────

export type AppLanguage = 'SYSTEM' | 'KOREAN' | 'ENGLISH';

export type SettingsGroup = 'RIDE_DISPLAY' | 'RECORDS' | 'DEVICE_SYSTEM';

export type SettingsItem =
  | 'SENSOR'
  | 'RIDE'
  | 'DATA_FIELDS'
  | 'MAP'
  | 'NAVIGATION'
  | 'SOUND'
  | 'HISTORY'
  | 'ROUTES'
  | 'SOCIAL'
  | 'CONNECTION'
  | 'DATA_SAVER'
  | 'BATTERY_SAVER'
  | 'ADVANCED'
  | 'APP_INFO';

export type NetworkMode = 'OFFLINE' | 'ANY_NETWORK' | 'WIFI_ONLY';

export type GpsMode = 'HIGH_ACCURACY' | 'BALANCED' | 'OFF';

export type ScreenBrightness = 'SYSTEM' | 'HIGH' | 'HALF';

export type ScreenTimeout = 'ALWAYS_ON' | 'SYSTEM_DEFAULT';

export type PowerMode = 'STANDARD' | 'SAVER' | 'DASHBOARD' | 'CUSTOM';

export type MapType = 'STANDARD' | 'CYCLE' | 'TERRAIN' | 'MAPBOX';

export type AutoLapMode = 'OFF' | 'DISTANCE' | 'TIME';

export type AlertMetric = 'HEART_RATE' | 'POWER' | 'CADENCE' | 'SPEED';

/**
 * 데이터 필드 타입 (LayoutConfig.kt의 DataFieldType과 1:1).
 * 새 값이 추가되면 type union으로 반영하고, 미지의 값은 string으로 fallback 처리.
 */
export type DataFieldType =
  | 'SPEED'
  | 'CADENCE'
  | 'GEAR'
  | 'DISTANCE'
  | 'POWER'
  | 'V_POWER'
  | 'HEART_RATE'
  | 'AVG_SPEED'
  | 'MAX_SPEED'
  | 'TIME'
  | 'CLOCK'
  | 'CALORIES'
  | 'ELEVATION'
  | 'GRADIENT'
  | 'ROUTE_REMAINING'
  | 'TEMPERATURE'
  | 'WIND_SPEED'
  | 'WIND_DIRECTION'
  | 'PRECIPITATION'
  | 'ACTION_CAM_BATTERY'
  | 'ACTION_CAM_REC'
  | 'ACTION_CAM_MODE'
  | 'ACTION_CAM_PHOTO'
  | 'ACTION_CAM_RECORD'
  | 'RADAR'
  | 'PEAK_TORQUE_ANGLE'
  | 'POWER_PHASE'
  | 'POWER_PHASE_ARC'
  | 'TORQUE_EFFECTIVENESS'
  | 'MAX_FORCE'
  | 'CRANK_CADENCE'
  | 'VAM'
  | 'AVG_POWER'
  | 'MAX_POWER'
  | 'AVG_CADENCE'
  | 'MAX_CADENCE'
  | 'AVG_HR'
  | 'MAX_HR'
  | 'TOTAL_ASCENT'
  | 'LAP_NUMBER'
  | 'LAP_DISTANCE'
  | 'LAP_TIME'
  | 'LAST_LAP_TIME'
  | 'LAST_LAP_AVG_SPEED'
  | 'RADAR_THREAT'
  | 'RADAR_VEHICLE_COUNT'
  | 'RADAR_CLOSEST_DISTANCE'
  | 'RADAR_APPROACH_SPEED'
  | 'GEAR_RATIO'
  | 'GEAR_BATTERY'
  | 'PEDAL_BALANCE'
  | 'TOTAL_ENERGY'
  | 'HR_ZONE'
  | 'POWER_ZONE'
  | 'CADENCE_ZONE'
  | 'HUMIDITY'
  | 'WEATHER_CODE'
  | 'AVG_SPEED_5MIN'
  | 'SPEED_VS_AVG'
  | 'TOTAL_DESCENT'
  | 'STOPPED_TIME'
  | 'ELAPSED_TIME'
  | 'NP'
  | 'IF_FACTOR'
  | 'TSS'
  | 'POWER_3S'
  | 'POWER_10S'
  | 'POWER_30S'
  | 'SHIFT_COUNT'
  | 'CROSS_CHAIN'
  | 'PHONE_BATTERY'
  | 'GPS_ACCURACY'
  | 'HEADING'
  | 'SUNRISE'
  | 'SUNSET'
  | 'RADAR_TOTAL_VEHICLES'
  | 'ROUTE_REMAINING_ASCENT'
  | 'ETA'
  | 'WBAL'
  | 'WBAL_PERCENT'
  | 'CLIMB_DISTANCE_REMAINING'
  | 'CLIMB_ELEVATION_REMAINING'
  | 'CLIMB_GRADIENT'
  | 'CLIMB_CATEGORY'
  | 'CLIMB_PROGRESS'
  | 'CLIMB_NAME'
  | 'NEXT_CLIMB_DISTANCE'
  | 'NEXT_CLIMB_NAME'
  | 'SEGMENT_TIME_DELTA'
  | 'SEGMENT_PROGRESS'
  | 'SEGMENT_ELAPSED'
  | 'EMPTY';

// ── Nested settings ──────────────────────────────────────────────────────

export interface SoundSettings {
  enabled: boolean;
  startSoundPath: string | null;
  stopSoundPath: string | null;
  lapSoundPath: string | null;
  climbStartSoundPath: string | null;
  climbEndSoundPath: string | null;
  radarSoundPath: string | null;
  /** 0.0 ~ 1.0 */
  volume: number;
}

export interface AlertThreshold {
  metric: AlertMetric;
  enabled: boolean;
  minValue: number | null;
  maxValue: number | null;
}

export interface AlertSettings {
  thresholds: AlertThreshold[];
}

export interface AutoLapConfig {
  mode: AutoLapMode;
  distanceKm: number;
  timeMinutes: number;
}

export interface FieldPlacement {
  type: DataFieldType;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface LayoutConfig {
  columns: number;
  rows: number;
  fields: FieldPlacement[];
}

export interface DataPageConfig {
  pages: LayoutConfig[];
}

// ── AppSettings (Firestore users/{uid}/settings/{deviceId}.data) ─────────

export interface AppSettings {
  wheelCircumferenceMm: number;
  autoPauseSpeedThreshold: number;
  autoPauseDelaySeconds: number;

  // 디바이스별 BLE 주소 — Web에서 편집하지 말 것
  savedSpeedSensorAddress: string | null;
  savedCadenceSensorAddress: string | null;
  savedRadarSensorAddress: string | null;
  savedDi2SensorAddress: string | null;
  savedHrmSensorAddress: string | null;
  savedPowerSensorAddress: string | null;
  savedAxsSensorAddress: string | null;
  savedActionCamAddress: string | null;
  savedActionCamType: string | null;

  virtualPowerEnabled: boolean;
  riderWeightKg: number;
  bikeWeightKg: number;

  dataPageConfig: DataPageConfig;

  useSimulationMode: boolean;
  sensorDataLogging: boolean;

  soundSettings: SoundSettings;

  mapType: MapType;
  headingLockEnabled: boolean;

  language: AppLanguage;
  settingsOrder: SettingsItem[];

  mapTileNetworkMode: NetworkMode;
  weatherNetworkMode: NetworkMode;
  locationSharingNetworkMode: NetworkMode;
  stravaUploadNetworkMode: NetworkMode;

  powerMode: PowerMode;
  gpsMode: GpsMode;

  screenBrightness: ScreenBrightness;
  screenTimeout: ScreenTimeout;

  ftpWatts: number;
  maxHeartRate: number;

  alertSettings: AlertSettings;
  dynamicZoomEnabled: boolean;
  autoLapConfig: AutoLapConfig;
}

// ── NavigationPreferences ────────────────────────────────────────────────

export type RoutingBikeProfile = 'ROAD' | 'GRAVEL' | 'MTB' | 'CITY';

export type VoiceLocale = 'KO' | 'EN' | 'JA';

export type PromptLevel = 'MINIMAL' | 'STANDARD' | 'VERBOSE';

export interface VoiceSettings {
  enabled: boolean;
  locale: VoiceLocale;
  promptLevel: PromptLevel;
  speakStreetNames: boolean;
  muteInClimb: boolean;
  /** 0.7 ~ 1.3 */
  speechRate: number;
  /** -0.2 ~ +0.2 */
  volumeOffset: number;
}

export interface NavigationPreferences {
  bikeProfile: RoutingBikeProfile;
  voice: VoiceSettings;
  avoidHighways: boolean;
  hybridBoost: boolean;
  speedAdaptive: boolean;
  autoReroute: boolean;
  returnFab: boolean;
  batteryMode: boolean;
}

// ── Firestore document wrapper ───────────────────────────────────────────

/**
 * users/{uid}/settings/{deviceId} 또는 users/{uid}/navigation_preferences/{deviceId} 문서 모양.
 * data는 AppSettings | NavigationPreferences를 JSON.stringify한 문자열.
 */
export interface DeviceSettingsDocument {
  data: string;
  deviceId: string;
  deviceName: string;
  /** Firestore Timestamp serialized to millis when read via SDK */
  updatedAt: number;
  version: number;
}

// ── Defaults ─────────────────────────────────────────────────────────────

export const DEFAULT_WHEEL_CIRCUMFERENCE_MM = 2136;
export const DEFAULT_AUTO_PAUSE_SPEED = 3.0;
export const DEFAULT_AUTO_PAUSE_DELAY = 3;
export const DEFAULT_RIDER_WEIGHT_KG = 70.0;
export const DEFAULT_BIKE_WEIGHT_KG = 9.0;
export const DEFAULT_FTP_WATTS = 200;
export const DEFAULT_MAX_HEART_RATE = 190;

export const WHEEL_PRESETS: Record<string, number> = {
  '700x23c': 2096,
  '700x25c': 2105,
  '700x28c': 2136,
  '700x32c': 2155,
};

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  startSoundPath: null,
  stopSoundPath: null,
  lapSoundPath: null,
  climbStartSoundPath: null,
  climbEndSoundPath: null,
  radarSoundPath: null,
  volume: 0.8,
};

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  thresholds: [
    { metric: 'HEART_RATE', enabled: false, minValue: null, maxValue: null },
    { metric: 'POWER', enabled: false, minValue: null, maxValue: null },
    { metric: 'CADENCE', enabled: false, minValue: null, maxValue: null },
    { metric: 'SPEED', enabled: false, minValue: null, maxValue: null },
  ],
};

export const DEFAULT_AUTO_LAP_CONFIG: AutoLapConfig = {
  mode: 'OFF',
  distanceKm: 1.0,
  timeMinutes: 5,
};

const DEFAULT_SETTINGS_ORDER: SettingsItem[] = [
  'SENSOR',
  'RIDE',
  'DATA_FIELDS',
  'MAP',
  'NAVIGATION',
  'SOUND',
  'HISTORY',
  'ROUTES',
  'SOCIAL',
  'CONNECTION',
  'DATA_SAVER',
  'BATTERY_SAVER',
  'ADVANCED',
  'APP_INFO',
];

/**
 * speedTopPage(fields): 속도(4열 2행) + fields를 2열 1행씩 배치.
 * App의 DataPageConfig.speedTopPage와 동일한 알고리즘.
 */
function speedTopPage(fields: DataFieldType[]): LayoutConfig {
  const placements: FieldPlacement[] = [
    { type: 'SPEED', col: 0, row: 0, colSpan: 4, rowSpan: 2 },
  ];
  let col = 0;
  let row = 2;
  for (const type of fields) {
    placements.push({ type, col, row, colSpan: 2, rowSpan: 1 });
    col += 2;
    if (col >= 4) {
      col = 0;
      row += 1;
    }
  }
  return { columns: 4, rows: 8, fields: placements };
}

export const DEFAULT_TOURING_PAGES: LayoutConfig[] = [
  speedTopPage([
    'CADENCE', 'GEAR',
    'DISTANCE', 'AVG_SPEED',
    'TIME', 'CLOCK',
    'ELEVATION', 'GRADIENT',
    'TEMPERATURE', 'WIND_SPEED',
  ]),
  speedTopPage([
    'POWER', 'HEART_RATE',
    'V_POWER', 'CALORIES',
  ]),
  speedTopPage([
    'TEMPERATURE', 'WIND_SPEED',
    'WIND_DIRECTION', 'ROUTE_REMAINING',
  ]),
];

export const DEFAULT_DATA_PAGE_CONFIG: DataPageConfig = {
  pages: DEFAULT_TOURING_PAGES,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  wheelCircumferenceMm: DEFAULT_WHEEL_CIRCUMFERENCE_MM,
  autoPauseSpeedThreshold: DEFAULT_AUTO_PAUSE_SPEED,
  autoPauseDelaySeconds: DEFAULT_AUTO_PAUSE_DELAY,
  savedSpeedSensorAddress: null,
  savedCadenceSensorAddress: null,
  savedRadarSensorAddress: null,
  savedDi2SensorAddress: null,
  savedHrmSensorAddress: null,
  savedPowerSensorAddress: null,
  savedAxsSensorAddress: null,
  savedActionCamAddress: null,
  savedActionCamType: null,
  virtualPowerEnabled: false,
  riderWeightKg: DEFAULT_RIDER_WEIGHT_KG,
  bikeWeightKg: DEFAULT_BIKE_WEIGHT_KG,
  dataPageConfig: DEFAULT_DATA_PAGE_CONFIG,
  useSimulationMode: false,
  sensorDataLogging: false,
  soundSettings: DEFAULT_SOUND_SETTINGS,
  mapType: 'STANDARD',
  headingLockEnabled: false,
  language: 'SYSTEM',
  settingsOrder: DEFAULT_SETTINGS_ORDER,
  mapTileNetworkMode: 'ANY_NETWORK',
  weatherNetworkMode: 'ANY_NETWORK',
  locationSharingNetworkMode: 'ANY_NETWORK',
  stravaUploadNetworkMode: 'WIFI_ONLY',
  powerMode: 'STANDARD',
  gpsMode: 'HIGH_ACCURACY',
  screenBrightness: 'SYSTEM',
  screenTimeout: 'ALWAYS_ON',
  ftpWatts: DEFAULT_FTP_WATTS,
  maxHeartRate: DEFAULT_MAX_HEART_RATE,
  alertSettings: DEFAULT_ALERT_SETTINGS,
  dynamicZoomEnabled: true,
  autoLapConfig: DEFAULT_AUTO_LAP_CONFIG,
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  locale: 'KO',
  promptLevel: 'STANDARD',
  speakStreetNames: true,
  muteInClimb: false,
  speechRate: 1.0,
  volumeOffset: 0.0,
};

export const DEFAULT_NAVIGATION_PREFERENCES: NavigationPreferences = {
  bikeProfile: 'ROAD',
  voice: DEFAULT_VOICE_SETTINGS,
  avoidHighways: true,
  hybridBoost: false,
  speedAdaptive: true,
  autoReroute: false,
  returnFab: true,
  batteryMode: false,
};

// ── Parse / serialize helpers ────────────────────────────────────────────

function plainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Firestore 문서의 `data` 문자열을 AppSettings로 파싱.
 * - top-level: raw가 default를 덮어씀 (미지의 키는 보존됨)
 * - nested 객체(soundSettings/alertSettings/autoLapConfig/dataPageConfig)는 default와
 *   shallow merge하여, 다른 플랫폼이 추가한 nested 필드도 default 보충 후 보존.
 */
export function parseAppSettings(jsonStr: string): AppSettings & Record<string, unknown> {
  const raw = JSON.parse(jsonStr) as Record<string, unknown>;
  const sound = plainObject(raw.soundSettings);
  const alert = plainObject(raw.alertSettings);
  const autoLap = plainObject(raw.autoLapConfig);
  const dataPage = plainObject(raw.dataPageConfig);

  const merged: AppSettings & Record<string, unknown> = {
    ...DEFAULT_APP_SETTINGS,
    ...raw,
    soundSettings: { ...DEFAULT_SOUND_SETTINGS, ...(sound ?? {}) } as SoundSettings,
    alertSettings: alert
      ? ({
          ...DEFAULT_ALERT_SETTINGS,
          ...alert,
          thresholds: Array.isArray(alert.thresholds)
            ? (alert.thresholds as AlertThreshold[])
            : DEFAULT_ALERT_SETTINGS.thresholds,
        } as AlertSettings)
      : DEFAULT_ALERT_SETTINGS,
    autoLapConfig: { ...DEFAULT_AUTO_LAP_CONFIG, ...(autoLap ?? {}) } as AutoLapConfig,
    dataPageConfig: dataPage
      ? ({
          ...DEFAULT_DATA_PAGE_CONFIG,
          ...dataPage,
          pages: Array.isArray(dataPage.pages)
            ? (dataPage.pages as LayoutConfig[])
            : DEFAULT_DATA_PAGE_CONFIG.pages,
        } as DataPageConfig)
      : DEFAULT_DATA_PAGE_CONFIG,
  };
  return merged;
}

export function parseNavigationPreferences(
  jsonStr: string,
): NavigationPreferences & Record<string, unknown> {
  const raw = JSON.parse(jsonStr) as Record<string, unknown>;
  const voice = plainObject(raw.voice);
  return {
    ...DEFAULT_NAVIGATION_PREFERENCES,
    ...raw,
    voice: { ...DEFAULT_VOICE_SETTINGS, ...(voice ?? {}) } as VoiceSettings,
  } as NavigationPreferences & Record<string, unknown>;
}

/**
 * AppSettings(또는 보존된 미지의 키 포함)을 JSON 문자열로 직렬화.
 * Firestore `data` 필드에 그대로 넣을 수 있는 형식.
 */
export function serializeAppSettings(settings: AppSettings & Record<string, unknown>): string {
  return JSON.stringify(settings);
}

export function serializeNavigationPreferences(
  prefs: NavigationPreferences & Record<string, unknown>,
): string {
  return JSON.stringify(prefs);
}

// ── Web에서 편집해도 의미 있는 필드 vs 디바이스 전용 ─────────────────────────

/**
 * 디바이스 단위로만 의미가 있어 Web에서는 편집하면 안 되는 AppSettings 필드.
 * Step 1에서 Web UI로 노출할 때 read-only로 처리하거나 숨김.
 */
export const DEVICE_LOCAL_APP_SETTING_KEYS: ReadonlyArray<keyof AppSettings> = [
  'savedSpeedSensorAddress',
  'savedCadenceSensorAddress',
  'savedRadarSensorAddress',
  'savedDi2SensorAddress',
  'savedHrmSensorAddress',
  'savedPowerSensorAddress',
  'savedAxsSensorAddress',
  'savedActionCamAddress',
  'savedActionCamType',
  'useSimulationMode',
  'sensorDataLogging',
];
