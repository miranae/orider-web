import { describe, it, expect } from "vitest";
import { calcVirtualPowerStream, normalizeTimeToSeconds, type PowerStreamInput } from "./virtualPower";
import golden from "./__fixtures__/virtualPower.golden.json";

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

  it("고도 결측 인접 구간은 경사만 제외하고 평지 저항 파워는 유지", () => {
    const input: PowerStreamInput = constSpeedInput(30, 30, 100);
    input.altitude[15] = null;
    const watts = calcVirtualPowerStream(input, baseParams);
    expect(watts[15]).toBeGreaterThan(100);
    expect(watts[16]).toBeGreaterThan(100);
    expect(Math.max(...watts.slice(10))).toBeLessThan(250);
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

// 서버 정본(orider-g1-web functions/src/lib/virtualPower.ts)과 같은 골든 픽스처로 고정한다.
// 픽스처는 두 저장소에 같은 파일로 있고, 공식을 바꾸면 양쪽을 함께 갱신한다.
describe("golden: 서버 정본과 같은 출력 (virtualPower drift 차단)", () => {
  const PARAMS = golden.params;
  const NULL_ALTITUDE_CASE = "고도 결측(평지 60번째 null)";
  const expected = golden.calcVirtualPowerStream as Record<string, number[]>;

  // 다양한 형태: 평지 정속 / 오르막 / 내리막 / 정지·코스팅 / 급변(클램프 유발) / ms 타임스탬프
  function buildCases(): { name: string; input: PowerStreamInput }[] {
    const n = 120;
    const flat: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => i),
      velocity_smooth: Array.from({ length: n }, () => 8),
      altitude: Array.from({ length: n }, () => 100),
    };
    const climb: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => i),
      velocity_smooth: Array.from({ length: n }, () => 5),
      altitude: Array.from({ length: n }, (_, i) => 100 + i * 0.8),
    };
    const descent: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => i),
      velocity_smooth: Array.from({ length: n }, () => 15),
      altitude: Array.from({ length: n }, (_, i) => 200 - i * 1.2),
    };
    const stopGo: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => i),
      velocity_smooth: Array.from({ length: n }, (_, i) => (i % 10 < 3 ? 0 : 12)),
      altitude: Array.from({ length: n }, () => 50),
    };
    const spike: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => i),
      velocity_smooth: Array.from({ length: n }, (_, i) => (i === 60 ? 40 : 9)),
      altitude: Array.from({ length: n }, (_, i) => (i === 60 ? 130 : 100)),
    };
    const msTime: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => Date.UTC(2026, 5, 21) + i * 1000),
      velocity_smooth: Array.from({ length: n }, () => 10),
      altitude: Array.from({ length: n }, (_, i) => 100 + i * 0.3),
    };
    // 상수 분기를 직접 겨냥한 케이스 — MAX_WATTS(2000) 아래에서 차이가 드러나게 잡는다.
    // V_MAX: 30 m/s 지속 + 10% 내리막(aero 캡 여부로 651W ↔ 2000W 로 갈린다)
    const overSpeed: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => i),
      velocity_smooth: Array.from({ length: n }, () => 30),
      altitude: Array.from({ length: n }, (_, i) => 1000 - i * 3),
    };
    // gradient clamp: 2 m/s 에 경사 0.4 지속
    const steepClimb: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => i),
      velocity_smooth: Array.from({ length: n }, () => 2),
      altitude: Array.from({ length: n }, (_, i) => 100 + i * 0.8),
    };
    // dt 유효성(0.1 ≤ dt ≤ 10): 1·7·15초 간격을 섞고 속도·고도를 바꾼다
    const gaps = [1, 7, 15];
    const sparseTime: PowerStreamInput = {
      time: Array.from({ length: n }, (_, i) => Array.from({ length: i }, (_, k) => gaps[k % 3]!).reduce((a, b) => a + b, 0)),
      velocity_smooth: Array.from({ length: n }, (_, i) => 6 + (i % 5)),
      altitude: Array.from({ length: n }, (_, i) => 100 + i * 2),
    };
    return [
      { name: "평지 정속", input: flat },
      { name: "오르막", input: climb },
      { name: "내리막", input: descent },
      { name: "정지·코스팅", input: stopGo },
      { name: "급변(클램프)", input: spike },
      { name: "ms 타임스탬프", input: msTime },
      { name: "V_MAX 초과 지속", input: overSpeed },
      { name: "급경사(경사 클램프)", input: steepClimb },
      { name: "희소 간격(dt 유효성)", input: sparseTime },
    ];
  }

  it("calcVirtualPowerStream — 입력 매트릭스 전수 출력 동일", () => {
    const cases = buildCases();
    expect(Object.keys(expected).sort()).toEqual([...cases.map((c) => c.name), NULL_ALTITUDE_CASE].sort());
    for (const { name, input } of cases) {
      expect(calcVirtualPowerStream(input, PARAMS), name).toEqual(expected[name]);
    }
    const nullInput = buildCases()[0]!.input;
    nullInput.altitude[60] = null;
    expect(calcVirtualPowerStream(nullInput, PARAMS)).toEqual(expected[NULL_ALTITUDE_CASE]);
  });

  it("normalizeTimeToSeconds — 초/ms 단위 처리 동일", () => {
    const secTime = Array.from({ length: 50 }, (_, i) => i);
    const msTime = Array.from({ length: 50 }, (_, i) => Date.UTC(2026, 5, 21) + i * 1000);
    expect(normalizeTimeToSeconds(secTime)).toEqual(golden.normalizeTimeToSeconds.sec);
    expect(normalizeTimeToSeconds(msTime)).toEqual(golden.normalizeTimeToSeconds.ms);
  });
});
