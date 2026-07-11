import { describe, it, expect } from "vitest";
import type { Activity } from "@shared/types";
import { computeRunWeeklyRecap, isRecapVisible } from "./runWeeklyRecap";
import { seoulWeekday } from "./seoulWeek";

const kst = (iso: string) => new Date(`${iso}+09:00`).getTime();
const NOW = kst("2026-07-15T10:00:00"); // 수요일

/** 지난주 = 07-06(월) ~ 07-12(일), 그 전주 = 06-29 ~ 07-05 */
function run(startIso: string, distanceKm: number, paceSecPerKm: number): Activity {
  return {
    id: `a-${startIso}`,
    type: "Run",
    startTime: kst(startIso),
    summary: {
      distance: distanceKm * 1000,
      averageSpeed: 3600 / paceSecPerKm, // sec/km → km/h
      ridingTimeMillis: distanceKm * paceSecPerKm * 1000,
    },
  } as unknown as Activity;
}

describe("computeRunWeeklyRecap — 집계", () => {
  it("지난주/그 전주를 분리해 횟수·거리·평균 페이스를 낸다", () => {
    const runs = [
      run("2026-07-07T07:00:00", 10, 350), // 지난주
      run("2026-07-09T07:00:00", 5, 330), // 지난주
      run("2026-07-01T07:00:00", 8, 360), // 그 전주
    ];
    const r = computeRunWeeklyRecap(runs, NOW);
    expect(r.lastWeek.count).toBe(2);
    expect(r.lastWeek.distanceKm).toBe(15);
    expect(r.prevWeek.count).toBe(1);
    expect(r.prevWeek.avgPaceSecPerKm).toBe(360);
  });

  it("평균 페이스는 거리 가중 — 짧은 회복 조깅이 평균을 지배하지 않는다", () => {
    const runs = [
      run("2026-07-07T07:00:00", 20, 350), // 긴 러닝
      run("2026-07-09T07:00:00", 1, 500), // 아주 느린 짧은 조깅
    ];
    const r = computeRunWeeklyRecap(runs, NOW);
    // 단순 평균이면 425, 거리 가중이면 ~357
    const expected = Math.round((20 * 350 + 1 * 500) / 21);
    expect(r.lastWeek.avgPaceSecPerKm).toBe(expected);
    expect(r.lastWeek.avgPaceSecPerKm).toBeLessThan(370);
  });

  it("이번 주 러닝은 지난주 집계에 들어가지 않는다", () => {
    const runs = [run("2026-07-14T07:00:00", 10, 350)]; // 이번 주 화요일
    const r = computeRunWeeklyRecap(runs, NOW);
    expect(r.lastWeek.count).toBe(0);
    expect(r.prevWeek.count).toBe(0);
  });

  it("주 경계(월요일 00:00 KST)는 시작 포함", () => {
    const runs = [run("2026-07-06T00:00:00", 5, 350)];
    expect(computeRunWeeklyRecap(runs, NOW).lastWeek.count).toBe(1);
  });

  it("거리나 속도가 0 인 활동은 페이스 계산에서도, 횟수에서도 제외", () => {
    const bad = { ...run("2026-07-07T07:00:00", 0, 350) } as Activity;
    const r = computeRunWeeklyRecap([bad], NOW);
    // 이전에는 count 가 1 이라 "1번 달려서 0km" 가 나올 수 있었다 (코드리뷰 지적).
    expect(r.lastWeek.count).toBe(0);
    expect(r.lastWeek.avgPaceSecPerKm).toBeNull();
  });
});

describe("computeRunWeeklyRecap — 추세 (페이스는 낮을수록 좋다)", () => {
  const prev = run("2026-07-01T07:00:00", 10, 360);

  it("지난주가 빠르면 faster + 양수 델타", () => {
    const r = computeRunWeeklyRecap([prev, run("2026-07-07T07:00:00", 10, 352)], NOW);
    expect(r.trend).toBe("faster");
    expect(r.paceDeltaSec).toBe(8);
  });

  it("지난주가 느리면 slower + 음수 델타", () => {
    const r = computeRunWeeklyRecap([prev, run("2026-07-07T07:00:00", 10, 370)], NOW);
    expect(r.trend).toBe("slower");
    expect(r.paceDeltaSec).toBe(-10);
  });

  it("3초 미만 차이는 steady", () => {
    const r = computeRunWeeklyRecap([prev, run("2026-07-07T07:00:00", 10, 358)], NOW);
    expect(r.trend).toBe("steady");
  });

  it("비교할 주가 없으면 unknown", () => {
    const r = computeRunWeeklyRecap([run("2026-07-07T07:00:00", 10, 350)], NOW);
    expect(r.trend).toBe("unknown");
    expect(r.paceDeltaSec).toBeNull();
  });

  // 코드리뷰 지적 — 거리 0 러닝이 횟수에만 잡히면 "1번 달려서 0km" 가 나온다.
  it("거리 0 러닝은 횟수에서도 제외한다", () => {
    const zero = { ...run("2026-07-07T07:00:00", 0, 350) } as Activity;
    (zero.summary as { distance: number }).distance = 0;
    const r = computeRunWeeklyRecap([zero, run("2026-07-08T07:00:00", 5, 350)], NOW);
    expect(r.lastWeek.count).toBe(1);
    expect(r.lastWeek.distanceKm).toBe(5);
  });
});

describe("isRecapVisible", () => {
  it("월~수에는 보인다", () => {
    for (const iso of ["2026-07-13T09:00:00", "2026-07-14T09:00:00", "2026-07-15T09:00:00"]) {
      expect(isRecapVisible(kst(iso), seoulWeekday)).toBe(true);
    }
  });

  it("목~일에는 숨긴다 (지난주가 더 이상 신선하지 않다)", () => {
    for (const iso of ["2026-07-16T09:00:00", "2026-07-19T09:00:00"]) {
      expect(isRecapVisible(kst(iso), seoulWeekday)).toBe(false);
    }
  });
});
