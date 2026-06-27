import { describe, expect, it } from "vitest";
import {
  steadyStateSpeed,
  simulateCourse,
  requiredPowerForTime,
  predictPR,
  DEFAULT_CDA,
  DEFAULT_CRR,
  DEFAULT_ETA,
  type SimParams,
  type SimSegment,
} from "./courseSim";

const baseParams: Omit<SimParams, "powerW"> = {
  massKg: 75,
  cda: DEFAULT_CDA,
  crr: DEFAULT_CRR,
  eta: DEFAULT_ETA,
};

describe("steadyStateSpeed", () => {
  it("평지 250W 에서 합리적 속도(약 35~42 km/h)를 낸다", () => {
    const v = steadyStateSpeed(0, { ...baseParams, powerW: 250 });
    const kmh = v * 3.6;
    // 75kg/0.32 CdA 라이더가 평지 250W → 대략 38km/h 근처.
    expect(kmh).toBeGreaterThan(35);
    expect(kmh).toBeLessThan(42);
  });

  it("파워가 높을수록 평지 속도가 빨라진다 (단조)", () => {
    const v200 = steadyStateSpeed(0, { ...baseParams, powerW: 200 });
    const v300 = steadyStateSpeed(0, { ...baseParams, powerW: 300 });
    expect(v300).toBeGreaterThan(v200);
  });

  it("같은 파워에서 오르막은 평지보다 느리다", () => {
    const flat = steadyStateSpeed(0, { ...baseParams, powerW: 250 });
    const climb = steadyStateSpeed(0.08, { ...baseParams, powerW: 250 });
    expect(climb).toBeLessThan(flat);
  });

  it("내리막은 같은 파워에서 평지보다 빠르다", () => {
    const flat = steadyStateSpeed(0, { ...baseParams, powerW: 250 });
    const descent = steadyStateSpeed(-0.06, { ...baseParams, powerW: 250 });
    expect(descent).toBeGreaterThan(flat);
  });

  it("가파른 오르막 + 저파워는 비수렴 대신 작은 양속도로 폴백", () => {
    const v = steadyStateSpeed(0.25, { ...baseParams, powerW: 30 });
    expect(v).toBeGreaterThan(0);
    expect(Number.isFinite(v)).toBe(true);
  });

  it("속도는 120km/h 상한으로 클램프된다", () => {
    const v = steadyStateSpeed(-0.2, { ...baseParams, powerW: 1500 });
    expect(v * 3.6).toBeLessThanOrEqual(120 + 1e-6);
  });
});

describe("simulateCourse", () => {
  it("평지 등속 — 거리/속도로 시간이 맞다", () => {
    const segs: SimSegment[] = [{ distanceM: 10000, grade: 0 }];
    const res = simulateCourse(segs, { ...baseParams, powerW: 250 });
    const v = steadyStateSpeed(0, { ...baseParams, powerW: 250 });
    expect(res.totalSec).toBeCloseTo(10000 / v, 1);
    expect(res.avgSpeedKmh).toBeCloseTo(v * 3.6, 3);
  });

  it("여러 구간 시간이 합산된다", () => {
    const segs: SimSegment[] = [
      { distanceM: 5000, grade: 0 },
      { distanceM: 2000, grade: 0.06 },
      { distanceM: 3000, grade: -0.04 },
    ];
    const res = simulateCourse(segs, { ...baseParams, powerW: 220 });
    const sum = res.perSegment.reduce((a, s) => a + s.sec, 0);
    expect(res.totalSec).toBeCloseTo(sum, 5);
    expect(res.perSegment).toHaveLength(3);
    // 오르막 구간이 가장 느려야 한다.
    expect(res.perSegment[1].speedKmh).toBeLessThan(res.perSegment[0].speedKmh);
  });

  it("빈 코스는 0초", () => {
    const res = simulateCourse([], { ...baseParams, powerW: 250 });
    expect(res.totalSec).toBe(0);
    expect(res.avgSpeedKmh).toBe(0);
  });
});

describe("requiredPowerForTime", () => {
  it("목표시간↔파워 역산이 시뮬레이션과 일관된다", () => {
    const segs: SimSegment[] = [
      { distanceM: 8000, grade: 0.02 },
      { distanceM: 4000, grade: -0.01 },
    ];
    // 250W 로 시뮬 → 그 시간 → 역산 파워가 250 에 근접해야 함.
    const target = simulateCourse(segs, { ...baseParams, powerW: 250 }).totalSec;
    const p = requiredPowerForTime(segs, target, baseParams);
    expect(p).toBeGreaterThan(240);
    expect(p).toBeLessThan(260);
  });

  it("더 빠른 목표는 더 높은 파워를 요구한다", () => {
    const segs: SimSegment[] = [{ distanceM: 10000, grade: 0.03 }];
    const slow = simulateCourse(segs, { ...baseParams, powerW: 200 }).totalSec;
    const fast = simulateCourse(segs, { ...baseParams, powerW: 300 }).totalSec;
    const pSlow = requiredPowerForTime(segs, slow, baseParams);
    const pFast = requiredPowerForTime(segs, fast, baseParams);
    expect(pFast).toBeGreaterThan(pSlow);
  });

  it("도달 불가능한 빠른 목표는 상한 파워로 클램프", () => {
    const segs: SimSegment[] = [{ distanceM: 10000, grade: 0.05 }];
    const p = requiredPowerForTime(segs, 1, baseParams); // 1초 — 불가능
    expect(p).toBeLessThanOrEqual(2000);
    expect(p).toBeGreaterThan(0);
  });
});

describe("predictPR", () => {
  it("CP/W' 로 PR 시간을 예측하고 지속파워는 CP 이상", () => {
    const segs: SimSegment[] = [
      { distanceM: 5000, grade: 0.04 },
      { distanceM: 5000, grade: 0.0 },
    ];
    const pr = predictPR(segs, 250, 20000, baseParams);
    expect(pr.totalSec).toBeGreaterThan(0);
    expect(Number.isFinite(pr.totalSec)).toBe(true);
    // 유한 시간이면 W'/T 기여로 CP 이상의 파워.
    expect(pr.sustainablePowerW).toBeGreaterThanOrEqual(250);
  });

  it("W' 가 클수록(같은 CP) 더 빠른 PR", () => {
    const segs: SimSegment[] = [{ distanceM: 3000, grade: 0.05 }];
    const low = predictPR(segs, 250, 10000, baseParams);
    const high = predictPR(segs, 250, 40000, baseParams);
    expect(high.totalSec).toBeLessThan(low.totalSec);
  });

  it("CP 가 0/음수면 graceful 폴백 (NaN/Infinity 없음)", () => {
    const segs: SimSegment[] = [{ distanceM: 2000, grade: 0.02 }];
    const pr = predictPR(segs, 0, 0, baseParams);
    expect(Number.isFinite(pr.totalSec)).toBe(true);
    expect(Number.isFinite(pr.sustainablePowerW)).toBe(true);
  });
});
