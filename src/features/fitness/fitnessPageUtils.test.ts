import { describe, expect, it } from "vitest";

import {
  buildTodayConclusion,
  formatKoreanDate,
  getRangeOptions,
  makeDurationLabel,
  secToMmss,
  tsbStatusDesc,
  tsbStatusLabel,
} from "./fitnessPageUtils";

const t = (key: string, options?: Record<string, unknown>) =>
  options && "n" in options ? `${key}:${options.n}` : key;

describe("fitnessPageUtils", () => {
  it("formats core fitness labels", () => {
    expect(secToMmss(305)).toBe("5:05");
    expect(makeDurationLabel(t)(60)).toBe("duration.min:1");
    expect(formatKoreanDate(Date.UTC(2026, 5, 28))).toBe("2026-06-28");
  });

  it("builds range options and TSB status labels", () => {
    expect(getRangeOptions(t).map((option) => option.value)).toEqual([30, 90, 180, 365]);
    expect(tsbStatusLabel(30, t)).toBe("status.overRecovery");
    expect(tsbStatusLabel(-31, t)).toBe("status.overtraining");
    expect(tsbStatusDesc(6, t)).toBe("desc.recovery");
    expect(tsbStatusDesc(-11, t)).toBe("desc.rest");
  });

  describe("buildTodayConclusion", () => {
    it("resolves the #400 §2 contradiction: 13 rest days + recovered TSB -> train today", () => {
      const result = buildTodayConclusion({ tsb: 12, restDays: 13, thisWeekTSS: 0, avgWeekTSS: 300 });
      expect(result.case).toBe("recoveredLongRest");
      expect(result.restDays).toBe(13);
    });

    it("recommends training when recent load is far below the plan even without a long rest streak", () => {
      // 최근 4주 실제 부하가 계획의 27% 수준 예시 (#400 §2)
      const result = buildTodayConclusion({ tsb: 8, restDays: 2, thisWeekTSS: 81, avgWeekTSS: 300 });
      expect(result.case).toBe("recoveredLowRecentLoad");
      expect(result.loadPct).toBe(27);
    });

    it("recommends rest/easy when fatigued, even if recent load looks light", () => {
      const result = buildTodayConclusion({ tsb: -25, restDays: 0, thisWeekTSS: 50, avgWeekTSS: 300 });
      expect(result.case).toBe("fatiguedRest");
    });

    it("fatigue takes precedence over a long rest streak (never contradicts recovery guidance)", () => {
      const result = buildTodayConclusion({ tsb: -22, restDays: 20, thisWeekTSS: 0, avgWeekTSS: 300 });
      expect(result.case).toBe("fatiguedRest");
    });

    it("falls back to following the plan with no strong signal", () => {
      const result = buildTodayConclusion({ tsb: 0, restDays: 1, thisWeekTSS: 280, avgWeekTSS: 300 });
      expect(result.case).toBe("balancedFollowPlan");
    });

    it("returns null loadPct when there is no average week baseline yet", () => {
      const result = buildTodayConclusion({ tsb: 0, restDays: 0, thisWeekTSS: 100, avgWeekTSS: 0 });
      expect(result.loadPct).toBeNull();
      expect(result.case).toBe("balancedFollowPlan");
    });
  });
});

it("keeps canonical source identity and deterministic latest/time/ID ties in fixed half-open periods", async () => {
  const { aggregateWindowPowerCurve } = await import("./fitnessPageUtils");
  const points = aggregateWindowPowerCurve([
    { activityId: "older", startTime: 10, mmp: { "5s": 400, "1m": 200 } },
    { activityId: "z", startTime: 20, mmp: { "5s": 400 } },
    { activityId: "a", startTime: 20, mmp: { "5s": 400, "1m": NaN, "2m": 0, "3m": 100 } },
    { activityId: "excluded-end", startTime: 30, mmp: { "5s": 999 } },
    { activityId: "excluded-start", startTime: 9, mmp: { "5s": 999 } },
  ], 10, 30);
  expect(points).toEqual([{ durationSeconds: 5, maxPower: 400, sourceActivityId: "a", startTime: 20 },
    { durationSeconds: 60, maxPower: 200, sourceActivityId: "older", startTime: 10 }]);
});

it("keeps legacy rounded watts but selects source using raw maxima, not rounded ties", async () => {
  const { aggregateWindowPowerCurve } = await import("./fitnessPageUtils");
  expect(aggregateWindowPowerCurve([
    { activityId: "raw-best", startTime: 10, mmp: { "5s": 400.49 } },
    { activityId: "newer-but-lower", startTime: 20, mmp: { "5s": 400.4 } },
  ], 0, 30)).toEqual([{ durationSeconds: 5, maxPower: 400, sourceActivityId: "raw-best", startTime: 10 }]);
});
it("does not accept Object prototype names as durations", async () => {
  const { aggregateWindowPowerCurve } = await import("./fitnessPageUtils");
  expect(aggregateWindowPowerCurve([{ activityId: "invalid", startTime: 10,
    mmp: JSON.parse('{"constructor":700,"toString":600,"__proto__":500}') }], 0, 30)).toEqual([]);
});
