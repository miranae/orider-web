/**
 * AppSettings / NavigationPreferences 의 Zod 런타임 검증 + 필드 분류.
 *
 * 두 가지 목적:
 *  1. 검증: 알 수 없는 enum / 범위 밖 숫자 / 잘못된 타입을 안전하게 거부하거나 default 로 폴백.
 *  2. 분류: 어떤 필드가 디바이스 고유(per-device)이고 어떤 게 사용자 전체(user-scoped)인지 명시.
 *     → 웹에서 "이 디바이스만" vs "내 모든 디바이스" 액션을 구분할 수 있는 진실 소스.
 *
 * 원본 모델: mobile app shared settings model.
 * 새 필드 추가 시: 원본 추가 → 여기 schema/classification 동시에 보강 → 미분류 필드는
 * `assertClassificationCovered()` 가 빌드 시점에 잡는다.
 */

import { z } from "zod";

import type {
  AppLanguage,
  AppSettings,
  GpsMode,
  MapType,
  NetworkMode,
  PowerMode,
  ScreenBrightness,
  ScreenTimeout,
  SettingsItem,
} from "@shared/types/deviceSettings";

// ── 0. 헬퍼: 모르는 enum 값은 default 로 흡수 ──────────────────────────────

/**
 * 미래 클라가 새 enum 값을 추가했을 때 구버전이 sync 실패하지 않도록
 * 알 수 없는 문자열을 default 로 폴백 (Kotlin `coerceInputValues=true` 와 정합).
 */
function enumWithFallback<T extends [string, ...string[]]>(
  values: T,
  fallback: T[number],
) {
  // 어떤 입력이든(undefined / null / number / 알 수 없는 string) fallback 으로 정규화한 뒤
  // z.enum 으로 안전하게 통과. Kotlin `coerceInputValues=true` 와 동일한 정신.
  return z.preprocess(
    (v: unknown) => (typeof v === "string" && values.includes(v as T[number]) ? v : fallback),
    z.enum(values),
  );
}

// ── 1. Enums ─────────────────────────────────────────────────────────────

export const AppLanguageSchema = enumWithFallback(
  ["SYSTEM", "KOREAN", "ENGLISH"] as const,
  "SYSTEM",
) satisfies z.ZodType<AppLanguage>;

export const NetworkModeSchema = enumWithFallback(
  ["OFFLINE", "ANY_NETWORK", "WIFI_ONLY"] as const,
  "ANY_NETWORK",
) satisfies z.ZodType<NetworkMode>;

export const GpsModeSchema = enumWithFallback(
  ["HIGH_ACCURACY", "BALANCED", "OFF"] as const,
  "HIGH_ACCURACY",
) satisfies z.ZodType<GpsMode>;

export const ScreenBrightnessSchema = enumWithFallback(
  ["SYSTEM", "HIGH", "HALF"] as const,
  "SYSTEM",
) satisfies z.ZodType<ScreenBrightness>;

export const ScreenTimeoutSchema = enumWithFallback(
  ["ALWAYS_ON", "SYSTEM_DEFAULT"] as const,
  "ALWAYS_ON",
) satisfies z.ZodType<ScreenTimeout>;

export const PowerModeSchema = enumWithFallback(
  ["STANDARD", "SAVER", "DASHBOARD", "CUSTOM"] as const,
  "STANDARD",
) satisfies z.ZodType<PowerMode>;

export const MapTypeSchema = enumWithFallback(
  ["STANDARD", "CYCLE", "TERRAIN", "MAPBOX"] as const,
  "STANDARD",
) satisfies z.ZodType<MapType>;

const SettingsItemValues = [
  "SENSOR",
  "RIDE",
  "DATA_FIELDS",
  "MAP",
  "NAVIGATION",
  "SOUND",
  "HISTORY",
  "ROUTES",
  "SOCIAL",
  "CONNECTION",
  "DATA_SAVER",
  "BATTERY_SAVER",
  "ADVANCED",
  "APP_INFO",
] as const;

