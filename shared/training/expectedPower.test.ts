import { describe, expect, it } from "vitest";
import {
  computeExpectedCurve,
  classifyGaps,
  EXPECTED_DURATIONS_SEC,
  EXPECTED_GAP_STRENGTH_PCT,
  EXPECTED_GAP_WEAKNESS_PCT,
  computeOutdoorPacingGuide,
} from "./expectedPower";

describe("computeExpectedCurve", () => {
  it("CP 모델 값 P = cp + wPrime/d 를 반올림해 계산", () => {
    // cp=250, wPrime=20000, d=300 → 250 + 66.7 = 316.7 → 317
    const curve = computeExpectedCurve(250, 20000);
    const p300 = curve.find((p) => p.durationSeconds === 300);
    expect(p300?.watts).toBe(317);
    // d=3600 → 250 + 5.56 = 255.6 → 256
    const p3600 = curve.find((p) => p.durationSeconds === 3600);
    expect(p3600?.watts).toBe(256);
  });

  it("기본 duration 전체를 오름차순으로 반환", () => {
    const curve = computeExpectedCurve(250, 20000);
    expect(curve.map((p) => p.durationSeconds)).toEqual([...EXPECTED_DURATIONS_SEC]);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]!.durationSeconds).toBeGreaterThan(curve[i - 1]!.durationSeconds);
      // 더 긴 duration 일수록 기대파워는 낮아진다 (단조 감소)
      expect(curve[i]!.watts).toBeLessThanOrEqual(curve[i - 1]!.watts);
    }
  });

  it("커스텀 durations 를 정렬해 사용", () => {
    const curve = computeExpectedCurve(250, 20000, [600, 60]);
    expect(curve.map((p) => p.durationSeconds)).toEqual([60, 600]);
  });

  it("유효하지 않은 cp/wPrime 은 빈 배열", () => {
    expect(computeExpectedCurve(0, 20000)).toEqual([]);
    expect(computeExpectedCurve(-1, 20000)).toEqual([]);
    expect(computeExpectedCurve(250, -1)).toEqual([]);
    expect(computeExpectedCurve(NaN, 20000)).toEqual([]);
  });
});

describe("classifyGaps", () => {
  const cp = 250;
  const wPrime = 20000;
  // d=300 기대파워 = 316.67

  it("기대보다 +8% 이상이면 strength", () => {
    // 316.67 × 1.10 ≈ 348 → gapPct ≈ +10%
    const gaps = classifyGaps({ 300: 348 }, cp, wPrime);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.label).toBe("strength");
    expect(gaps[0]!.gapPct).toBeGreaterThanOrEqual(EXPECTED_GAP_STRENGTH_PCT);
  });

  it("기대보다 -8% 이하이면 weakness", () => {
    // 316.67 × 0.88 ≈ 279 → gapPct ≈ -12%
    const gaps = classifyGaps({ 300: 279 }, cp, wPrime);
    expect(gaps[0]!.label).toBe("weakness");
    expect(gaps[0]!.gapPct).toBeLessThanOrEqual(EXPECTED_GAP_WEAKNESS_PCT);
  });

  it("기대치 부근이면 on_par", () => {
    const gaps = classifyGaps({ 300: 317 }, cp, wPrime);
    expect(gaps[0]!.label).toBe("on_par");
    expect(Math.abs(gaps[0]!.gapPct)).toBeLessThan(EXPECTED_GAP_STRENGTH_PCT);
  });

  it("경계값 +8% 이상은 strength (>=)", () => {
    const expected = cp + wPrime / 300; // 316.67
    const peak = expected * (1 + EXPECTED_GAP_STRENGTH_PCT / 100 + 0.0001);
    const gaps = classifyGaps({ 300: peak }, cp, wPrime);
    expect(gaps[0]!.gapPct).toBeGreaterThanOrEqual(EXPECTED_GAP_STRENGTH_PCT);
    expect(gaps[0]!.label).toBe("strength");
  });

  it("경계값 -8% 이하는 weakness (<=)", () => {
    const expected = cp + wPrime / 300;
    // 정확히 -8% 는 부동소수 오차로 -7.999.. 가 될 수 있어 임계 직하로 검증.
    const peak = expected * (1 + EXPECTED_GAP_WEAKNESS_PCT / 100 - 0.0001);
    const gaps = classifyGaps({ 300: peak }, cp, wPrime);
    expect(gaps[0]!.gapPct).toBeLessThanOrEqual(EXPECTED_GAP_WEAKNESS_PCT);
    expect(gaps[0]!.label).toBe("weakness");
  });

  it("여러 duration 을 오름차순으로 분류", () => {
    const gaps = classifyGaps({ 1200: 260, 300: 348, 60: 100 }, cp, wPrime);
    expect(gaps.map((g) => g.durationSeconds)).toEqual([60, 300, 1200]);
  });

  it("0/음수/비유한 peak 은 무시", () => {
    const gaps = classifyGaps({ 300: 0, 600: -5, 1200: NaN, 1800: 240 }, cp, wPrime);
    expect(gaps.map((g) => g.durationSeconds)).toEqual([1800]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(classifyGaps({}, cp, wPrime)).toEqual([]);
  });

  it("유효하지 않은 cp/wPrime 은 빈 배열", () => {
    expect(classifyGaps({ 300: 348 }, 0, wPrime)).toEqual([]);
    expect(classifyGaps({ 300: 348 }, cp, -1)).toEqual([]);
  });
});

describe("computeOutdoorPacingGuide", () => {
  it("CP×[0.90,0.95] 로 W 범위 산출(반올림)", () => {
    const g = computeOutdoorPacingGuide(300);
    expect(g).toEqual({ lowerW: 270, upperW: 285 });
  });

  it("체중 주면 W/kg 도 산출(소수 2자리)", () => {
    const g = computeOutdoorPacingGuide(300, 70);
    expect(g?.lowerW).toBe(270);
    expect(g?.upperW).toBe(285);
    expect(g?.lowerWkg).toBeCloseTo(3.86, 2); // 270/70
    expect(g?.upperWkg).toBeCloseTo(4.07, 2); // 285/70
  });

  it("하한 < 상한 보장", () => {
    const g = computeOutdoorPacingGuide(250)!;
    expect(g.lowerW).toBeLessThan(g.upperW);
  });

  it("유효하지 않은 cp 는 null", () => {
    expect(computeOutdoorPacingGuide(0)).toBeNull();
    expect(computeOutdoorPacingGuide(-10)).toBeNull();
    expect(computeOutdoorPacingGuide(NaN)).toBeNull();
  });

  it("체중이 0/음수면 W/kg 생략", () => {
    const g = computeOutdoorPacingGuide(300, 0)!;
    expect(g.lowerWkg).toBeUndefined();
    expect(g.upperWkg).toBeUndefined();
  });
});
