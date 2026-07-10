import { describe, it, expect } from "vitest";
import type { Activity } from "@shared/types";
import { computeYearRecap, availableRecapYears } from "./yearRecap";

/** 테스트용 최소 Activity. summary 핵심 필드만 채우고 나머지는 캐스팅으로 우회. */
function act(opts: {
  id?: string;
  type?: string;
  /** ISO 또는 epoch ms */
  start: string | number;
  /** km */
  distanceKm?: number;
  /** 분 (경과) */
  minutes?: number;
  /** 분 (이동, 있으면 우선) */
  movingMinutes?: number;
  /** m */
  elevation?: number;
  calories?: number | null;
}): Activity {
  const startTime = typeof opts.start === "number" ? opts.start : new Date(opts.start).getTime();
  return {
    id: opts.id ?? "a",
    type: opts.type ?? "Ride",
    startTime,
    summary: {
      distance: (opts.distanceKm ?? 0) * 1000,
      ridingTimeMillis: (opts.minutes ?? 0) * 60000,
      movingTimeSec: opts.movingMinutes != null ? opts.movingMinutes * 60 : undefined,
      elevationGain: opts.elevation ?? 0,
      calories: opts.calories ?? null,
    },
  } as unknown as Activity;
}

describe("computeYearRecap — 합계", () => {
  it("연도 필터링 후 총 거리/시간/고도/칼로리/활동수를 합산한다", () => {
    const acts = [
      act({ id: "1", start: "2026-01-10T08:00:00", distanceKm: 30, minutes: 60, elevation: 200, calories: 500 }),
      act({ id: "2", start: "2026-06-15T08:00:00", distanceKm: 50, minutes: 120, elevation: 800, calories: 900 }),
      // 다른 연도 — 제외돼야 함
      act({ id: "3", start: "2025-12-31T23:00:00", distanceKm: 100, minutes: 300, elevation: 1500, calories: 2000 }),
    ];
    const r = computeYearRecap(acts, 2026);
    expect(r.totalCount).toBe(2);
    expect(r.totalDistanceMeters).toBe(80000);
    expect(r.totalDurationMillis).toBe((60 + 120) * 60000);
    expect(r.totalElevationMeters).toBe(1000);
    expect(r.totalCalories).toBe(1400);
  });

  it("movingTimeSec 가 있으면 경과 대신 이동 시간을 쓴다", () => {
    const r = computeYearRecap(
      [act({ start: "2026-02-01T08:00:00", minutes: 100, movingMinutes: 80 })],
      2026,
    );
    expect(r.totalDurationMillis).toBe(80 * 60000);
  });

  it("활동이 없으면 0 으로 채운다", () => {
    const r = computeYearRecap([], 2026);
    expect(r.totalCount).toBe(0);
    expect(r.totalDistanceMeters).toBe(0);
    expect(r.byDiscipline).toEqual([]);
    expect(r.topDiscipline).toBeNull();
    expect(r.longestDistance).toBeNull();
    expect(r.monthly).toHaveLength(12);
  });

  it("음수/NaN/null summary 값은 0 으로 방어한다", () => {
    const bad = {
      id: "x",
      type: "Ride",
      startTime: new Date("2026-03-01T08:00:00").getTime(),
      summary: {
        distance: -10,
        ridingTimeMillis: Number.NaN,
        elevationGain: null,
        calories: undefined,
      },
    } as unknown as Activity;
    const r = computeYearRecap([bad], 2026);
    expect(r.totalDistanceMeters).toBe(0);
    expect(r.totalDurationMillis).toBe(0);
    expect(r.totalElevationMeters).toBe(0);
    expect(r.totalCalories).toBe(0);
  });
});

describe("computeYearRecap — 종목별 분해", () => {
  it("종목을 분류하고 거리 내림차순으로 정렬한다", () => {
    const acts = [
      act({ id: "r1", type: "Run", start: "2026-01-10T08:00:00", distanceKm: 10 }),
      act({ id: "b1", type: "Ride", start: "2026-01-11T08:00:00", distanceKm: 40 }),
      act({ id: "b2", type: "VirtualRide", start: "2026-01-12T08:00:00", distanceKm: 20 }),
      act({ id: "s1", type: "Swim", start: "2026-01-13T08:00:00", distanceKm: 2 }),
    ];
    const r = computeYearRecap(acts, 2026);
    expect(r.byDiscipline.map((d) => d.discipline)).toEqual(["bike", "run", "swim"]);
    const bike = r.byDiscipline.find((d) => d.discipline === "bike")!;
    expect(bike.count).toBe(2);
    expect(bike.distanceMeters).toBe(60000);
  });

  it("topDiscipline 은 활동수 기준으로 고른다", () => {
    const acts = [
      act({ id: "r1", type: "Run", start: "2026-01-10T08:00:00", distanceKm: 10 }),
      act({ id: "r2", type: "Run", start: "2026-01-11T08:00:00", distanceKm: 10 }),
      act({ id: "b1", type: "Ride", start: "2026-01-12T08:00:00", distanceKm: 100 }),
    ];
    const r = computeYearRecap(acts, 2026);
    expect(r.topDiscipline).toBe("run");
  });
});