/**
 * SettingsItem 은 array (settingsOrder) 안에 들어가므로, 알 수 없는 값을 만나면
 * 떨어뜨리지 않고 그대로 string 으로 보존한다 — 다른 플랫폼이 새 SettingsItem 을
 * 추가했을 때 round-trip 손실 방지 (`.catchall(z.unknown())` 와 같은 정신).
 */
export const SettingsItemSchema = z
  .union([z.enum(SettingsItemValues), z.string()])
  .transform((v: SettingsItem | string): SettingsItem | string => v);

const AutoLapModeSchema = enumWithFallback(["OFF", "DISTANCE", "TIME"] as const, "OFF");
const AlertMetricSchema = z.enum(["HEART_RATE", "POWER", "CADENCE", "SPEED"]);

// ── 2. Nested objects ─────────────────────────────────────────────────────

export const SoundSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    startSoundPath: z.string().nullable().default(null),
    stopSoundPath: z.string().nullable().default(null),
    lapSoundPath: z.string().nullable().default(null),
    climbStartSoundPath: z.string().nullable().default(null),
    climbEndSoundPath: z.string().nullable().default(null),
    radarSoundPath: z.string().nullable().default(null),
    volume: z.number().min(0).max(1).default(0.8),
  })
  .catchall(z.unknown());

export const AlertThresholdSchema = z
  .object({
    metric: AlertMetricSchema,
    enabled: z.boolean().default(false),
    minValue: z.number().int().nullable().default(null),
    maxValue: z.number().int().nullable().default(null),
  })
  .catchall(z.unknown());

export const AlertSettingsSchema = z
  .object({
    thresholds: z.array(AlertThresholdSchema).default([]),
  })
  .catchall(z.unknown());

export const AutoLapConfigSchema = z
  .object({
    mode: AutoLapModeSchema,
    distanceKm: z.number().min(0.1).max(100).default(1.0),
    timeMinutes: z.number().int().min(1).max(180).default(5),
  })
  .catchall(z.unknown());

const FieldPlacementSchema = z
  .object({
    type: z.string(), // DataFieldType — 화이트리스트는 매우 길고 자주 추가되므로 string 으로 받고 미지의 값은 보존
    col: z.number().int().min(0),
    row: z.number().int().min(0),
    colSpan: z.number().int().min(1),
    rowSpan: z.number().int().min(1),
  })
  .catchall(z.unknown());

const LayoutConfigSchema = z
  .object({
    columns: z.number().int().min(1).default(4),
    rows: z.number().int().min(1).default(8),
    fields: z.array(FieldPlacementSchema).default([]),
  })
  .catchall(z.unknown());

export const DataPageConfigSchema = z
  .object({
    pages: z.array(LayoutConfigSchema).default([]),
  })
  .catchall(z.unknown());

// ── 3. AppSettings 전체 ────────────────────────────────────────────────────

