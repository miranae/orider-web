import { describe, expect, it } from "vitest";
import { estimateCyclingVo2max, estimateRunningVo2max } from "@shared/training/vo2max";

describe("estimateCyclingVo2max", () => {
  it("대표 케이스: 300W / 75kg → 10.8*300/75+7 = 50.2", () => {
    const result = estimateCyclingVo2max({ power5minW: 300, weightKg: 75 });
    expect(result).toBe(50.2);
  });

  it("5분 파워 없을 때 CP 폴백", () => {
    const withCp = estimateCyclingVo2max({ cpW: 300, weightKg: 75 });
    expect(withCp).toBe(50.2);
  });

  it("5분 파워 우선 (CP보다 높아도)", () => {
    const result = estimateCyclingVo2max({ power5minW: 350, cpW: 300, weightKg: 75 });
    const expected = Math.round((10.8 * 350 / 75 + 7) * 10) / 10;
    expect(result).toBe(expected);
  });

  it("체중 없으면 null", () => {
    expect(estimateCyclingVo2max({ power5minW: 300, weightKg: null })).toBeNull();
    expect(estimateCyclingVo2max({ power5minW: 300 })).toBeNull();
  });

  it("파워 없으면 null", () => {
    expect(estimateCyclingVo2max({ weightKg: 70 })).toBeNull();
    expect(estimateCyclingVo2max({ power5minW: null, cpW: null, weightKg: 70 })).toBeNull();
  });

  it("범위 밖 결과 → null (하한 < 20)", () => {
    // 매우 낮은 파워 → VO2max < 20
    expect(estimateCyclingVo2max({ power5minW: 10, weightKg: 100 })).toBeNull();
  });

  it("범위 밖 결과 → null (상한 > 95)", () => {
    // 비현실적 고파워 → VO2max > 95
    expect(estimateCyclingVo2max({ power5minW: 1000, weightKg: 50 })).toBeNull();
  });

  it("경계값 75kg/260W → 합리성 범위 내", () => {
    // 10.8*260/75 + 7 = 44.44
    const result = estimateCyclingVo2max({ power5minW: 260, weightKg: 75 });
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(20);
    expect(result!).toBeLessThanOrEqual(95);
  });
});

describe("estimateRunningVo2max", () => {
  it("대표 케이스: vVO2max 200m/min → 합리성 범위 내", () => {
    // -4.6 + 0.182258*200 + 0.000104*200*200 = -4.6 + 36.4516 + 4.16 = 36.01
    const result = estimateRunningVo2max(200);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThanOrEqual(20);
  });

  it("엘리트 속도 300m/min → 높은 VO2max", () => {
    const result = estimateRunningVo2max(300);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(50);
  });

  it("0 또는 음수 → null", () => {
    expect(estimateRunningVo2max(0)).toBeNull();
    expect(estimateRunningVo2max(-10)).toBeNull();
  });
});
