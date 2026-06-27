import { describe, it, expect } from "vitest";
import { calculateRunSplits, calculateOverallGap } from "./runMetrics";

// 1 m/s 등속 러너 — distance[i]=i(m), time[i]=i(s), 길이 meters+1.
function steadyRun(meters: number, opts?: { altitude?: (i: number) => number; hr?: number }) {
  const n = meters + 1;
  const distance = Array.from({ length: n }, (_, i) => i);
  const time = Array.from({ length: n }, (_, i) => i);
  const out: { distance: number[]; time: number[]; altitude?: number[]; heartrate?: number[] } = { distance, time };
  if (opts?.altitude) out.altitude = Array.from({ length: n }, (_, i) => opts.altitude!(i));
  if (opts?.hr != null) out.heartrate = Array(n).fill(opts.hr);
  return out;
}

describe("calculateRunSplits", () => {
  it("distance 없으면 빈 배열", () => {
    expect(calculateRunSplits({})).toEqual([]);
    expect(calculateRunSplits({ distance: [] })).toEqual([]);
  });

  it("2km 등속 → 2 스플릿, pace 1000 s/km, 고도 없으면 GAP null", () => {
    const splits = calculateRunSplits(steadyRun(2000, { hr: 150 }));
    expect(splits).toHaveLength(2);
    expect(splits[0]!.km).toBe(1);
    expect(splits[0]!.paceSecPerKm).toBeCloseTo(1000, 0);
    expect(splits[0]!.gapSecPerKm).toBeNull();
    expect(splits[0]!.avgHr).toBeCloseTo(150, 0);
  });

  it("평지(고도 일정) → GAP ≈ pace (minettiCost(0)=C_FLAT)", () => {
    const splits = calculateRunSplits(steadyRun(2000, { altitude: () => 100 }));
    expect(splits[0]!.gapSecPerKm).not.toBeNull();
    expect(splits[0]!.gapSecPerKm!).toBeCloseTo(splits[0]!.paceSecPerKm, 0);
    expect(splits[0]!.elevationGain).toBe(0);
  });

  it("오르막(5% 경사) → GAP < pace (등가 평지 페이스가 더 빠름) + 고도상승 누적", () => {
    const splits = calculateRunSplits(steadyRun(1000, { altitude: (i) => 100 + i * 0.05 }));
    expect(splits).toHaveLength(1);
    expect(splits[0]!.gapSecPerKm!).toBeLessThan(splits[0]!.paceSecPerKm);
    expect(splits[0]!.elevationGain).toBeGreaterThan(0);
    expect(splits[0]!.elevationLoss).toBe(0);
  });
});

describe("calculateOverallGap", () => {
  it("고도 없으면 null", () => {
    expect(calculateOverallGap(steadyRun(2000))).toBeNull();
  });
  it("스플릿 GAP 평균 — 오르막은 pace 보다 작음", () => {
    const input = steadyRun(2000, { altitude: (i) => 100 + i * 0.05 });
    const gap = calculateOverallGap(input)!;
    expect(gap).not.toBeNull();
    expect(gap).toBeLessThan(1000); // pace 1000 보다 빠른 등가 페이스
  });
  it("distance 없으면 null", () => {
    expect(calculateOverallGap({})).toBeNull();
  });
});
