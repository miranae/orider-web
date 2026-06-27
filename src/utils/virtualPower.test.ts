import { describe, it, expect } from "vitest";
import { calcVirtualPowerStream, normalizeTimeToSeconds } from "./virtualPower";

const baseParams = {
  riderWeightKg: 70,
  bikeWeightKg: 9,
  rollingResistance: 0.005,
  cdA: 0.32,
};

function constSpeedInput(speedKmh: number, seconds: number, alt = 0) {
  const v = speedKmh / 3.6;
  const time = Array.from({ length: seconds }, (_, i) => i);
  const velocity_smooth = Array.from({ length: seconds }, () => v);
  const altitude = Array.from({ length: seconds }, () => alt);
  return { time, velocity_smooth, altitude };
}

describe("calcVirtualPowerStream", () => {
  it("평지 30km/h 정속에서 약 150W 근방", () => {
    const watts = calcVirtualPowerStream(constSpeedInput(30, 60), baseParams);
    const avg = watts.slice(10).reduce((a, b) => a + b, 0) / (watts.length - 10);
    expect(avg).toBeGreaterThan(140);
    expect(avg).toBeLessThan(180);
  });

  it("velocity 0이면 0W", () => {
    const watts = calcVirtualPowerStream(constSpeedInput(0, 30), baseParams);
    expect(watts.every((w) => w === 0)).toBe(true);
  });

  it("내리막에서 음수는 0으로 클립", () => {
    const time = Array.from({ length: 30 }, (_, i) => i);
    const v = 10 / 3.6;
    const velocity_smooth = Array.from({ length: 30 }, () => v);
    const altitude = Array.from({ length: 30 }, (_, i) => 100 - i * 2);
    const watts = calcVirtualPowerStream({ time, velocity_smooth, altitude }, baseParams);
    expect(watts.every((w) => w >= 0)).toBe(true);
    const avg = watts.slice(10).reduce((a, b) => a + b, 0) / (watts.length - 10);
    expect(avg).toBe(0);
  });

  it("10% 경사 10km/h에서 등판 항이 지배적 (≥200W)", () => {
    const v = 10 / 3.6;
    const time = Array.from({ length: 60 }, (_, i) => i);
    const velocity_smooth = Array.from({ length: 60 }, () => v);
    const altitude = Array.from({ length: 60 }, (_, i) => i * v * 0.1);
    const watts = calcVirtualPowerStream({ time, velocity_smooth, altitude }, baseParams);
    const avg = watts.slice(10).reduce((a, b) => a + b, 0) / (watts.length - 10);
    // 79kg total @ 10% gradient @ 10km/h → 약 230W (climb 항 ~215W, roll+aero ~15W)
    expect(avg).toBeGreaterThan(200);
  });

  it("샘플 0은 항상 0", () => {
    const watts = calcVirtualPowerStream(constSpeedInput(30, 5), baseParams);
    expect(watts[0]).toBe(0);
  });

  it("고도 스파이크(50000m)에도 NaN 발생 없음", () => {
    const v = 30 / 3.6;
    const time = Array.from({ length: 30 }, (_, i) => i);
    const velocity_smooth = Array.from({ length: 30 }, () => v);
    const altitude = Array.from({ length: 30 }, () => 0);
    altitude[15] = 50000;
    const watts = calcVirtualPowerStream({ time, velocity_smooth, altitude }, baseParams);
    expect(watts.length).toBe(30);
    expect(watts.every((w) => Number.isFinite(w))).toBe(true);
  });

  it("배열 길이 불일치 시 빈 배열 반환", () => {
    const time = [0, 1, 2, 3, 4];
    const velocity_smooth = [1, 2, 3];
    const altitude = [0, 0, 0, 0, 0];
    const watts = calcVirtualPowerStream({ time, velocity_smooth, altitude }, baseParams);
    expect(watts).toEqual([]);
  });

  // ── normalizeTimeToSeconds ──────────────────────────────────────────────

  it("Strava 형식(0,1,2,...) 은 그대로 반환", () => {
    const t = [0, 1, 2, 3, 4, 5];
    expect(normalizeTimeToSeconds(t)).toEqual(t);
  });

  it("Unix ms timestamp 감지 및 elapsed seconds로 변환", () => {
    const t = [1776590094539, 1776590095539, 1776590096539, 1776590097539];
    const result = normalizeTimeToSeconds(t);
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it("ms 단위지만 epoch 아닌 경우 (median delta > 100) 도 변환", () => {
    const t = [0, 1000, 2000, 3000, 4000];
    const result = normalizeTimeToSeconds(t);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("정상 sec 샘플링(0,1,2,...)에서 median delta 1초 → 변환 안 함", () => {
    const t = [0, 1, 2, 3, 4, 5];
    expect(normalizeTimeToSeconds(t)).toEqual(t);
  });

  it("Orider 모바일 raw stream 시뮬레이션 → 정상 watts 계산", () => {
    // 평지 30km/h 정속 60초 — ms timestamp 형식
    const v = 30 / 3.6;
    const start = 1776590094539;
    const time = Array.from({ length: 60 }, (_, i) => start + i * 1000);
    const velocity_smooth = Array.from({ length: 60 }, () => v);
    const altitude = Array.from({ length: 60 }, () => 0);
    const watts = calcVirtualPowerStream({ time, velocity_smooth, altitude }, baseParams);
    const avg = watts.slice(10).reduce((a, b) => a + b, 0) / (watts.length - 10);
    // ms 단위 보정 적용되면 평지 30km/h ≈ 150W (이전 버그: 1500W+ 폭주)
    expect(avg).toBeGreaterThan(140);
    expect(avg).toBeLessThan(200);
  });
});
