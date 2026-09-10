import { describe, expect, it } from "vitest";
import type { ActivitySummary } from "@shared/types";
import type { ActivityMetricsDoc, UseActivityMetricsState } from "../../../hooks/useActivityMetrics";
import { resolveSummaryStripStats } from "./summaryStripStats";

const summary: ActivitySummary = {
  distance: 18_400,
  ridingTimeMillis: 7_200_000,
  movingTimeSec: 6_000,
  pauseTimeSec: 400,
  averageSpeed: 12,
  maxSpeed: 18,
  averageCadence: 178,
  maxCadence: 190,
  averageHeartRate: 158,
  maxHeartRate: 181,
  averagePower: 310,
  maxPower: 640,
  normalizedPower: 325,
  elevationGain: 240,
  calories: 2_220,
  relativeEffort: 120,
  tss: 92,
  swolf: null,
};

const inputs = {
  summary,
  avgPowerValue: 310,
  avgSpeedFallbackKph: 13,
  normalizedPowerValue: 325,
  hasStreamPowerCandidate: false,
};

function ready(overrides: Partial<ActivityMetricsDoc> = {}): UseActivityMetricsState {
  return {
    status: "ready",
    metrics: {
      distanceKm: 20,
      avgSpeedKph: 10,
      maxSpeedKph: 15,
      elevationGainM: 300,
      elevationLossM: 280,
      caloriesKcal: 2_000,
      avgHr: 150,
      maxHr: 175,
      avgCadence: 170,
      avgPower: 300,
      maxPower: 600,
      np: 320,
      movingTimeSec: 6_660,
      pauseTimeSec: 540,
      ...overrides,
    } as ActivityMetricsDoc,
  };
}

describe("resolveSummaryStripStats", () => {
  it("서버 문서가 있으면 서버 값이 정본", () => {
    const stats = resolveSummaryStripStats(ready(), inputs);
    expect(stats.distanceM).toEqual({ value: 20_000, provisional: false });
    expect(stats.avgSpeedKph.value).toBe(10);
    expect(stats.caloriesKcal.value).toBe(2_000);
    expect(stats.np.value).toBe(320);
  });

  it("stale 문서도 값을 그대로 쓴다 (배너가 별도로 표식)", () => {
    const state = { ...ready(), status: "stale" } as UseActivityMetricsState;
    expect(resolveSummaryStripStats(state, inputs).distanceM.value).toBe(20_000);
  });

  it("서버가 null 인 필드는 기기 요약으로 메우지 않는다", () => {
    const stats = resolveSummaryStripStats(ready({ avgHr: null, avgSpeedKph: null }), inputs);
    expect(stats.avgHr).toEqual({ value: null, provisional: false });
    expect(stats.avgSpeedKph).toEqual({ value: null, provisional: false });
  });

  it("서버 문서가 없으면 기기 요약값 + 잠정 표식", () => {
    const stats = resolveSummaryStripStats({ status: "missing", metrics: null }, inputs);
    expect(stats.distanceM).toEqual({ value: 18_400, provisional: true });
    expect(stats.avgSpeedKph).toEqual({ value: 13, provisional: true });
    expect(stats.caloriesKcal).toEqual({ value: 2_220, provisional: true });
    // 기기 요약에 없는 값은 잠정 표식도 붙일 게 없다.
    expect(stats.elevationLossM).toEqual({ value: null, provisional: false });
  });

  it("비소유자(disabled)는 서버 문서를 읽을 권한이 없어 표식을 붙이지 않는다", () => {
    const stats = resolveSummaryStripStats({ status: "disabled", metrics: null }, inputs);
    expect(stats.distanceM).toEqual({ value: 18_400, provisional: false });
  });

  it("이동/정지 시간 폴백은 activity_metrics 미러라 잠정 표식이 없다", () => {
    const stats = resolveSummaryStripStats({ status: "missing", metrics: null }, inputs);
    expect(stats.movingTimeSec).toEqual({ value: 6_000, provisional: false });
    expect(stats.pauseTimeSec).toEqual({ value: 400, provisional: false });
  });

  it("원시 파워 후보가 있으면 NP 는 억제하고 평균/최대 파워는 그 스트림 값을 쓴다", () => {
    const stats = resolveSummaryStripStats(ready(), { ...inputs, hasStreamPowerCandidate: true });
    expect(stats.np).toEqual({ value: null, provisional: false });
    expect(stats.avgPower).toEqual({ value: 310, provisional: false });
    expect(stats.maxPower).toEqual({ value: 640, provisional: false });
  });
});