export const AppSettingsSchema = z
  .object({
    // 라이더 / 자전거
    wheelCircumferenceMm: z.number().int().min(1000).max(3000).default(2136),
    riderWeightKg: z.number().min(20).max(300).default(70),
    bikeWeightKg: z.number().min(1).max(100).default(9),
    virtualPowerEnabled: z.boolean().default(false),
    ftpWatts: z.number().int().min(50).max(2000).default(200),
    maxHeartRate: z.number().int().min(50).max(250).default(190),

    // 주행 동작
    autoPauseSpeedThreshold: z.number().min(0).max(30).default(2.5),
    autoPauseDelaySeconds: z.number().int().min(0).max(60).default(5),
    dynamicZoomEnabled: z.boolean().default(true),
    headingLockEnabled: z.boolean().default(false),

    // 센서 BLE 주소 (디바이스 페어링 결과)
    savedSpeedSensorAddress: z.string().nullable().default(null),
    savedCadenceSensorAddress: z.string().nullable().default(null),
    savedRadarSensorAddress: z.string().nullable().default(null),
    savedDi2SensorAddress: z.string().nullable().default(null),
    savedHrmSensorAddress: z.string().nullable().default(null),
    savedPowerSensorAddress: z.string().nullable().default(null),
    savedAxsSensorAddress: z.string().nullable().default(null),
    savedActionCamAddress: z.string().nullable().default(null),
    savedActionCamType: z.string().nullable().default(null),

    // 디버그
    useSimulationMode: z.boolean().default(false),
    sensorDataLogging: z.boolean().default(false),

    // 디스플레이
    mapType: MapTypeSchema,
    language: AppLanguageSchema,
    // 알 수 없는 SettingsItem 값도 보존 — 미래 platform 이 추가한 항목이 round-trip 에서
    // 사라지지 않도록.
    settingsOrder: z.array(SettingsItemSchema).default([]),

    // 네트워크 모드
    mapTileNetworkMode: NetworkModeSchema,
    weatherNetworkMode: NetworkModeSchema,
    locationSharingNetworkMode: NetworkModeSchema,
    stravaUploadNetworkMode: NetworkModeSchema,

    // 디바이스 전력/화면
    powerMode: PowerModeSchema,
    gpsMode: GpsModeSchema,
    screenBrightness: ScreenBrightnessSchema,
    screenTimeout: ScreenTimeoutSchema,

    // 중첩 객체 — 누락 시 nested schema 의 default 만으로 구성된 객체로 폴백
    soundSettings: z
      .preprocess((v: unknown) => v ?? SoundSettingsSchema.parse({}), SoundSettingsSchema),
    alertSettings: z
      .preprocess((v: unknown) => v ?? AlertSettingsSchema.parse({}), AlertSettingsSchema),
    autoLapConfig: z
      .preprocess((v: unknown) => v ?? AutoLapConfigSchema.parse({}), AutoLapConfigSchema),
    dataPageConfig: z
      .preprocess((v: unknown) => v ?? DataPageConfigSchema.parse({}), DataPageConfigSchema),
  })
  .catchall(z.unknown()); // 미지의 새 필드 보존 — 다른 플랫폼이 추가한 필드를 지우지 않기 위함

export type ValidatedAppSettings = z.infer<typeof AppSettingsSchema>;

// ── 4. 필드 분류 ──────────────────────────────────────────────────────────

export type FieldScope =
  /** 사람/계정 단위 속성 — 모든 디바이스에서 동일해야 자연스러움 */
  | "user"
  /** 디바이스 하드웨어/페어링 종속 — 디바이스마다 다른 게 맞음 */
  | "device"
  /** 분기 가능 — 현재는 디바이스별로 두지만 사용자 선택으로 sync 가능 */
  | "mixed";

export type WebEditability =
  /** 웹 UI에서 자유롭게 편집 */
  | "editable"
  /** 표시만 가능 (디버그 토글이거나 디바이스 페어링 같은 디바이스 액션 결과) */
  | "read-only"
  /** 웹에서 의미 없음 — 숨김 (디바이스 로컬 파일 경로 등) */
  | "hidden";

export interface FieldClassification {
  scope: FieldScope;
  web: WebEditability;
  /** 분류 근거 — 향후 재분류 결정 시 참고 */
  reason: string;
}

/**
 * sub-tree 분기가 균일하지 않은 객체에 대한 점 표기 키.
 * 새 sub-tree 분기 추가 시 여기에 등록 → APP_SETTINGS_CLASSIFICATION 가 누락 시 tsc 가 잡음.
 */
export type SoundSettingsLeafKey =
  | "soundSettings.enabled"
  | "soundSettings.volume"
  | "soundSettings.startSoundPath"
  | "soundSettings.stopSoundPath"
  | "soundSettings.lapSoundPath"
  | "soundSettings.climbStartSoundPath"
  | "soundSettings.climbEndSoundPath"
  | "soundSettings.radarSoundPath";

export type ClassificationKey = keyof AppSettings | SoundSettingsLeafKey;

/**
 * AppSettings 의 모든 top-level 키 + soundSettings sub-tree 의 mixed leaf 키 → 분류.
 * - 타입이 `Record<ClassificationKey, FieldClassification>` 이라 AppSettings 에 새 키가
 *   추가되거나 SoundSettingsLeafKey 가 확장되면 누락된 엔트리에 대해 tsc 가 컴파일 실패.
 * - 분류가 sub-tree 안에서 균질하면 부모 키 한 번만 적는다 (예: dataPageConfig).
 */
