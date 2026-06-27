import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import { recommendToday, type RecommendationContext } from "./todaysRecommendation";
import { composeFallbackNarrative } from "./recommendationComposer";

// i18n 미초기화 환경에서 키를 그대로 반환하는 최소 mock
const tMock = ((key: string, opts?: Record<string, unknown>) => {
  if (!opts) return key;
  return Object.entries(opts).reduce<string>(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v)),
    key,
  );
}) as unknown as TFunction;

const base: RecommendationContext = {
  tsb: 0,
  ctl: 60,
  atl: 60,
  recent7dTss: 350,
  recent14dTss: 700,
  daysSinceLastWorkout: 1,
  lastWorkoutAvgZone: null,
  discipline: "bike",
  dayOfWeek: 3,
  goal: null,
  adaptation: null,
};

describe("recommendToday — 5 케이스 결정 트리", () => {
  it("부상 위험: ATL/CTL > 1.4 + TSB < -20 → burnout-rest (완전 휴식)", () => {
    const f = recommendToday({ ...base, ctl: 50, atl: 75, tsb: -25 });
    expect(f.type).toBe("burnout-rest");
    expect(f.tone).toBe("rose");
    expect(f.zone).toBe(1);
    expect(f.durationMin).toEqual([0, 0]);
    expect(f.chips).toContain("완전 휴식");
    expect(f.contextTags.some((t) => t.includes("과부하 임계 초과"))).toBe(true);
  });

  it("회복 필요 (light): TSB -10 → recovery (Z1 짧음)", () => {
    const f = recommendToday({ ...base, tsb: -10, ctl: 50, atl: 60 });
    expect(f.type).toBe("recovery");
    expect(f.tone).toBe("amber");
    expect(f.zone).toBe(1);
    expect(f.contextTags.some((t) => t.includes("active recovery"))).toBe(true);
  });

  it("회복 깊음 + 오늘 운동 → recovery (휴식 권장)", () => {
    const f = recommendToday({ ...base, tsb: -20, ctl: 50, atl: 70, daysSinceLastWorkout: 0 });
    expect(f.type).toMatch(/recovery|burnout-rest/);
    expect(f.tone).toBe("amber");
    expect(f.zone).toBe(1);
    expect(f.contextTags.some((t) => t.includes("휴식 권장"))).toBe(true);
  });

  it("평이: TSB 0 + 어제 운동 → endurance (Z2)", () => {
    const f = recommendToday({ ...base });
    expect(f.type).toBe("endurance");
    expect(f.zone).toBe(2);
    expect(f.tone).toBe("lime");
  });

  it("평이 + 2일 휴식 + TSB 양수 → tempo (Z3)", () => {
    const f = recommendToday({ ...base, tsb: 3, daysSinceLastWorkout: 2 });
    expect(f.type).toBe("tempo");
    expect(f.zone).toBe(3);
  });

  it("핵심 자극: TSB +10 → threshold (Sweet Spot, Z4)", () => {
    const f = recommendToday({ ...base, tsb: 10 });
    expect(f.type).toBe("threshold");
    expect(f.zone).toBe(4);
    expect(f.sessionName).toMatch(/Sweet Spot/);
  });

  it("과회복: TSB +25 → vo2 (Z5)", () => {
    const f = recommendToday({ ...base, tsb: 25 });
    expect(f.type).toBe("vo2");
    expect(f.zone).toBe(5);
  });

  it("과회복 + 레이스 주(D-3) → taper (Z2, TSS 경고)", () => {
    const f = recommendToday({
      ...base,
      tsb: 25,
      goal: { courseName: "Test", daysUntil: 3 },
    });
    expect(f.type).toBe("taper");
    expect(f.zone).toBe(2);
    expect(f.contextTags.some((t) => t.includes("레이스 주간"))).toBe(true);
  });
});

