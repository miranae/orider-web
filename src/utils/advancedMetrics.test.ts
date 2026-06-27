import { describe, it, expect } from "vitest";
import {
  wPrimeBalanceSeries,
  avgMax,
  calculateWorkKj,
  calculateEF,
  calculateDecoupling,
  calculateHrDrift,
  calculateTRIMP,
  calculateXPower,
  analyzeMatches,
  estimateCriticalPower,
} from "./advancedMetrics";

// 서버 functions/src/analysis/activity-metrics.ts:wPrimeBalanceMin 과 동일 알고리즘(미러 검증용).
function serverWPrimeBalanceMin(
  watts: number[],
  cp: number,
  wPrimeMax: number,
  dtSec: number,
): number {
  let bal = wPrimeMax;
  let min = wPrimeMax;
  for (const w of watts) {
    if (!Number.isFinite(w)) continue;
    if (w > cp) {
      bal -= (w - cp) * dtSec;
      if (bal < 0) bal = 0;
    } else {
      const tau = 546 * Math.exp(-0.01 * (cp - w)) + 316;
      bal += (wPrimeMax - bal) * (1 - Math.exp(-dtSec / tau));
      if (bal > wPrimeMax) bal = wPrimeMax;
    }
    if (bal < min) min = bal;
  }
  return min;
}

describe("wPrimeBalanceSeries", () => {
  const CP = 250;
  const WPRIME = 20000; // 20 kJ

  it("유효하지 않은 입력은 null", () => {
    expect(wPrimeBalanceSeries(Array(10).fill(300), CP, WPRIME, 1)).toBeNull(); // 30 미만
    expect(wPrimeBalanceSeries(Array(60).fill(300), null, WPRIME, 1)).toBeNull(); // cp 없음
    expect(wPrimeBalanceSeries(Array(60).fill(300), CP, 0, 1)).toBeNull(); // wPrimeMax 0
    expect(wPrimeBalanceSeries(Array(60).fill(300), CP, WPRIME, 0)).toBeNull(); // dt 0
    expect(wPrimeBalanceSeries(undefined, CP, WPRIME, 1)).toBeNull();
  });

  it("CP 초과 일정 파워는 선형 고갈 (P>CP 구간)", () => {
    // P=350, CP=250 → 초당 100J 소모. 120초 → 20000 - 12000 = 8000.
    const watts = Array(120).fill(350);
    const res = wPrimeBalanceSeries(watts, CP, WPRIME, 1)!;
    expect(res).not.toBeNull();
    expect(res.minJ).toBeCloseTo(8000, 0);
    // 단조 감소 → 최저점은 마지막 버킷
    expect(res.idxMin).toBe(res.series.length - 1);
  });

  it("고갈 후 회복 — 최저점은 전환 구간, 종료값은 그보다 높음", () => {
    const watts = [...Array(60).fill(450), ...Array(120).fill(150)]; // 고갈 후 sub-CP 회복
    const res = wPrimeBalanceSeries(watts, CP, WPRIME, 1)!;
    expect(res.minJ).toBeLessThan(res.series[res.series.length - 1]!);
    expect(res.minJ).toBeGreaterThanOrEqual(0);
  });

  it("0 으로 바닥 고정 (장시간 초고출력)", () => {
    const watts = Array(300).fill(600); // 초당 350J × 300 = 105kJ ≫ 20kJ
    const res = wPrimeBalanceSeries(watts, CP, WPRIME, 1)!;
    expect(res.minJ).toBe(0);
  });

  it("minJ 가 서버 wPrimeBalanceMin 과 일치 (미러 검증)", () => {
    // 가변 파워 프로파일 — 고갈/회복 혼합
    const watts: number[] = [];
    for (let i = 0; i < 600; i++) {
      watts.push(i % 3 === 0 ? 400 : i % 3 === 1 ? 180 : 320);
    }
    const res = wPrimeBalanceSeries(watts, CP, WPRIME, 1)!;
    const serverMin = serverWPrimeBalanceMin(watts, CP, WPRIME, 1);
    // 클라는 버킷-최소 다운샘플 → 풀 해상도 최저점을 보존하므로 일치(반올림 오차만)
    expect(res.minJ).toBeCloseTo(serverMin, 0);
  });

  it("maxPoints 다운샘플 — series 길이는 maxPoints 이하, 저점 보존", () => {
    const watts = Array(2000).fill(0).map((_, i) => 250 + Math.sin(i / 10) * 200);
    const res = wPrimeBalanceSeries(watts, CP, WPRIME, 1, 200)!;
    expect(res.series.length).toBeLessThanOrEqual(200);
    // 다운샘플 최저점이 풀 해상도 서버 최저점과 근접(버킷-최소 보존)
    const serverMin = serverWPrimeBalanceMin(watts, CP, WPRIME, 1);
    expect(res.minJ).toBeCloseTo(serverMin, 0);
  });
});

