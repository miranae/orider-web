import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Activity } from "@shared/types";
import { estimateRunnerLevel } from "./runnerLevel";

const DAY = 86400000;
const WEEK = 7 * DAY;
const NOW = Date.parse("2026-07-15T00:00:00Z");

function run(daysAgo: number, distanceKm: number): Activity {
  return {
    id: `r${daysAgo}-${distanceKm}`,
    type: "Run",
    startTime: NOW - daysAgo * DAY,
    summary: { distance: distanceKm * 1000, averageSpeed: 10, ridingTimeMillis: 1 },
  } as unknown as Activity;
}

/** 8주치 이력을 가진 계정 (관측 기간 충분) */
const ACCOUNT_OLD = NOW - 10 * WEEK;

beforeEach(() => vi.spyOn(console, "debug").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("estimateRunnerLevel — 이력이 충분할 때", () => {
  it("주 3회 이상이면 regular", () => {
    const runs = Array.from({ length: 24 }, (_, i) => run(i * 2 + 1, 8)); // 8주간 24회 = 주 3회
    const r = estimateRunnerLevel(runs, NOW, ACCOUNT_OLD);
    expect(r.level).toBe("regular");
    expect(r.basis).toBe("history");
  });

  it("빈도가 낮아도 장거리(15km↑) 경험이 있으면 regular", () => {
    const runs = [run(3, 21), run(20, 6)];
    expect(estimateRunnerLevel(runs, NOW, ACCOUNT_OLD).level).toBe("regular");
  });

  it("주 1회 미만이고 5km 완주 경험이 없으면 novice", () => {
    const runs = [run(5, 3), run(40, 4)];
    const r = estimateRunnerLevel(runs, NOW, ACCOUNT_OLD);
    expect(r.level).toBe("novice");
    expect(r.longestRunKm).toBe(4);
  });

  it("그 사이는 casual", () => {
    const runs = [run(3, 7), run(10, 6), run(20, 8), run(30, 5)];
    expect(estimateRunnerLevel(runs, NOW, ACCOUNT_OLD).level).toBe("casual");
  });
});

describe("estimateRunnerLevel — 콜드스타트 (데이터 부족 ≠ 초보)", () => {
  it("이력이 4주 미만이면 novice 가 아니라 중립 casual", () => {
    // 갓 연결한 계정: 러닝 1회, 짧은 거리 — 이력만 보면 novice 로 오판하기 쉽다
    const runs = [run(2, 3)];
    const r = estimateRunnerLevel(runs, NOW, NOW - 1 * WEEK);
    expect(r.level).toBe("casual");
    expect(r.basis).toBe("insufficient-history");
  });

  it("러닝이 하나도 없어도 novice 로 떨어뜨리지 않는다", () => {
    const r = estimateRunnerLevel([], NOW, NOW - 2 * DAY);
    expect(r.level).toBe("casual");
    expect(r.basis).toBe("insufficient-history");
  });

  it("백필이 얕아 이력이 짧은 regular 러너를 novice 로 오판하지 않는다", () => {
    // 실제로는 주 4회 뛰는 사람인데 2주치만 동기화된 상태
    const runs = Array.from({ length: 8 }, (_, i) => run(i * 2 + 1, 10));
    const r = estimateRunnerLevel(runs, NOW, NOW - 2 * WEEK);
    expect(r.level).not.toBe("novice");
    expect(r.basis).toBe("insufficient-history");
  });

  it("계정 생성일이 없으면 가장 오래된 러닝으로 관측 기간을 잡는다", () => {
    const runs = [run(3, 5), run(6, 5)];
    const r = estimateRunnerLevel(runs, NOW, null);
    expect(r.weeksObserved).toBeLessThan(4);
    expect(r.basis).toBe("insufficient-history");
  });
});

describe("estimateRunnerLevel — 관측 창", () => {
  it("8주보다 오래된 러닝은 무시한다", () => {
    const old = Array.from({ length: 30 }, (_, i) => run(70 + i, 20));
    const r = estimateRunnerLevel(old, NOW, ACCOUNT_OLD);
    expect(r.longestRunKm).toBe(0);
    expect(r.runsPerWeek).toBe(0);
  });

  it("결과를 로깅한다 (레벨이 툴팁 노출을 바꾸므로 근거 추적 필요)", () => {
    const spy = vi.spyOn(console, "debug");
    estimateRunnerLevel([run(3, 5)], NOW, ACCOUNT_OLD);
    expect(spy).toHaveBeenCalledWith("[runnerLevel.estimate]", expect.objectContaining({ basis: expect.any(String) }));
  });
});