describe("contextTags — LLM 프롬프트용 컨텍스트 보존", () => {
  it("어제 강하게 운동 → contextTags 에 zone 명시", () => {
    const f = recommendToday({ ...base, lastWorkoutAvgZone: 4, daysSinceLastWorkout: 1 });
    expect(f.contextTags.some((t) => t.includes("어제 Z4"))).toBe(true);
  });

  it("최근 4주 실행률 낮음 → contextTags 에 표시", () => {
    const f = recommendToday({
      ...base,
      tsb: 10,
      adaptation: { severity: "warn", recent4wRatio: 0.5 },
    });
    expect(f.contextTags.some((t) => t.includes("실행률 50%"))).toBe(true);
  });

  it("주말 + goal 있음 → 둘 다 contextTags 에 포함", () => {
    const f = recommendToday({
      ...base,
      dayOfWeek: 6, // Sat
      goal: { courseName: "그란폰도", daysUntil: 56, distanceKm: 100, elevationM: 1200 },
    });
    expect(f.contextTags).toContain("주말");
    expect(f.contextTags.some((t) => t.includes("그란폰도"))).toBe(true);
    expect(f.contextTags.some((t) => t.includes("100km"))).toBe(true);
  });

  it("recent7dTss 항상 포함 (LLM 프롬프트 baseline)", () => {
    const f = recommendToday({ ...base, recent7dTss: 420 });
    expect(f.contextTags.some((t) => t.includes("420"))).toBe(true);
  });
});

describe("weeklyTargetTss / balanceGuide — G5 주간 권장부하 병합", () => {
  it("ctl > 0 → weeklyTargetTss + balanceGuide 채워짐", () => {
    const f = recommendToday({ ...base, ctl: 60, tsb: 0 });
    expect(f.weeklyTargetTss).toBeDefined();
    expect(f.weeklyTargetTss![0]).toBeLessThanOrEqual(f.weeklyTargetTss![1]);
    expect(f.balanceGuide).toBeDefined();
    expect(f.balanceGuide!.note.length).toBeGreaterThan(0);
  });

  it("ctl = 0 → 주간 필드 미생성 (옵셔널)", () => {
    const f = recommendToday({ ...base, ctl: 0 });
    expect(f.weeklyTargetTss).toBeUndefined();
    expect(f.balanceGuide).toBeUndefined();
  });

  it("weeklyAccumulatedTss 주어지면 remainingTss = max(0, hi − 누적)", () => {
    const f = recommendToday({ ...base, ctl: 60, tsb: 0, weeklyAccumulatedTss: 100 });
    expect(f.remainingTss).toBe(Math.max(0, f.weeklyTargetTss![1] - 100));
  });

  it("누적이 상한 초과 → remainingTss 0", () => {
    const f = recommendToday({ ...base, ctl: 60, tsb: 0, weeklyAccumulatedTss: 9999 });
    expect(f.remainingTss).toBe(0);
  });

  it("레이스 주(D-5) → balanceGuide.phase taper", () => {
    const f = recommendToday({ ...base, ctl: 60, tsb: 5, goal: { courseName: "X", daysUntil: 5 } });
    expect(f.balanceGuide!.phase).toBe("taper");
  });

  it("기존 결정트리 결과는 그대로 유지 (병합이 type 안 바꿈)", () => {
    const f = recommendToday({ ...base, tsb: 10, ctl: 60 });
    expect(f.type).toBe("threshold");
  });
});

// factsHash 제거됨 — CF 가 prompt sha1 기반으로 캐시 키 결정. 더 이상 클라 측 hash 테스트 불필요.

describe("composer fallback — LLM 실패 시 단편 narrative 생성", () => {
  it("모든 타입에서 fallback narrative 생성 가능 (빈 문자열 X, 키 포함)", () => {
    const cases: Array<Partial<RecommendationContext>> = [
      { ctl: 50, atl: 75, tsb: -25 }, // burnout
      { tsb: -10, ctl: 50, atl: 60 }, // recovery
      { tsb: 0 },                      // endurance
      { tsb: 3, daysSinceLastWorkout: 2 }, // tempo
      { tsb: 10 },                     // threshold
      { tsb: 25 },                     // vo2
      { tsb: 25, goal: { courseName: "X", daysUntil: 3 } }, // taper
    ];
    for (const override of cases) {
      const facts = recommendToday({ ...base, ...override });
      const narrative = composeFallbackNarrative(facts, undefined, tMock);
      expect(narrative.length).toBeGreaterThanOrEqual(20);
      expect(narrative).toMatch(/fallback\.|CTL|TSB/); // i18n 키 또는 보간된 수치 포함
    }
  });

  it("fallback 에 current 줄이 포함됨", () => {
    const facts = recommendToday({ ...base, tsb: 7 });
    const narrative = composeFallbackNarrative(facts, undefined, tMock);
    // mock t 는 키를 그대로 반환 — current 줄이 있는지 확인
    expect(narrative).toMatch(/fallback\.current/);
  });
});