describe("avgMax", () => {
  it("평균·최대·개수", () => {
    expect(avgMax([1, 2, 3])).toEqual({ avg: 2, max: 3, count: 3 });
  });
  it("빈/무효 입력 → null", () => {
    expect(avgMax([])).toEqual({ avg: null, max: null, count: 0 });
    expect(avgMax(undefined)).toEqual({ avg: null, max: null, count: 0 });
    expect(avgMax([NaN, Infinity])).toEqual({ avg: null, max: null, count: 0 });
  });
  it("ignoreZero — 0 제외", () => {
    expect(avgMax([0, 0, 4], { ignoreZero: true })).toEqual({ avg: 4, max: 4, count: 1 });
  });
});

describe("calculateWorkKj", () => {
  it("Σwatts/1000 (1Hz)", () => {
    expect(calculateWorkKj(Array(10).fill(1000))).toBe(10);
    expect(calculateWorkKj([])).toBe(0);
  });
});

describe("calculateXPower", () => {
  it("25 미만 → null", () => {
    expect(calculateXPower(Array(24).fill(200))).toBeNull();
  });
  it("일정 파워 → 그 값으로 수렴", () => {
    expect(calculateXPower(Array(100).fill(200))!).toBeCloseTo(200, 5);
  });
});

describe("analyzeMatches", () => {
  it("FTP 초과 지속구간(≥minSeconds) 집계", () => {
    const watts = [...Array(60).fill(300), ...Array(60).fill(100)]; // 60s @300 > ftp 250
    const m = analyzeMatches(watts, 250, 30);
    expect(m.count).toBe(1);
    expect(m.totalSeconds).toBe(60);
    expect(m.avgPower).toBe(300);
    expect(m.longestSeconds).toBe(60);
  });
  it("minSeconds 미만 구간은 무시", () => {
    const watts = [...Array(20).fill(300), ...Array(60).fill(100)]; // 20s < 30
    expect(analyzeMatches(watts, 250, 30).count).toBe(0);
  });
});

describe("estimateCriticalPower", () => {
  it("P(t)=W'/t+CP 완전선형 → CP·W'·R² 복원", () => {
    const CP = 250, WPRIME = 20000;
    const curve = [180, 300, 600, 1200].map((t) => ({ durationSeconds: t, maxPower: CP + WPRIME / t }));
    const est = estimateCriticalPower(curve)!;
    expect(est.cp).toBeCloseTo(250, 3);
    expect(est.wPrime).toBeCloseTo(20000, 0);
    expect(est.rSquared).toBeCloseTo(1, 5);
  });
  it("3분~20분 구간 점이 2개 미만이면 null", () => {
    expect(estimateCriticalPower([{ durationSeconds: 60, maxPower: 400 }])).toBeNull();
    expect(estimateCriticalPower([])).toBeNull();
  });
  it("음수 CP/W' (비물리적 회귀) → null", () => {
    // duration 증가에 파워도 증가하는 비현실 곡선 → slope(W') 음수 → null
    const curve = [{ durationSeconds: 180, maxPower: 200 }, { durationSeconds: 1200, maxPower: 400 }];
    expect(estimateCriticalPower(curve)).toBeNull();
  });
});

describe("calculateEF / Decoupling / HrDrift", () => {
  it("EF = NP/avgHR", () => {
    const ef = calculateEF(Array(60).fill(200), Array(60).fill(150))!;
    expect(ef).toBeCloseTo(200 / 150, 1);
  });
  it("EF — HR 0 이거나 데이터 부족 시 null", () => {
    expect(calculateEF(Array(60).fill(200), Array(60).fill(0))).toBeNull();
  });
  it("Decoupling — 600 미만 null, 후반 HR 상승 시 양수", () => {
    expect(calculateDecoupling(Array(100).fill(200), Array(100).fill(150))).toBeNull();
    const watts = Array(600).fill(200);
    const hr = [...Array(300).fill(150), ...Array(300).fill(165)];
    expect(calculateDecoupling(watts, hr)!).toBeGreaterThan(0);
  });
  it("HrDrift — 600 미만 null, 후반 상승률(%)", () => {
    expect(calculateHrDrift(Array(100).fill(150))).toBeNull();
    const hr = [...Array(300).fill(150), ...Array(300).fill(165)];
    expect(calculateHrDrift(hr)!).toBeCloseTo(10, 0); // (165-150)/150
  });
});

describe("calculateTRIMP", () => {
  it("maxHr<=restHr 또는 빈 입력 → null", () => {
    expect(calculateTRIMP([], 190)).toBeNull();
    expect(calculateTRIMP(Array(60).fill(150), 60, 60)).toBeNull();
  });
  it("HR 높을수록 TRIMP 증가(단조)", () => {
    const low = calculateTRIMP(Array(600).fill(120), 190, 60)!;
    const high = calculateTRIMP(Array(600).fill(170), 190, 60)!;
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
  });
});
