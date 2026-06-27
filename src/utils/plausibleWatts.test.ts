import { describe, expect, it } from "vitest";
import { plausibleWatts } from "./plausibleWatts";

describe("plausibleWatts", () => {
  it("빈/없는 입력은 그대로", () => {
    expect(plausibleWatts(undefined, 200)).toBeUndefined();
    expect(plausibleWatts([], 200)).toEqual([]);
  });

  it("정상 파워는 통과(고립 스파이크만 2000W 클램프)", () => {
    // 평균이 cap 아래로 유지되도록 정상 샘플 다수 + 고립 스파이크 1개.
    const raw = Array.from({ length: 100 }, () => 150);
    raw[50] = 2500; // 고립 스파이크 → 2000 클램프 (평균 ≈173 < cap 500)
    const out = plausibleWatts(raw, 250)!;
    expect(out[50]).toBe(2000);
    expect(out[0]).toBe(150);
    expect(out.length).toBe(100);
  });

  it("평균이 2×FTP 초과면 undefined(파워 신뢰 불가)", () => {
    // FTP 200, 평균 492 = 2.46×FTP → 무효.
    const raw = Array.from({ length: 100 }, () => 492);
    expect(plausibleWatts(raw, 200)).toBeUndefined();
  });

  it("평균은 정상이나 5분 지속파워가 2×FTP 초과면 undefined", () => {
    // FTP 200. 대부분 100W(정상 평균)인데 5분(300s) 구간이 1700W → 5분평균>400.
    const raw = Array.from({ length: 4000 }, () => 100);
    for (let i = 0; i < 300; i++) raw[i] = 1700;
    // 전체평균: (300*1700 + 3700*100)/4000 = (510000+370000)/4000 = 220 < 400(통과)
    // 5분 최대평균 = 1700 > 400 → 무효.
    expect(plausibleWatts(raw, 200)).toBeUndefined();
  });

  it("FTP 미상이면 600W(평균)/700W(5분) 폴백 cap", () => {
    expect(plausibleWatts(Array.from({ length: 50 }, () => 700), undefined)).toBeUndefined(); // 700>600
    expect(plausibleWatts(Array.from({ length: 50 }, () => 500), undefined)).toEqual(Array.from({ length: 50 }, () => 500));
  });

  it("음수/비유한 샘플은 평균 계산에서 무시", () => {
    const raw = [100, -5, NaN, 200];
    // 유효 평균 = (100+200)/2 = 150, FTP 200 → cap 400, 통과. 클램프 없음.
    expect(plausibleWatts(raw, 200)).toEqual([100, -5, NaN, 200]);
  });
});
