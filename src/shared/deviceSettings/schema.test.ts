import { describe, it, expect } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@shared/types/deviceSettings";

import {
  APP_SETTINGS_CLASSIFICATION,
  AppSettingsSchema,
  classify,
  getMissingClassifications,
  keysByScope,
  mergeUserScopedIntoSettings,
  parseAndValidateAppSettings,
  pickUserScoped,
  validateAppSettings,
  webEditableKeys,
} from "./schema";

describe("AppSettingsSchema (Zod)", () => {
  it("default AppSettings 객체는 통과", () => {
    const result = validateAppSettings(DEFAULT_APP_SETTINGS);
    expect(result.ok).toBe(true);
  });

  it("범위 밖 ftpWatts 는 거부", () => {
    const result = validateAppSettings({ ...DEFAULT_APP_SETTINGS, ftpWatts: 99999 });
    expect(result.ok).toBe(false);
  });

  it("음수 체중 거부", () => {
    const result = validateAppSettings({ ...DEFAULT_APP_SETTINGS, riderWeightKg: -1 });
    expect(result.ok).toBe(false);
  });

  it("알 수 없는 enum 값은 default 로 흡수", () => {
    const result = validateAppSettings({ ...DEFAULT_APP_SETTINGS, gpsMode: "QUANTUM_GPS" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.gpsMode).toBe("HIGH_ACCURACY");
  });

  it("미지의 top-level 필드는 보존 (passthrough)", () => {
    const result = validateAppSettings({
      ...DEFAULT_APP_SETTINGS,
      futurePlatformOnlyKey: { foo: 42 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as Record<string, unknown>).futurePlatformOnlyKey).toEqual({ foo: 42 });
    }
  });

  it("부분 입력은 default 로 채워짐", () => {
    const partial = { ftpWatts: 250, maxHeartRate: 185 };
    const parsed = AppSettingsSchema.parse(partial);
    expect(parsed.ftpWatts).toBe(250);
    expect(parsed.maxHeartRate).toBe(185);
    expect(parsed.riderWeightKg).toBe(70); // default
    expect(parsed.soundSettings.volume).toBe(0.8); // nested default
  });

  it("JSON 문자열에서 검증", () => {
    const json = JSON.stringify(DEFAULT_APP_SETTINGS);
    const result = parseAndValidateAppSettings(json);
    expect(result.ok).toBe(true);
  });

  it("잘못된 JSON 은 errors 반환", () => {
    const result = parseAndValidateAppSettings("not json");
    expect(result.ok).toBe(false);
  });

  it("알 수 없는 SettingsItem 도 settingsOrder 에 그대로 보존 (round-trip 손실 방지)", () => {
    const result = validateAppSettings({
      ...DEFAULT_APP_SETTINGS,
      settingsOrder: ["SENSOR", "FUTURE_ITEM", "RIDE"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.settingsOrder).toEqual(["SENSOR", "FUTURE_ITEM", "RIDE"]);
    }
  });

  it("enumWithFallback: 비-string 입력(number/null)도 fallback 으로 흡수", () => {
    // gpsMode 위치에 숫자/널 → throw 없이 default 로 폴백
    const r1 = validateAppSettings({ ...DEFAULT_APP_SETTINGS, gpsMode: 42 });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value.gpsMode).toBe("HIGH_ACCURACY");
    const r2 = validateAppSettings({ ...DEFAULT_APP_SETTINGS, gpsMode: null });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.gpsMode).toBe("HIGH_ACCURACY");
  });

  it("autoLapConfig.distanceKm 범위 검증", () => {
    const result = validateAppSettings({
      ...DEFAULT_APP_SETTINGS,
      autoLapConfig: { mode: "DISTANCE", distanceKm: 1000, timeMinutes: 5 },
    });
    expect(result.ok).toBe(false);
  });
});

