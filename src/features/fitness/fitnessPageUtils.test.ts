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
