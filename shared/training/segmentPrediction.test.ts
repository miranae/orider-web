import { describe, expect, it } from "vitest";
import { predictSegmentTimeSec, predictedRank } from "./segmentPrediction";

describe("predictSegmentTimeSec", () => {
  const base = { distanceM: 5000, avgGradePct: 7, cp: 250, wPrime: 20000, riderWeightKg: 70 };

  it("정상 입력에 양의 합리적 시간(초) 반환", () => {
    const t = predictSegmentTimeSec(base)!;
    expect(t).toBeGreaterThan(0);
    // 5km 7% 업힐 ~ 수백~수천초 범위
    expect(t).toBeGreaterThan(300);
    expect(t).toBeLessThan(4000);
  });

  it("파워(CP)가 높을수록 빠르다(시간↓)", () => {
    const slow = predictSegmentTimeSec({ ...base, cp: 200 })!;
    const fast = predictSegmentTimeSec({ ...base, cp: 320 })!;
    expect(fast).toBeLessThan(slow);
  });

  it("경사가 가파를수록 느리다(시간↑)", () => {
    const mild = predictSegmentTimeSec({ ...base, avgGradePct: 3 })!;
    const steep = predictSegmentTimeSec({ ...base, avgGradePct: 12 })!;
    expect(steep).toBeGreaterThan(mild);
  });

  it("체중이 무거우면 업힐에서 느리다", () => {
    const light = predictSegmentTimeSec({ ...base, riderWeightKg: 60 })!;
    const heavy = predictSegmentTimeSec({ ...base, riderWeightKg: 90 })!;
    expect(heavy).toBeGreaterThan(light);
  });

  it("필수 입력 유효하지 않으면 null", () => {
    expect(predictSegmentTimeSec({ ...base, cp: 0 })).toBeNull();
    expect(predictSegmentTimeSec({ ...base, distanceM: 0 })).toBeNull();
    expect(predictSegmentTimeSec({ ...base, riderWeightKg: 0 })).toBeNull();
  });

  it("W'=0(또는 비유한)도 동작(CP만으로)", () => {
    const t = predictSegmentTimeSec({ ...base, wPrime: 0 })!;
    expect(t).toBeGreaterThan(0);
    expect(predictSegmentTimeSec({ ...base, wPrime: NaN })).not.toBeNull();
  });
});

describe("predictedRank", () => {
  it("예상보다 빠른 effort 수 + 1", () => {
    expect(predictedRank(600, [500, 550, 700, 800])).toBe(3); // 500,550 faster → #3
  });
  it("모두 느리면 1위", () => {
    expect(predictedRank(400, [500, 600])).toBe(1);
  });
  it("0/비유한 effort 무시", () => {
    expect(predictedRank(600, [500, 0, NaN, -5])).toBe(2); // only 500 valid&faster
  });
  it("빈 리더보드면 1위", () => {
    expect(predictedRank(600, [])).toBe(1);
  });
});