describe("Field classification", () => {
  it("모든 top-level 필드 + soundSettings sub-key 가 분류되어 있음", () => {
    expect(getMissingClassifications()).toEqual([]);
  });

  it("classify() 가 ftpWatts 를 user/editable 로 보고", () => {
    const c = classify("ftpWatts");
    expect(c?.scope).toBe("user");
    expect(c?.web).toBe("editable");
  });

  it("센서 BLE 주소는 device/read-only", () => {
    const c = classify("savedHrmSensorAddress");
    expect(c?.scope).toBe("device");
    expect(c?.web).toBe("read-only");
  });

  it("soundSettings.volume 은 user, sound path 들은 device/hidden", () => {
    expect(classify("soundSettings.volume")?.scope).toBe("user");
    expect(classify("soundSettings.startSoundPath")?.scope).toBe("device");
    expect(classify("soundSettings.startSoundPath")?.web).toBe("hidden");
  });

  it("keysByScope('user') 는 ftpWatts/maxHeartRate/riderWeightKg 포함", () => {
    const keys = keysByScope("user");
    expect(keys).toContain("ftpWatts");
    expect(keys).toContain("maxHeartRate");
    expect(keys).toContain("riderWeightKg");
  });

  it("keysByScope('device') 는 sensor address + screen/gps/power mode 포함", () => {
    const keys = keysByScope("device");
    expect(keys).toContain("savedHrmSensorAddress");
    expect(keys).toContain("screenBrightness");
    expect(keys).toContain("gpsMode");
    expect(keys).toContain("powerMode");
  });

  it("keysByScope('user') 와 keysByScope('device') 가 겹치지 않음", () => {
    const userKeys = new Set(keysByScope("user"));
    const deviceKeys = new Set(keysByScope("device"));
    for (const k of userKeys) expect(deviceKeys.has(k)).toBe(false);
  });

  it("webEditableKeys 는 센서 주소 같은 read-only 필드를 제외", () => {
    const editable = webEditableKeys();
    expect(editable).not.toContain("savedHrmSensorAddress");
    expect(editable).not.toContain("useSimulationMode");
    expect(editable).toContain("ftpWatts");
  });

  it("pickUserScoped 는 ftpWatts 포함, device 키 제외", () => {
    const picked = pickUserScoped(DEFAULT_APP_SETTINGS);
    expect(picked.ftpWatts).toBe(200);
    expect(picked).not.toHaveProperty("savedHrmSensorAddress");
    expect(picked).not.toHaveProperty("gpsMode");
    expect(picked).not.toHaveProperty("dataPageConfig");
  });

  it("pickUserScoped 의 soundSettings 는 user sub-key (enabled, volume) 만 포함", () => {
    const picked = pickUserScoped({
      soundSettings: {
        enabled: false,
        volume: 0.5,
        startSoundPath: "/sdcard/start.mp3",
        stopSoundPath: "/sdcard/stop.mp3",
        lapSoundPath: null,
        climbStartSoundPath: null,
        climbEndSoundPath: null,
        radarSoundPath: null,
      },
    });
    expect(picked.soundSettings).toEqual({ enabled: false, volume: 0.5 });
  });

  it("mergeUserScopedIntoSettings 는 디바이스 로컬 sound 경로 보존", () => {
    const target = {
      ...DEFAULT_APP_SETTINGS,
      soundSettings: {
        ...DEFAULT_APP_SETTINGS.soundSettings,
        startSoundPath: "/device-A/start.mp3",
      },
    };
    const userPatch = pickUserScoped({
      ftpWatts: 300,
      soundSettings: {
        enabled: false,
        volume: 0.3,
        startSoundPath: null,
        stopSoundPath: null,
        lapSoundPath: null,
        climbStartSoundPath: null,
        climbEndSoundPath: null,
        radarSoundPath: null,
      },
    });
    const merged = mergeUserScopedIntoSettings(target, userPatch);
    expect(merged.ftpWatts).toBe(300);
    expect(merged.soundSettings.enabled).toBe(false);
    expect(merged.soundSettings.volume).toBe(0.3);
    // 디바이스 로컬 경로 보존
    expect(merged.soundSettings.startSoundPath).toBe("/device-A/start.mp3");
  });

  it("분류 카운트: user >= 18, device >= 13, mixed >= 1", () => {
    // 회귀 가드 — 분류가 의도치 않게 바뀌면 카운트가 흔들림
    let user = 0,
      device = 0,
      mixed = 0;
    for (const c of Object.values(APP_SETTINGS_CLASSIFICATION)) {
      if (c.scope === "user") user++;
      else if (c.scope === "device") device++;
      else mixed++;
    }
    expect(user).toBeGreaterThanOrEqual(18);
    expect(device).toBeGreaterThanOrEqual(14);
    expect(mixed).toBeGreaterThanOrEqual(1);
  });
});
