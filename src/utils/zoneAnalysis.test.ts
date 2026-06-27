import { describe, it, expect } from "vitest";
import {
  calculateSeilerZones,
  polarizationIndex,
} from "./zoneAnalysis";

// FTP = 200W 기준 테스트 스트림 헬퍼
function makeStream(count: number, watts: number): number[] {
  return Array(count).fill(watts);
}

describe("calculateSeilerZones", () => {
  const FTP = 200;

  it("Z1 경계: 74%FTP(148W) → Z1", () => {
    const zones = calculateSeilerZones(makeStream(100, 148), FTP);
    expect(zones[0]!.zone).toBe(1);
    expect(zones[0]!.pct).toBeCloseTo(100);
    expect(zones[1]!.pct).toBeCloseTo(0);
    expect(zones[2]!.pct).toBeCloseTo(0);
  });

  it("Z2 경계: 75%FTP(150W) → Z2", () => {
    const zones = calculateSeilerZones(makeStream(100, 150), FTP);
    expect(zones[1]!.zone).toBe(2);
    expect(zones[1]!.pct).toBeCloseTo(100);
  });

  it("Z2 경계: 100%FTP(200W) → Z2", () => {
    const zones = calculateSeilerZones(makeStream(100, 200), FTP);
    // 200W = 100%FTP → max는 1.00 exclusive (< 1.00 기준 Z2이므로 경계값 200W는 Z3)
    expect(zones[2]!.zone).toBe(3);
    expect(zones[2]!.pct).toBeCloseTo(100);
  });

  it("Z3 경계: 101%FTP(202W) → Z3", () => {
    const zones = calculateSeilerZones(makeStream(100, 202), FTP);
    expect(zones[2]!.zone).toBe(3);
    expect(zones[2]!.pct).toBeCloseTo(100);
  });

  it("혼합 분포: 60% Z1 + 20% Z2 + 20% Z3", () => {
    const stream = [
      ...makeStream(60, 100),   // Z1 < 75%
      ...makeStream(20, 160),   // Z2 75~100%
      ...makeStream(20, 220),   // Z3 > 100%
    ];
    const zones = calculateSeilerZones(stream, FTP);
    expect(zones[0]!.pct).toBeCloseTo(60);
    expect(zones[1]!.pct).toBeCloseTo(20);
    expect(zones[2]!.pct).toBeCloseTo(20);
  });

  it("seconds 값이 샘플 수와 일치", () => {
    const zones = calculateSeilerZones([...makeStream(30, 100), ...makeStream(70, 250)], FTP);
    expect(zones[0]!.seconds).toBe(30);
    expect(zones[2]!.seconds).toBe(70);
  });

  it("빈 스트림 → pct 0", () => {
    const zones = calculateSeilerZones([], FTP);
    zones.forEach((z) => expect(z.pct).toBe(0));
  });

  it("zone/label/color 필드 구조", () => {
    const zones = calculateSeilerZones(makeStream(10, 100), FTP);
    expect(zones).toHaveLength(3);
    expect(zones[0]!.zone).toBe(1);
    expect(zones[1]!.zone).toBe(2);
    expect(zones[2]!.zone).toBe(3);
    zones.forEach((z) => {
      expect(typeof z.label).toBe("string");
      expect(typeof z.color).toBe("string");
    });
  });
});

describe("polarizationIndex", () => {
  function makeSeiler(z1Pct: number, z2Pct: number, z3Pct: number) {
    return [
      { zone: 1 as const, label: "저강도", seconds: z1Pct, pct: z1Pct, color: "#3b82f6" },
      { zone: 2 as const, label: "역치",   seconds: z2Pct, pct: z2Pct, color: "#f59e0b" },
      { zone: 3 as const, label: "고강도", seconds: z3Pct, pct: z3Pct, color: "#ef4444" },
    ];
  }

  it("양극화(polarized): Z1+Z3>=80% AND Z3>=15%", () => {
    const result = polarizationIndex(makeSeiler(65, 5, 30));
    expect(result.verdict).toBe("polarized");
    expect(result.labelKo).toBe("양극화");
    expect(result.extremePct).toBeCloseTo(95);
    expect(result.thresholdPct).toBeCloseTo(5);
  });

  it("양극화 경계: Z3=15% 이상 + Z1+Z3=80% 이상", () => {
    const result = polarizationIndex(makeSeiler(65, 20, 15));
    expect(result.verdict).toBe("polarized");
  });

  it("양극화 미달: Z3 < 15%이면 threshold 또는 pyramidal", () => {
    // Z1+Z3 = 90%이지만 Z3=5%만 → polarized 조건 미달
    const result = polarizationIndex(makeSeiler(85, 10, 5));
    expect(result.verdict).not.toBe("polarized");
  });

  it("임계집중(threshold): Z2>=40%", () => {
    const result = polarizationIndex(makeSeiler(30, 50, 20));
    expect(result.verdict).toBe("threshold");
    expect(result.labelKo).toBe("임계집중");
  });

  it("피라미드(pyramidal): 그 외", () => {
    // Z1+Z3 < 80%, Z2 < 40%
    const result = polarizationIndex(makeSeiler(60, 30, 10));
    expect(result.verdict).toBe("pyramidal");
    expect(result.labelKo).toBe("피라미드");
  });

  it("설명 필드 존재", () => {
    const result = polarizationIndex(makeSeiler(65, 5, 30));
    expect(typeof result.descriptionKo).toBe("string");
    expect(typeof result.descriptionEn).toBe("string");
    expect(result.descriptionKo.length).toBeGreaterThan(0);
  });
});
