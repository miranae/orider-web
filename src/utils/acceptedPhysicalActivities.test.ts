import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { acceptedPhysicalActivities, acceptedTrainingActivities } from "./estimateTSS";

const start = new Date(2026, 8, 30, 23, 59, 45).getTime();
const native = { id: "native", userId: "owner", type: "Ride", source: "orider", startTime: start,
  summary: { distance: 3000, ridingTimeMillis: 3600000, elevationGain: 100, tss: 50 } } as Activity;
const imported = { ...native, id: "strava_1", source: "strava", startTime: start + 30000,
  summary: { ...native.summary, distance: 2800, elevationGain: 90 } } as Activity;

describe("모든 집계의 실주행 대표", () => {
  it("기간 필터 전에 같은 대표를 선택하고 거리·시간·고도·횟수를 한 번만 센다", () => {
    const health = { ...native, id: "health", source: "health_connect" };
    const rows = acceptedPhysicalActivities([native, imported, health]);
    expect(rows).toEqual([imported]);
    expect(rows).toEqual(acceptedTrainingActivities([health, native, imported]));
    expect(rows.reduce((sum, row) => sum + row.summary.distance, 0)).toBe(2800);
    expect(rows.reduce((sum, row) => sum + row.summary.ridingTimeMillis, 0)).toBe(3600000);
    expect(rows.reduce((sum, row) => sum + row.summary.elevationGain!, 0)).toBe(90);
    expect(rows.filter((row) => new Date(row.startTime).getMonth() === 8)).toHaveLength(0);
    expect(acceptedPhysicalActivities([imported, health, native])).toEqual(rows);
  });

  it("삭제된 대표를 제외한 뒤 남은 원본을 승격한다", () => {
    expect(acceptedPhysicalActivities([native, { ...imported, deletedAt: start + 1 }])).toEqual([native]);
  });

  it("다른 시간·종목·사용자의 정상 활동은 유지한다", () => {
    const later = { ...native, id: "later", startTime: start + 7200000 };
    const run = { ...native, id: "run", type: "Run" };
    const otherOwner = { ...native, id: "other", userId: "other-owner" };
    expect(acceptedPhysicalActivities([native, later, run, otherOwner])).toHaveLength(4);
  });

  it("레거시 날짜와 비훈련 종목도 거리 집계에서 사라지지 않는다", () => {
    const legacy = { ...native, id: "legacy", startTime: NaN, createdAt: start };
    const walk = { ...native, id: "walk", type: "Walk" };
    expect(acceptedPhysicalActivities([legacy, walk])).toEqual([legacy, walk]);
  });
});
