import { describe, it, expect } from "vitest";
import { calculateNP, calculateVI, calculateTSS, calculateIF } from "./powerMetrics";

describe("calculateNP", () => {
  it("30 미만 → null", () => {
    expect(calculateNP(Array(29).fill(200))).toBeNull();
  });
  it("일정 파워 → 그 값", () => {
    expect(calculateNP(Array(60).fill(200))!).toBeCloseTo(200, 5);
  });
  it("NaN 입력 → null (전파 차단, #538)", () => {
    const watts = Array(60).fill(200);
    watts[10] = NaN;
    expect(calculateNP(watts)).toBeNull();
  });
});

describe("calculateVI (#538 near-zero·NaN 가드)", () => {
  it("일정 파워 → VI≈1", () => {
    expect(calculateVI(Array(60).fill(200))!).toBeCloseTo(1, 2);
  });
  it("평균 0 근처(대량 0 코스팅) → null (폭주 방지)", () => {
    // 30개만 파워, 나머지 9970개 0 → avg ≈ 0.6W < 1W 하한
    const watts = [...Array(30).fill(200), ...Array(9970).fill(0)];
    expect(calculateVI(watts)).toBeNull();
  });
  it("음수 글리치 평균이 0 근처 → null", () => {
    const watts = [...Array(30).fill(200), ...Array(9970).fill(-1)];
    expect(calculateVI(watts)).toBeNull();
  });
  it("NaN 섞여도 폭주/ NaN 반환 안 함", () => {
    const watts = Array(60).fill(200);
    watts[5] = NaN;
    // NP 가 null 이 되므로 VI 도 null (NaN 반환 아님)
    expect(calculateVI(watts)).toBeNull();
  });
});

describe("calculateTSS / calculateIF", () => {
  it("IF = NP/FTP, FTP<=0 → null", () => {
    expect(calculateIF(Array(60).fill(200), 250)!).toBeCloseTo(0.8, 2);
    expect(calculateIF(Array(60).fill(200), 0)).toBeNull();
  });
  it("TSS = (sec·NP·IF)/(FTP·3600)·100 — FTP에서 1시간 ≈ 100", () => {
    const tss = calculateTSS(Array(3600).fill(250), 250)!;
    expect(tss).toBeCloseTo(100, 0);
  });
});