export const APP_SETTINGS_CLASSIFICATION: Record<ClassificationKey, FieldClassification> = {
  // ── 사람 임계값 / 신체 / 사용자 선호 (USER) ────────────────────────
  ftpWatts: {
    scope: "user",
    web: "editable",
    reason: "사람의 임계 파워 — 디바이스가 바뀌어도 동일.",
  },
  maxHeartRate: {
    scope: "user",
    web: "editable",
    reason: "사람의 최대 심박 — 디바이스가 바뀌어도 동일.",
  },
  riderWeightKg: {
    scope: "user",
    web: "editable",
    reason: "사람 체중. BikeProfile 의 riderWeightKg 와도 sync 됨.",
  },
  bikeWeightKg: {
    scope: "user",
    web: "editable",
    reason: "활성 자전거 무게 — BikeProfile 컬렉션의 legacy mirror.",
  },
  wheelCircumferenceMm: {
    scope: "user",
    web: "editable",
    reason: "활성 자전거 휠 둘레 — BikeProfile 컬렉션의 legacy mirror.",
  },
  virtualPowerEnabled: {
    scope: "user",
    web: "editable",
    reason: "가상 파워 추정 사용 여부 — 사용자 선호.",
  },
  language: {
    scope: "user",
    web: "editable",
    reason: "앱 언어 — 사용자 단위.",
  },
  mapType: {
    scope: "user",
    web: "editable",
    reason: "선호하는 지도 타일 종류 — 사용자 단위.",
  },
  headingLockEnabled: {
    scope: "user",
    web: "editable",
    reason: "지도 회전 잠금 — 사용자 선호.",
  },
  dynamicZoomEnabled: {
    scope: "user",
    web: "editable",
    reason: "속도 기반 자동 줌 — 사용자 선호.",
  },
  autoPauseSpeedThreshold: {
    scope: "user",
    web: "editable",
    reason: "Auto-pause 임계 — 사용자 주행 스타일 선호.",
  },
  autoPauseDelaySeconds: {
    scope: "user",
    web: "editable",
    reason: "Auto-pause 지연 — 사용자 선호.",
  },
  weatherNetworkMode: {
    scope: "user",
    web: "editable",
    reason: "날씨 요청 네트워크 정책 — 사용자 데이터 정책 선호.",
  },
  locationSharingNetworkMode: {
    scope: "user",
    web: "editable",
    reason: "위치 공유 네트워크 정책 — 사용자 선호.",
  },
  stravaUploadNetworkMode: {
    scope: "user",
    web: "editable",
    reason: "Strava 업로드 네트워크 정책 — 사용자 선호.",
  },
  settingsOrder: {
    scope: "user",
    web: "editable",
    reason: "설정 메뉴 정렬 — 사용자 UI 선호.",
  },
  alertSettings: {
    scope: "user",
    web: "editable",
    reason: "HR/파워/케이던스/속도 알람 임계 — 사용자 트레이닝 선호.",
  },
  autoLapConfig: {
    scope: "user",
    web: "editable",
    reason: "자동 랩 모드/간격 — 사용자 트레이닝 선호.",
  },

  // ── 디바이스 하드웨어 종속 (DEVICE) ─────────────────────────────────
  savedSpeedSensorAddress: {
    scope: "device",
    web: "read-only",
    reason: "BLE 페어링은 디바이스에서만 가능. 웹은 표시/해제만.",
  },
  savedCadenceSensorAddress: {
    scope: "device",
    web: "read-only",
    reason: "BLE 페어링은 디바이스에서만 가능.",
  },
  savedRadarSensorAddress: {
    scope: "device",
    web: "read-only",
    reason: "BLE 페어링은 디바이스에서만 가능.",
  },
  savedDi2SensorAddress: {
    scope: "device",
    web: "read-only",
    reason: "BLE 페어링은 디바이스에서만 가능.",
  },
  savedHrmSensorAddress: {
    scope: "device",
    web: "read-only",
    reason: "BLE 페어링은 디바이스에서만 가능.",
  },
  savedPowerSensorAddress: {
    scope: "device",
    web: "read-only",
    reason: "BLE 페어링은 디바이스에서만 가능.",
  },
  savedAxsSensorAddress: {
    scope: "device",
    web: "read-only",
    reason: "BLE 페어링은 디바이스에서만 가능.",
  },
  savedActionCamAddress: {
    scope: "device",
    web: "read-only",
    reason: "BLE 페어링은 디바이스에서만 가능.",
  },
  savedActionCamType: {
    scope: "device",
    web: "read-only",
    reason: "페어링된 액션캠 타입 — 페어링 결과의 일부.",
  },
  powerMode: {
    scope: "device",
    web: "editable",
    reason: "배터리 절약 프리셋 — 디바이스 배터리 용량/모델 종속.",
  },
  gpsMode: {
    scope: "device",
    web: "editable",
    reason: "GPS 정확도 모드 — 디바이스 GPS 칩셋 능력 종속.",
  },
  screenBrightness: {
    scope: "device",
    web: "editable",
    reason: "화면 밝기 — 디바이스 디스플레이 종속.",
  },
  screenTimeout: {
    scope: "device",
    web: "editable",
    reason: "화면 자동꺼짐 — 디바이스 디스플레이 종속.",
  },
  useSimulationMode: {
    scope: "device",
    web: "read-only",
    reason: "디버그 시뮬레이션 — 그 디바이스에서만 의미.",
  },
  sensorDataLogging: {
    scope: "device",
    web: "read-only",
    reason: "디버그 센서 데이터 로깅 — 그 디바이스에서만 의미.",
  },

  dataPageConfig: {
    scope: "device",
    web: "editable",
    reason: "화면 사이즈/사용 시나리오가 디바이스마다 다를 수 있어 per-device.",
  },

  // ── 분기 가능 (MIXED) — 현재는 디바이스별 ───────────────────────────
  mapTileNetworkMode: {
    scope: "mixed",
    web: "editable",
    reason: "데이터 플랜이 디바이스마다 다를 수 있어 per-device 로 두지만 보통 사용자 선호.",
  },

  // soundSettings 는 sub-key 분기가 mixed — top-level 표시 + 점 표기로 sub-key 분류
  soundSettings: {
    scope: "mixed",
    web: "editable",
    reason: "volume/enabled 는 사용자 선호(user), 사운드 파일 경로는 디바이스 로컬(device). sub-key 별 분류 참조.",
  },

  // ── 중첩 객체 안에서 분기가 다른 경우 — 점 표기 ──────────────────────
  "soundSettings.enabled": {
    scope: "user",
    web: "editable",
    reason: "사운드 ON/OFF — 사용자 선호.",
  },
  "soundSettings.volume": {
    scope: "user",
    web: "editable",
    reason: "볼륨 — 사용자 선호.",
  },
  "soundSettings.startSoundPath": {
    scope: "device",
    web: "hidden",
    reason: "디바이스 로컬 파일 URI — 웹에서 의미 없음.",
  },
  "soundSettings.stopSoundPath": {
    scope: "device",
    web: "hidden",
    reason: "디바이스 로컬 파일 URI.",
  },
  "soundSettings.lapSoundPath": {
    scope: "device",
    web: "hidden",
    reason: "디바이스 로컬 파일 URI.",
  },
  "soundSettings.climbStartSoundPath": {
    scope: "device",
    web: "hidden",
    reason: "디바이스 로컬 파일 URI.",
  },
  "soundSettings.climbEndSoundPath": {
    scope: "device",
    web: "hidden",
    reason: "디바이스 로컬 파일 URI.",
  },
  "soundSettings.radarSoundPath": {
    scope: "device",
    web: "hidden",
    reason: "디바이스 로컬 파일 URI.",
  },
};

