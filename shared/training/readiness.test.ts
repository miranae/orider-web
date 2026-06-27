import { describe, it, expect } from "vitest";
import { estimateReadiness } from "./readiness";

describe("estimateReadiness", () => {
  it("입력이 하나도 없으면 null", () => {
    expect(estimateReadiness({})).toBeNull();
    expect(estimateReadiness({ hrvRmssd: 50 })).toBeNull(); // baseline 없으면 HRV 미산정
    expect(estimateReadiness({ restingHr: 50 })).toBeNull(); // baseline 없으면 RHR 미산정
  });

  it("baseline 과 동일하면 중립(~60), good 밴드 하한 근처", () => {
    const r = estimateReadiness({
      hrvRmssd: 60,
      hrvBaselineMean: 60,
      restingHr: 50,
      rhrBaselineMean: 50,
    })!;
    expect(r.factors.hrv).toBe(60);
    expect(r.factors.rhr).toBe(60);
    expect(r.score).toBe(60);
    expect(r.band).toBe("good");
  });

  it("HRV 상승 + RHR 하락 + 충분한 수면 → optimal", () => {
    const r = estimateReadiness({
      hrvRmssd: 80, hrvBaselineMean: 60, hrvBaselineSd: 10, // z=+2 → 110→clamp100
      restingHr: 44, rhrBaselineMean: 50,                    // -6bpm → 60+24=84
      sleepHours: 8,                                          // 100
    })!;
    expect(r.factors.hrv).toBe(100);
    expect(r.factors.sleep).toBe(100);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.band).toBe("optimal");
  });

  it("HRV 급락 + RHR 상승 + 수면 부족 → poor", () => {
    const r = estimateReadiness({
      hrvRmssd: 35, hrvBaselineMean: 60, hrvBaselineSd: 10, // z=-2.5 → 60-62.5→clamp0
      restingHr: 60, rhrBaselineMean: 50,                    // +10bpm → 60-40=20
      sleepHours: 4,                                          // 100-60=40
    })!;
    expect(r.factors.hrv).toBe(0);
    expect(r.score).toBeLessThan(40);
    expect(r.band).toBe("poor");
  });

  it("SD 미상이면 평균의 10% 로 가정", () => {
    // hrv=66, mean=60, sd 미상 → sd=6, z=1 → 60+25=85
    const r = estimateReadiness({ hrvRmssd: 66, hrvBaselineMean: 60 })!;
    expect(r.factors.hrv).toBe(85);
    expect(r.score).toBe(85); // 단일 지표면 그 값이 곧 종합
  });

  it("가용 지표만으로 가중 정규화 (수면 단독)", () => {
    const r = estimateReadiness({ sleepHours: 6 })!; // 100-30=70
    expect(r.factors).toEqual({ sleep: 70 });
    expect(r.score).toBe(70);
    expect(r.band).toBe("good");
  });

  it("수면 8h 대칭 — 6h 와 10h 동일 점수", () => {
    const a = estimateReadiness({ sleepHours: 6 })!;
    const b = estimateReadiness({ sleepHours: 10 })!;
    expect(a.factors.sleep).toBe(b.factors.sleep);
  });
});
