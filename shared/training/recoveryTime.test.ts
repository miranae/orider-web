import { describe, expect, it } from "vitest";
import {
  estimateRecoveryHours,
  RECOVERY_MIN_HOURS,
  RECOVERY_MAX_HOURS,
} from "./recoveryTime";

describe("estimateRecoveryHours", () => {
  it("ratio×12 로 시간 산출 — load=70, ctl=35 → ratio 2 → 24h, high", () => {
    const r = estimateRecoveryHours({ load: 70, ctl: 35 });
    expect(r).toEqual({ hours: 24, band: "high" });
  });

  it("CTL 미상 시 기본 체력(35) 사용 — load=70 → 24h", () => {
    expect(estimateRecoveryHours({ load: 70 })?.hours).toBe(24);
  });

  it("체력이 높을수록 회복이 빠르다(같은 load)", () => {
    const fit = estimateRecoveryHours({ load: 100, ctl: 80 })!.hours;
    const unfit = estimateRecoveryHours({ load: 100, ctl: 30 })!.hours;
    expect(fit).toBeLessThan(unfit);
  });

  it("하한 clamp — 아주 작은 부하도 최소 6h", () => {
    expect(estimateRecoveryHours({ load: 5, ctl: 80 })?.hours).toBe(RECOVERY_MIN_HOURS);
  });

  it("상한 clamp — 거대한 부하도 최대 72h", () => {
    expect(estimateRecoveryHours({ load: 1000, ctl: 20 })?.hours).toBe(RECOVERY_MAX_HOURS);
  });

  it("저CTL은 MIN_CTL(10)로 바닥 처리 — 과대 회복 방지", () => {
    // ctl=2 여도 분모는 10 → load=20 → ratio 2 → 24h (2가 아니라 10 사용)
    expect(estimateRecoveryHours({ load: 20, ctl: 2 })?.hours).toBe(24);
  });

  it("밴드 경계: <12 light, <24 moderate, <48 high, 그 이상 very_high", () => {
    expect(estimateRecoveryHours({ load: 20, ctl: 35 })?.band).toBe("light");      // ~7h
    expect(estimateRecoveryHours({ load: 50, ctl: 35 })?.band).toBe("moderate");   // ~17h
    expect(estimateRecoveryHours({ load: 70, ctl: 35 })?.band).toBe("high");       // 24h
    expect(estimateRecoveryHours({ load: 200, ctl: 35 })?.band).toBe("very_high"); // 68h
  });

  it("유효하지 않은 load 는 null", () => {
    expect(estimateRecoveryHours({ load: 0 })).toBeNull();
    expect(estimateRecoveryHours({ load: -10 })).toBeNull();
    expect(estimateRecoveryHours({ load: NaN })).toBeNull();
  });
});