/**
 * Top-level AppSettings 필드의 분류를 반환.
 * 중첩 키 (soundSettings.volume 등) 는 직접 인덱싱.
 */
export function classify(path: string): FieldClassification | undefined {
  return (APP_SETTINGS_CLASSIFICATION as Record<string, FieldClassification>)[path];
}

// ── 5. 빌드 타임 보강 + 런타임 안전망 ──────────────────────────────────────

/**
 * Top-level AppSettings 키 배열 — keysByScope/webEditableKeys 등 헬퍼가 반복하는 데
 * 사용. 누락은 `APP_SETTINGS_CLASSIFICATION` 의 `Record<ClassificationKey, ...>` 타입이
 * tsc 에서 잡으므로 여기서는 단순한 array 로 충분.
 */
const APP_SETTINGS_TOP_LEVEL_KEYS = [
  "wheelCircumferenceMm",
  "autoPauseSpeedThreshold",
  "autoPauseDelaySeconds",
  "savedSpeedSensorAddress",
  "savedCadenceSensorAddress",
  "savedRadarSensorAddress",
  "savedDi2SensorAddress",
  "savedHrmSensorAddress",
  "savedPowerSensorAddress",
  "savedAxsSensorAddress",
  "savedActionCamAddress",
  "savedActionCamType",
  "virtualPowerEnabled",
  "riderWeightKg",
  "bikeWeightKg",
  "dataPageConfig",
  "useSimulationMode",
  "sensorDataLogging",
  "soundSettings",
  "mapType",
  "headingLockEnabled",
  "language",
  "settingsOrder",
  "mapTileNetworkMode",
  "weatherNetworkMode",
  "locationSharingNetworkMode",
  "stravaUploadNetworkMode",
  "powerMode",
  "gpsMode",
  "screenBrightness",
  "screenTimeout",
  "ftpWatts",
  "maxHeartRate",
  "alertSettings",
  "dynamicZoomEnabled",
  "autoLapConfig",
] as const satisfies ReadonlyArray<keyof AppSettings>;

