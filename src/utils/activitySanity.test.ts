import { describe, expect, it } from "vitest";
import {
  isImplausibleAvgSpeed,
  isImplausibleMaxSpeed,
  isMicroActivity,
  isImplausibleActivity,
  isImplausibleSegmentElevation,
} from "./activitySanity";

describe("activitySanity", () => {
  describe("isImplausibleAvgSpeed", () => {
    it("bike 80 km/h 초과는 invalid", () => {
      expect(isImplausibleAvgSpeed(154.2, "bike")).toBe(true);
      expect(isImplausibleAvgSpeed(81, "bike")).toBe(true);
      expect(isImplausibleAvgSpeed(45, "bike")).toBe(false);
    });
    it("run 30 km/h 초과는 invalid", () => {
      expect(isImplausibleAvgSpeed(35, "run")).toBe(true);
      expect(isImplausibleAvgSpeed(15, "run")).toBe(false);
    });
    it("null/0/음수는 invalid 가 아님 (미입력)", () => {
      expect(isImplausibleAvgSpeed(null)).toBe(false);
      expect(isImplausibleAvgSpeed(0)).toBe(false);
      expect(isImplausibleAvgSpeed(-1)).toBe(false);
      expect(isImplausibleAvgSpeed(undefined)).toBe(false);
    });
  });

  describe("isImplausibleMaxSpeed", () => {
    it("bike 140 km/h 초과는 invalid (다운힐 한계)", () => {
      expect(isImplausibleMaxSpeed(180.9, "bike")).toBe(true);
      expect(isImplausibleMaxSpeed(120, "bike")).toBe(false);
    });
  });

  describe("isMicroActivity", () => {
    it("거리 100m 미만 또는 시간 60s 미만이면 true", () => {
      expect(isMicroActivity(50, 120_000)).toBe(true);   // 거리 부족
      expect(isMicroActivity(500, 30_000)).toBe(true);   // 시간 부족
      expect(isMicroActivity(500, 120_000)).toBe(false); // 정상
    });
    it("null/undefined 는 0 으로 처리하므로 invalid", () => {
      expect(isMicroActivity(null, 120_000)).toBe(true);
      expect(isMicroActivity(500, null)).toBe(true);
    });
  });

  describe("isImplausibleActivity", () => {
    it("관측된 ca9b91ea 케이스: 4km / 1m 34s / 154.2 km/h → invalid", () => {
      expect(isImplausibleActivity({
        distanceM: 4000, durationMs: 94_000, avgKph: 154.2, maxKph: 180.9,
      })).toBe(true);
    });
    it("정상 라이딩 41km / 3h / 13.1 km/h → valid", () => {
      expect(isImplausibleActivity({
        distanceM: 41_000, durationMs: 11_400_000, avgKph: 13.1, maxKph: 40,
      })).toBe(false);
    });
  });

  describe("isImplausibleSegmentElevation", () => {
    it("정상 급경사 클라임 (2km · avg 10% · gain 200m) 은 통과", () => {
      // expectedGain = 2000 × 0.10 = 200, gain 200 → 3배 미만 & 비율 0.1 → valid
      expect(isImplausibleSegmentElevation({
        elevHigh: 400, elevLow: 200, distanceM: 2000, avgGrade: 10,
      })).toBe(false);
    });
    it("corrupt 8623m (23km · avg -0.1%) 은 차단", () => {
      expect(isImplausibleSegmentElevation({
        elevHigh: 8623, elevLow: 0, distanceM: 23_000, avgGrade: -0.1,
      })).toBe(true);
    });
    it("평지(avg 0%)에 2478m gain 은 차단", () => {
      expect(isImplausibleSegmentElevation({
        elevHigh: 2478, elevLow: 0, distanceM: 5000, avgGrade: 0,
      })).toBe(true);
    });
    it("200m 미만 gain 은 noise 흡수 → valid (false positive 방지)", () => {
      // 100m 구간에 150m gain (비율 1.5) 이지만 gain<200 이라 가드 미적용
      expect(isImplausibleSegmentElevation({
        elevHigh: 150, elevLow: 0, distanceM: 100, avgGrade: 0,
      })).toBe(false);
    });
    it("null/NaN/미입력은 가드 미적용 (false)", () => {
      expect(isImplausibleSegmentElevation({
        elevHigh: null, elevLow: 0, distanceM: 2000, avgGrade: 10,
      })).toBe(false);
      expect(isImplausibleSegmentElevation({
        elevHigh: NaN, elevLow: 0, distanceM: 2000, avgGrade: 10,
      })).toBe(false);
      expect(isImplausibleSegmentElevation({
        elevHigh: 400, elevLow: 200, distanceM: undefined, avgGrade: 10,
      })).toBe(false);
      expect(isImplausibleSegmentElevation({
        elevHigh: 400, elevLow: 200, distanceM: 2000, avgGrade: null,
      })).toBe(false);
    });
    it("distanceM 0 경계: gain/distanceM 분기 NaN 회피", () => {
      // gain 250, expectedGain 0 → gain > 0 으로 차단, 비율 분기는 distanceM>0 가드로 스킵
      expect(isImplausibleSegmentElevation({
        elevHigh: 250, elevLow: 0, distanceM: 0, avgGrade: 5,
      })).toBe(true);
    });
  });
});
