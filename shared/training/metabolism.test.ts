import { describe, expect, it } from "vitest";
import {
  relativeFatOxidation,
  fatEnergyFraction,
  fatMaxIntensityPctFtp,
  computeFatMaxProfile,
  computeRideSubstrate,
  FATMAX_PEAK_PCT_FTP,
  SUSTAINABLE_CAP_MIN,
} from "./metabolism";

describe("relativeFatOxidation", () => {
  it("정점(%FTP=FATMAX)에서 최대값 1", () => {
    expect(relativeFatOxidation(FATMAX_PEAK_PCT_FTP)).toBeCloseTo(1, 5);
  });

  it("종형 — 정점에서 멀어질수록 감소", () => {
    const peak = relativeFatOxidation(FATMAX_PEAK_PCT_FTP);
    expect(relativeFatOxidation(0.4)).toBeLessThan(peak);
    expect(relativeFatOxidation(0.9)).toBeLessThan(peak);
  });

  it("고강도(>1.0 FTP)는 거의 0 으로 수렴", () => {
    expect(relativeFatOxidation(1.2)).toBeLessThan(0.05);
  });

  it("0 또는 음수 강도는 0", () => {
    expect(relativeFatOxidation(0)).toBe(0);
    expect(relativeFatOxidation(-0.5)).toBe(0);
    expect(relativeFatOxidation(NaN)).toBe(0);
  });

  it("정점 위쪽이 아래쪽보다 가파르게 감소 (비대칭)", () => {
    const below = relativeFatOxidation(FATMAX_PEAK_PCT_FTP - 0.2);
    const above = relativeFatOxidation(FATMAX_PEAK_PCT_FTP + 0.2);
    expect(above).toBeLessThan(below);
  });
});

describe("fatEnergyFraction", () => {
  it("저강도(FATMAX 부근)에서 지방 분율이 고강도보다 높다", () => {
    const low = fatEnergyFraction(FATMAX_PEAK_PCT_FTP);
    const high = fatEnergyFraction(1.1);
    expect(low).toBeGreaterThan(high);
    expect(low).toBeLessThanOrEqual(0.6);
  });
});

describe("fatMaxIntensityPctFtp", () => {
  it("정점 강도 상수 반환", () => {
    expect(fatMaxIntensityPctFtp()).toBe(FATMAX_PEAK_PCT_FTP);
  });
});

describe("computeFatMaxProfile", () => {
  it("fatMaxWatts = ftp × fatMaxPctFtp", () => {
    const p = computeFatMaxProfile(250, null, null);
    expect(p.fatMaxWatts).toBe(Math.round(250 * FATMAX_PEAK_PCT_FTP));
    expect(p.fatMaxPctFtp).toBe(FATMAX_PEAK_PCT_FTP);
  });

  it("CP 없으면 지속시간·TSS 추정 불가 → null", () => {
    const p = computeFatMaxProfile(250, null, null);
    expect(p.sustainableMin).toBeNull();
    expect(p.tssAtFatMax).toBeNull();
  });

  it("fatMaxWatts ≤ CP 이면 SUSTAINABLE_CAP_MIN 로 캡", () => {
    // ftp=250 → fatMaxWatts=170, CP=240 → 170 ≤ 240
    const p = computeFatMaxProfile(250, 240, 20000);
    expect(p.sustainableMin).toBe(SUSTAINABLE_CAP_MIN);
    expect(p.tssAtFatMax).toBeGreaterThan(0);
  });

  it("fatMaxWatts > CP 이면 W'/(P−CP) 로 지속시간 (분)", () => {
    // ftp=400 → fatMaxWatts=272, CP=200, W'=20000 → t=20000/(272-200)=277.8s=4.63분
    const p = computeFatMaxProfile(400, 200, 20000);
    expect(p.sustainableMin).toBeCloseTo(4.6, 0);
    expect(p.tssAtFatMax).toBeGreaterThan(0);
  });

  it("CP 초과인데 W' 없으면 지속시간 null", () => {
    const p = computeFatMaxProfile(400, 200, null);
    expect(p.sustainableMin).toBeNull();
  });
});

describe("computeRideSubstrate", () => {
  it("빈 스트림 graceful → 0", () => {
    const s = computeRideSubstrate([], 250, 70);
    expect(s).toEqual({ fatKcal: 0, carbKcal: 0, fatPct: 0, totalKcal: 0 });
  });

  it("짧은 스트림도 graceful", () => {
    const s = computeRideSubstrate([150, 160], 250, 70);
    expect(s.totalKcal).toBeGreaterThanOrEqual(0);
    expect(s.fatKcal + s.carbKcal).toBeCloseTo(s.totalKcal, 0);
  });

  it("ftp 0/음수면 0", () => {
    expect(computeRideSubstrate([200, 200], 0, 70).totalKcal).toBe(0);
  });

  it("저강도 라이드는 지방 우세 (fatPct 높음)", () => {
    // FATMAX 부근 강도 (170W ≈ 0.68×250) 1시간 유지
    const watts = new Array(3600).fill(170);
    const s = computeRideSubstrate(watts, 250, 70);
    expect(s.fatPct).toBeGreaterThan(0.4);
    expect(s.fatKcal).toBeGreaterThan(s.carbKcal);
    expect(s.totalKcal).toBeGreaterThan(0);
  });

  it("고강도 라이드는 탄수 우세 (fatPct 낮음)", () => {
    // 300W ≈ 1.2×250 FTP — 고강도
    const watts = new Array(1800).fill(300);
    const s = computeRideSubstrate(watts, 250, 70);
    expect(s.fatPct).toBeLessThan(0.15);
    expect(s.carbKcal).toBeGreaterThan(s.fatKcal);
  });

  it("kcal 추정: 1 kJ ≈ 1 kcal (효율 0.24 가정)", () => {
    // 250W × 3600s = 900 kJ → 약 900 kcal
    const watts = new Array(3600).fill(250);
    const s = computeRideSubstrate(watts, 250, 70);
    expect(s.totalKcal).toBeGreaterThan(850);
    expect(s.totalKcal).toBeLessThan(950);
  });

  it("0/음수/NaN 파워 샘플은 무시", () => {
    const s = computeRideSubstrate([170, 0, -5, NaN, 170], 250, 70);
    expect(s.totalKcal).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(s.totalKcal)).toBe(true);
  });

  it("weightKg null 이어도 동작 (파워 기반)", () => {
    const watts = new Array(600).fill(170);
    const withW = computeRideSubstrate(watts, 250, 70);
    const withoutW = computeRideSubstrate(watts, 250, null);
    expect(withoutW).toEqual(withW);
  });
});