// AppSettings 에 새 키가 추가됐는데 위 배열에 없으면 이 const 가 컴파일 실패.
// 컴파일 타임 보강 — `keysByScope` 등 헬퍼가 정확히 모든 키를 순회하도록 보장.
const _ASSERT_TOP_LEVEL_COVERS_APP_SETTINGS: Exclude<
  keyof AppSettings,
  (typeof APP_SETTINGS_TOP_LEVEL_KEYS)[number]
> extends never
  ? true
  : never = true;
void _ASSERT_TOP_LEVEL_COVERS_APP_SETTINGS;

/**
 * 런타임 안전망 — 분류 누락을 단위 테스트에서 잡는다.
 * 컴파일 타임 가드(`Record<ClassificationKey, ...>`)가 일차 방어, 이 함수는 backstop.
 */
export function getMissingClassifications(): string[] {
  const required: ClassificationKey[] = [
    ...APP_SETTINGS_TOP_LEVEL_KEYS,
    "soundSettings.enabled",
    "soundSettings.volume",
    "soundSettings.startSoundPath",
    "soundSettings.stopSoundPath",
    "soundSettings.lapSoundPath",
    "soundSettings.climbStartSoundPath",
    "soundSettings.climbEndSoundPath",
    "soundSettings.radarSoundPath",
  ];
  return required.filter((k) => !APP_SETTINGS_CLASSIFICATION[k]);
}

// ── 6. 분류 기반 헬퍼 ──────────────────────────────────────────────────────

export type ScopeFilter = FieldScope | "any";

/** scope 에 해당하는 top-level 키 집합을 반환. */
export function keysByScope(scope: ScopeFilter): (keyof AppSettings)[] {
  return APP_SETTINGS_TOP_LEVEL_KEYS.filter((k) => {
    if (scope === "any") return true;
    const c = APP_SETTINGS_CLASSIFICATION[k];
    return c?.scope === scope;
  });
}

/** 웹에서 편집 가능한 top-level 키. */
export function webEditableKeys(): (keyof AppSettings)[] {
  return APP_SETTINGS_TOP_LEVEL_KEYS.filter(
    (k) => APP_SETTINGS_CLASSIFICATION[k]?.web === "editable",
  );
}

/**
 * AppSettings 또는 그 patch 에서 user-scoped 필드만 추출.
 * Broadcast (= 모든 디바이스에 적용) 시 사용 — 디바이스 고유 필드는 제외.
 *
 * 중첩 mixed 객체 (현재 soundSettings) 는 sub-key 단위로 user 만 추출하여
 * 부분 객체로 반환. 호출 측에서 대상 디바이스의 기존 soundSettings 에 머지해야
 * 디바이스 로컬 파일 경로를 보존할 수 있다.
 */