describe("computeYearRecap — 최고 노력 & 월별 & 활동일", () => {
  it("최장거리·최장시간·최대고도 단일 활동을 찾는다", () => {
    const acts = [
      act({ id: "a", start: "2026-01-10T08:00:00", distanceKm: 30, minutes: 60, elevation: 200 }),
      act({ id: "b", start: "2026-02-10T08:00:00", distanceKm: 80, minutes: 90, elevation: 1500 }),
      act({ id: "c", start: "2026-03-10T08:00:00", distanceKm: 50, minutes: 300, elevation: 400 }),
    ];
    const r = computeYearRecap(acts, 2026);
    expect(r.longestDistance?.activityId).toBe("b");
    expect(r.longestDuration?.activityId).toBe("c");
    expect(r.biggestClimb?.activityId).toBe("b");
  });

  it("월별 추이는 12칸이며 해당 월에 집계된다", () => {
    const acts = [
      act({ id: "a", start: "2026-01-05T08:00:00", distanceKm: 10 }),
      act({ id: "b", start: "2026-01-20T08:00:00", distanceKm: 20 }),
      act({ id: "c", start: "2026-07-01T08:00:00", distanceKm: 5 }),
    ];
    const r = computeYearRecap(acts, 2026);
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly[0].count).toBe(2);
    expect(r.monthly[0].distanceMeters).toBe(30000);
    expect(r.monthly[6].count).toBe(1);
    expect(r.monthly[5].count).toBe(0);
  });

  it("activeDays 는 서로 다른 날만 센다", () => {
    const acts = [
      act({ id: "a", start: "2026-01-10T08:00:00", distanceKm: 10 }),
      act({ id: "b", start: "2026-01-10T18:00:00", distanceKm: 20 }), // 같은 날
      act({ id: "c", start: "2026-01-11T08:00:00", distanceKm: 5 }),
    ];
    const r = computeYearRecap(acts, 2026);
    expect(r.activeDays).toBe(2);
  });

  it("#477: 최근 90일 일관성 요약을 계산한다", () => {
    const now = new Date("2026-04-30T12:00:00").getTime();
    const acts = [
      act({ id: "a", start: "2026-04-28T08:00:00", distanceKm: 10 }),
      act({ id: "b", start: "2026-04-29T08:00:00", distanceKm: 10 }),
      act({ id: "c", start: "2026-04-30T08:00:00", distanceKm: 10 }),
      act({ id: "d", start: "2026-04-10T08:00:00", distanceKm: 10 }),
      act({ id: "e", start: "2026-02-02T08:00:00", distanceKm: 10 }),
      act({ id: "old", start: "2026-01-01T08:00:00", distanceKm: 10 }),
    ];
    const r = computeYearRecap(acts, 2026, now);
    expect(r.consistency90d.windowDays).toBe(90);
    expect(r.consistency90d.activeDays).toBe(5);
    expect(r.consistency90d.activeWeeks).toBe(3);
    expect(r.consistency90d.longestStreakDays).toBe(3);
    expect(r.consistency90d.currentStreakDays).toBe(3);
    expect(r.consistency90d.score).toBeGreaterThan(0);
  });
});

describe("availableRecapYears", () => {
  it("존재하는 연도를 내림차순 중복제거로 반환한다", () => {
    const acts = [
      act({ id: "a", start: "2024-05-01T08:00:00" }),
      act({ id: "b", start: "2026-01-01T08:00:00" }),
      act({ id: "c", start: "2026-12-01T08:00:00" }),
      act({ id: "d", start: "2025-06-01T08:00:00" }),
    ];
    expect(availableRecapYears(acts)).toEqual([2026, 2025, 2024]);
  });

  it("빈 배열은 빈 결과", () => {
    expect(availableRecapYears([])).toEqual([]);
  });
});
