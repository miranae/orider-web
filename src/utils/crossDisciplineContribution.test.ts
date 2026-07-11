import { describe, it, expect } from "vitest";
import type { UserFitness } from "@shared/types";
import { computeContribution, sliceFor } from "./crossDisciplineContribution";

function fitness(bike: number, run: number, swim: number): UserFitness {
  const b = (ctl: number) => ({ ctl, atl: 0, tsb: 0, weeklyTSS: 0 });
  return {
    updatedAt: 0,
    totalCTL: bike + run + swim,
    totalATL: 0,
    totalTSB: 0,
    breakdown: { bike: b(bike), run: b(run), swim: b(swim) },
    thresholds: {
      bike: { ftp: 200 },
      run: { thresholdPace: 300 },
      swim: { css: 100 },
    },
  };
}

describe("computeContribution", () => {
  it("종목별 CTL 비율을 정수 퍼센트로 낸다", () => {
    const c = computeContribution(fitness(30, 25, 5))!;
    expect(c.totalCtl).toBe(60);
    expect(sliceFor(c, "bike").pct).toBe(50);
    expect(sliceFor(c, "run").pct).toBe(42);
    expect(sliceFor(c, "swim").pct).toBe(8);
  });

  it("퍼센트 합은 항상 100 (반올림 오차를 최대 조각이 흡수)", () => {
    // 각 33.33% → 독립 반올림 시 합 99
    const c = computeContribution(fitness(10, 10, 10))!;
    expect(c.slices.reduce((s, x) => s + x.pct, 0)).toBe(100);
  });

  it("반올림 합이 101 이 되는 경우도 100 으로 보정", () => {
    // 16.67 / 16.67 / 66.67 → 17+17+67 = 101
    const c = computeContribution(fitness(10, 10, 40))!;
    expect(c.slices.reduce((s, x) => s + x.pct, 0)).toBe(100);
  });

  it("최대 기여 종목을 dominant 로 반환", () => {
    expect(computeContribution(fitness(10, 40, 5))!.dominant).toBe("run");
  });

  it("두 종목 이상에 부하가 있어야 멀티스포츠", () => {
    expect(computeContribution(fitness(0, 30, 0))!.isMultiDiscipline).toBe(false);
    expect(computeContribution(fitness(10, 30, 0))!.isMultiDiscipline).toBe(true);
  });

  it("총 CTL 이 0 이면 전부 0, dominant 없음", () => {
    const c = computeContribution(fitness(0, 0, 0))!;
    expect(c.totalCtl).toBe(0);
    expect(c.dominant).toBeNull();
    expect(c.slices.every((s) => s.pct === 0)).toBe(true);
  });

  it("음수 CTL 은 0 으로 클램프", () => {
    const c = computeContribution(fitness(-5, 20, 0))!;
    expect(sliceFor(c, "bike").ctl).toBe(0);
    expect(sliceFor(c, "run").pct).toBe(100);
  });

  it("문서가 없으면 null (카드를 렌더하지 않는다)", () => {
    expect(computeContribution(null)).toBeNull();
    expect(computeContribution(undefined)).toBeNull();
    expect(computeContribution({} as UserFitness)).toBeNull();
  });
});