export function pickUserScoped(
  source: Partial<AppSettings> & Record<string, unknown>,
): Partial<AppSettings> & Record<string, unknown> {
  const out: Partial<AppSettings> & Record<string, unknown> = {};
  for (const key of keysByScope("user")) {
    if (key in source) (out as Record<string, unknown>)[key] = source[key];
  }
  // soundSettings: user sub-key 만 (enabled, volume).
  // device 로컬 sound path 들은 broadcast 대상이 아니므로 추출하지 않음.
  if (source.soundSettings && typeof source.soundSettings === "object") {
    const sound = source.soundSettings as unknown as Record<string, unknown>;
    const userSound: Record<string, unknown> = {};
    if ("enabled" in sound) userSound.enabled = sound.enabled;
    if ("volume" in sound) userSound.volume = sound.volume;
    if (Object.keys(userSound).length > 0) {
      // 부분 soundSettings — 호출 측에서 target 의 기존 sound 경로와 merge 필요.
      out.soundSettings = userSound as unknown as AppSettings["soundSettings"];
    }
  }
  return out;
}

/**
 * device-scope 디바이스에 user patch 를 적용할 때, soundSettings 의 sub-key 분기를
 * 보존하면서 머지하는 헬퍼.
 *
 * 의미론 (호출 측 계약):
 *  - **top-level user 키**: target 의 해당 key 를 patch 값으로 그대로 대체 (shallow).
 *    `alertSettings` / `autoLapConfig` 처럼 nested user 객체는 **wholesale replace** —
 *    호출 측은 항상 그 객체의 완전한 형태를 patch 에 넣어야 함. 부분 업데이트가 필요하면
 *    호출 측이 `{...target.alertSettings, ...partial}` 로 직접 합쳐서 넘긴다.
 *  - **soundSettings**: 유일한 mixed 분기 객체. target.soundSettings + patch.soundSettings 의
 *    shallow merge 로 디바이스 로컬 파일 경로(`*SoundPath`)를 보존.
 *
 * 이 계약은 `pickUserScoped` 의 출력(상단 키 + soundSettings 의 user sub-key 만) 과 짝을
 * 이루도록 설계됨 — broadcast 호출 측은 보통 `pickUserScoped` 결과를 그대로 넘기면 안전.
 */
export function mergeUserScopedIntoSettings(
  target: AppSettings & Record<string, unknown>,
  patch: Partial<AppSettings> & Record<string, unknown>,
): AppSettings & Record<string, unknown> {
  const next: AppSettings & Record<string, unknown> = { ...target, ...patch };
  if (patch.soundSettings && typeof patch.soundSettings === "object") {
    next.soundSettings = {
      ...target.soundSettings,
      ...(patch.soundSettings as object),
    };
  }
  return next;
}

// ── 7. 검증 함수 (caller-friendly) ─────────────────────────────────────────

export type ValidationResult =
  | { ok: true; value: ValidatedAppSettings & Record<string, unknown> }
  | { ok: false; errors: z.ZodIssue[] };

/**
 * raw 객체를 AppSettings 로 검증.
 * 성공 시: 모든 default 채워지고 알 수 없는 키도 보존됨.
 * 실패 시: ZodIssue 리스트.
 */
export function validateAppSettings(raw: unknown): ValidationResult {
  const parsed = AppSettingsSchema.safeParse(raw);
  if (parsed.success) {
    return {
      ok: true,
      value: parsed.data as ValidatedAppSettings & Record<string, unknown>,
    };
  }
  return { ok: false, errors: parsed.error.issues };
}

/**
 * JSON 문자열에서 직접 검증.
 * Firestore `data` 필드에서 바로 호출 가능.
 */
export function parseAndValidateAppSettings(jsonStr: string): ValidationResult {
  try {
    return validateAppSettings(JSON.parse(jsonStr));
  } catch (e) {
    return {
      ok: false,
      errors: [
        {
          code: "custom",
          path: [],
          message: `JSON parse 실패: ${e instanceof Error ? e.message : String(e)}`,
        } as z.ZodIssue,
      ],
    };
  }
}
