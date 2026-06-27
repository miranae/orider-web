import { describe, expect, it } from "vitest";
import {
  recommendWeeklyLoad,
  RAMP_CAP_FACTOR,
  TSS_PER_AVAILABLE_HOUR,
  OCCUPATION_FACTOR,
} from "./weeklyLoad";

describe("recommendWeeklyLoad — phase 판정", () => {
  it("빌드기: 목표 D-30 + 폼 여유 → build, Balance −10~−30", () => {
    const r = recommendWeeklyLoad({ ctl: 60, tsb: -12, daysUntilGoal: 30 });
    expect(r.balanceGuide.phase).toBe("build");
    expect(r.balanceGuide.lo).toBe(-30);
    expect(r.balanceGuide.hi).toBe(-10);
    // CTL×7 = 420 → build 1.05~1.15 = 441~483
    expect(r.targetTss[0]).toBe(441);
    expect(r.targetTss[1]).toBe(483);
  });

  it("테이퍼: 레이스 D-5 → taper, Balance +5~+15, 볼륨 축소", () => {
    const r = recommendWeeklyLoad({ ctl: 60, tsb: 0, daysUntilGoal: 5 });
    expect(r.balanceGuide.phase).toBe("taper");
    expect(r.balanceGuide.lo).toBe(5);
    expect(r.balanceGuide.hi).toBe(15);
    // 420 × 0.4~0.6 = 168~252
    expect(r.targetTss[0]).toBe(168);
    expect(r.targetTss[1]).toBe(252);
  });

  it("리커버리: 과피로 TSB −35 → recovery, Balance 0~+10", () => {
    const r = recommendWeeklyLoad({ ctl: 60, tsb: -35 });
    expect(r.balanceGuide.phase).toBe("recovery");
    expect(r.balanceGuide.lo).toBe(0);
    expect(r.balanceGuide.hi).toBe(10);
    // 420 × 0.3~0.5 = 126~210
    expect(r.targetTss[0]).toBe(126);
    expect(r.targetTss[1]).toBe(210);
  });

  it("유지기: 목표 없음 + 폼 깊음(−12, 빌드 아님) → maintain", () => {
    // tsb <= -10 이고 목표 없음 → maintain
    const r = recommendWeeklyLoad({ ctl: 50, tsb: -12 });
    expect(r.balanceGuide.phase).toBe("maintain");
    expect(r.balanceGuide.lo).toBe(-15);
    expect(r.balanceGuide.hi).toBe(-5);
  });

  it("폼 여유(tsb > -10) + 목표 없음 → build", () => {
    const r = recommendWeeklyLoad({ ctl: 50, tsb: 0 });
    expect(r.balanceGuide.phase).toBe("build");
  });
});

describe("recommendWeeklyLoad — 경계 및 가드", () => {
  it("CTL 0 → targetTss [0,0], 음수 CTL 도 0 클램프", () => {
    expect(recommendWeeklyLoad({ ctl: 0, tsb: 0 }).targetTss).toEqual([0, 0]);
    expect(recommendWeeklyLoad({ ctl: -5, tsb: 0 }).targetTss).toEqual([0, 0]);
  });

  it("레이스 D-7 정확히 경계 → taper", () => {
    expect(recommendWeeklyLoad({ ctl: 40, tsb: 0, daysUntilGoal: 7 }).balanceGuide.phase).toBe("taper");
  });

  it("레이스 D-8 → build (taper 아님)", () => {
    expect(recommendWeeklyLoad({ ctl: 40, tsb: 0, daysUntilGoal: 8 }).balanceGuide.phase).toBe("build");
  });

  it("build 상한은 ramp cap(CTL×7×1.2) 을 넘지 않음", () => {
    const ctl = 100;
    const r = recommendWeeklyLoad({ ctl, tsb: 0, daysUntilGoal: 30 });
    expect(r.targetTss[1]).toBeLessThanOrEqual(Math.round(ctl * 7 * RAMP_CAP_FACTOR));
  });

  it("lo 는 항상 hi 이하", () => {
    const r = recommendWeeklyLoad({
      ctl: 60,
      tsb: -12,
      daysUntilGoal: 30,
      lifestyle: { weeklyAvailableHours: 2 },
    });
    expect(r.targetTss[0]).toBeLessThanOrEqual(r.targetTss[1]);
  });
});

describe("recommendWeeklyLoad — lifestyle 상한", () => {
  it("가용시간 적으면 hi 가 시간 기반 상한으로 클램프", () => {
    // ctl 60 build hi = 483 이지만 가용 5h → 5×55 = 275 로 제한
    const r = recommendWeeklyLoad({
      ctl: 60,
      tsb: -12,
      daysUntilGoal: 30,
      lifestyle: { weeklyAvailableHours: 5 },
    });
    expect(r.targetTss[1]).toBeLessThanOrEqual(5 * TSS_PER_AVAILABLE_HOUR);
  });

  it("직업부하 high → 상한이 low 대비 낮음", () => {
    const low = recommendWeeklyLoad({
      ctl: 60,
      tsb: -12,
      daysUntilGoal: 30,
      lifestyle: { occupationLoad: "low" },
    });
    const high = recommendWeeklyLoad({
      ctl: 60,
      tsb: -12,
      daysUntilGoal: 30,
      lifestyle: { occupationLoad: "high" },
    });
    expect(high.targetTss[1]).toBeLessThan(low.targetTss[1]);
    expect(OCCUPATION_FACTOR.high).toBeLessThan(OCCUPATION_FACTOR.low);
  });

  it("가용시간 충분하면 시간 상한 영향 없음 (phase 산식대로)", () => {
    const r = recommendWeeklyLoad({
      ctl: 60,
      tsb: -12,
      daysUntilGoal: 30,
      lifestyle: { weeklyAvailableHours: 20 },
    });
    expect(r.targetTss[1]).toBe(483);
  });
});
