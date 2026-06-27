// web/src/types/bikeProfile.ts
export interface VirtualPowerConfig {
  enabled: boolean;
  /** 2026-05-28: 사용자 explicit OFF 시 true. 이 값만이 OFF 권위.
   *  enabled 는 legacy 호환 + UI bind 용 ("현재 ON 인가") — userDisabled 가 진짜 의도. */
  userDisabled?: boolean;
  riderWeightKg: number;
  bikeWeightKg: number;
  rollingResistance: number;
  cdA: number;
}

export const DEFAULT_VIRTUAL_POWER: VirtualPowerConfig = {
  enabled: true,   // 2026-05-28: 기본 ON. user 가 끄면 userDisabled=true 같이 set.
  userDisabled: false,
  riderWeightKg: 70,
  bikeWeightKg: 9,
  rollingResistance: 0.005,
  cdA: 0.32,
};

export interface ConnectedSensor {
  type: string;
  deviceAddress: string;
  deviceName?: string;
  pairedAt?: number;
  cameraType?: string;
}

export interface BikeProfile {
  id: string;
  name: string;
  wheelCircumferenceMm: number;
  virtualPower: VirtualPowerConfig;
  sensors: ConnectedSensor[];
  createdAt: number;
  updatedAt: number;
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Firestore Timestamp { seconds, nanoseconds } 또는 millis number 모두 처리 */
function timestampToMillis(value: unknown): number {
  if (value && typeof value === "object" && "seconds" in (value as Record<string, unknown>)) {
    const ts = value as { seconds: number; nanoseconds?: number };
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1_000_000);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseSensors(raw: unknown): ConnectedSensor[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const obj = s as Record<string, unknown>;
    const type = obj.type;
    const deviceAddress = obj.deviceAddress;
    if (typeof type !== "string" || typeof deviceAddress !== "string") return [];
    const sensor: ConnectedSensor = { type, deviceAddress };
    if (typeof obj.deviceName === "string") sensor.deviceName = obj.deviceName;
    if (obj.pairedAt !== undefined) sensor.pairedAt = timestampToMillis(obj.pairedAt);
    if (typeof obj.cameraType === "string") sensor.cameraType = obj.cameraType;
    return [sensor];
  });
}

/** Firestore 원시 문서 → BikeProfile (구버전 dragCoefficient 폴백 + 범위 검증) */
export function parseBikeProfile(id: string, raw: Record<string, unknown>): BikeProfile {
  const vp = (raw.virtualPower ?? {}) as Record<string, unknown>;
  const cdARaw = vp.cdA ?? vp.dragCoefficient;
  const cdA = clamp(cdARaw, 0.15, 0.5, DEFAULT_VIRTUAL_POWER.cdA);
  return {
    id,
    name: String(raw.name ?? "내 자전거"),
    wheelCircumferenceMm: Number(raw.wheelCircumferenceMm ?? 2096),
    virtualPower: {
      // 2026-05-28: userDisabled !== true 면 ON. server parseProfile 과 일치.
      enabled: vp.userDisabled !== true,
      userDisabled: vp.userDisabled === true,
      riderWeightKg: clamp(vp.riderWeightKg, 20, 300, DEFAULT_VIRTUAL_POWER.riderWeightKg),
      bikeWeightKg: clamp(vp.bikeWeightKg, 1, 50, DEFAULT_VIRTUAL_POWER.bikeWeightKg),
      rollingResistance: clamp(vp.rollingResistance, 0.001, 0.05, DEFAULT_VIRTUAL_POWER.rollingResistance),
      cdA,
    },
    sensors: parseSensors(raw.sensors),
    createdAt: timestampToMillis(raw.createdAt),
    updatedAt: timestampToMillis(raw.updatedAt),
  };
}
