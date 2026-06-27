import { describe, it, expect } from "vitest";
import { calculatePowerCurve } from "./powerCurve";

describe("calculatePowerCurve", () => {
  it("일정 파워 → 가용 duration 전부 그 값", () => {
    const watts = Array(60).fill(200);
    const curve = calculatePowerCurve(watts);
    // 60초 데이터 → 1,5,10,30,60 만 포함(120 이상은 watts.length 초과로 제외)
    expect(curve.map((p) => p.durationSeconds)).toEqual([1, 5, 10, 30, 60]);
    for (const p of curve) expect(p.maxPower).toBe(200);
  });

  it("duration 필터 — watts.length 이하만", () => {
    expect(calculatePowerCurve(Array(4).fill(100)).map((p) => p.durationSeconds)).toEqual([1]);
    expect(calculatePowerCurve([]).length).toBe(0);
  });

  it("최대 롤링평균 — 스파이크가 짧은 윈도우 최대치를 끌어올림", () => {
    // 9개: 앞 5개 100, 뒤 4개 500 → 1초max=500, 5초max=max(앞5=100, ..., 뒤5포함 구간)
    const watts = [100, 100, 100, 100, 100, 500, 500, 500, 500];
    const curve = calculatePowerCurve(watts);
    const p1 = curve.find((p) => p.durationSeconds === 1)!;
    const p5 = curve.find((p) => p.durationSeconds === 5)!;
    expect(p1.maxPower).toBe(500); // 1초 최대 = 500
    // 5초 윈도우 최대: [100,500,500,500,500]=420 가 최대
    expect(p5.maxPower).toBe(420);
  });

  it("반올림된 정수 반환", () => {
    const watts = [100, 101, 102, 103, 104]; // 5초 평균 102
    const p5 = calculatePowerCurve(watts).find((p) => p.durationSeconds === 5)!;
    expect(Number.isInteger(p5.maxPower)).toBe(true);
    expect(p5.maxPower).toBe(102);
  });
});
