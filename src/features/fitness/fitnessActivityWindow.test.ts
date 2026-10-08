import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { aggregateRecentZoneSeconds } from "./mobileFitnessMetrics";
import { computeIntegratedLoadFocus } from "./multisportPerformance";
import { buildWindowSwimEvidence, computeWindowLoadFocus, filterFitnessActivityWindowEntries, fitnessWindowMetrics,
  parseFitnessActivityWindow, type FitnessActivityWindowEntry } from "./fitnessActivityWindow";
const now = Date.parse("2026-10-08T12:00:00Z");
const day = 86_400_000;
const entry = (fields: Partial<FitnessActivityWindowEntry> = {}): FitnessActivityWindowEntry => ({
  activityId: "bike", startTime: now, activityType: "Ride", discipline: "bike", hrZoneSec: null,
  powerZoneSec: [100, 0, 0, 0, 0, 0, 100], loadFocus: { load: 100, source: "power",
    allocations: [10, 10, 15, 15, 10, 20, 20], hasAnaerobicBikeDetail: true }, mmp: { "5s": 300.4 },
  swolf: null, distancePerStroke: null, ...fields,
});
const document = (entries = [entry()]) => ({ version: 1, windowDays: 90, maxEntries: 768, entries, generation: 1, updatedAt: now, truncated: false });

describe("fitness activity window", () => {
  it("검증된 존과 90일 양쪽 경계를 지키며 raw 종목 필터는 부하 종목과 분리한다", () => {
    const entries = [entry(), entry({ activityId: "old", startTime: now - 90 * day - 1 }),
      entry({ activityId: "boundary", startTime: now - 90 * day }), entry({ activityId: "future", startTime: now + 1 }),
      entry({ activityId: "performance-only", activityType: "SpecialRide" })];
    const parsed = parseFitnessActivityWindow(document(entries));
    expect(filterFitnessActivityWindowEntries(parsed.entries, "tri", now).map(value => value.activityId)).toEqual(["bike", "boundary", "performance-only"]);
    expect(filterFitnessActivityWindowEntries(parsed.entries, "bike", now).map(value => value.activityId)).toEqual(["bike", "boundary"]);
    expect(() => parseFitnessActivityWindow(document([entry({ hrZoneSec: [1, 2] })]))).toThrow();
    expect(() => parseFitnessActivityWindow(document([entry({ powerZoneSec: [1, 0, 0, 0, 0, 0, -1] })]))).toThrow();
  });
  it("서버 배분은 절대 부하이며 버킷·종목·센서·총부하를 보존한다", () => {
    const entries = [entry(), entry({ activityId: "run", discipline: "run", activityType: "Run", loadFocus: { load: 50,
      source: "heartRate", allocations: [5, 5, 10, 10, 20], hasAnaerobicBikeDetail: false } }),
    entry({ activityId: "other", discipline: "other", loadFocus: { load: 30, source: "unclassified", allocations: [], hasAnaerobicBikeDetail: false } }),
    entry({ activityId: "expired", startTime: now - 28 * day - 1 }), entry({ activityId: "future", startTime: now + 1 })];
    expect(computeWindowLoadFocus(entries, now)).toMatchObject({ totalLoad: 180, activityCount: 3,
      buckets: { baseAerobic: 30, highAerobic: 60, highIntensity: 60, unclassified: 30 },
      sourceLoad: { power: 100, heartRate: 50, unclassified: 30 }, disciplineLoad: { bike: 100, run: 50, swim: 0, other: 30 }, hasAnaerobicBikeDetail: true });
  });
  it("원본 존 IF² 계산과 서버 집계 결과가 일치한다", () => {
    const zones = [100, 200, 300, 400, 500, 600, 700];
    const intensities = [.45, .655, .83, .98, 1.13, 1.35, 1.6];
    const weighted = zones.map((zone, index) => zone * intensities[index]! ** 2);
    const allocations = weighted.map(value => 100 * value / weighted.reduce((sum, item) => sum + item, 0));
    const activity = { id: "bike", type: "Ride", startTime: now, summary: { tss: 100, ridingTimeMillis: 2800000 } } as Activity;
    const metrics = { powerZoneSec: zones, durationSec: 2800 } as ActivityMetrics;
    expect(computeWindowLoadFocus([entry({ powerZoneSec: zones, loadFocus: { load: 100, source: "power", allocations, hasAnaerobicBikeDetail: true } })], now))
      .toEqual(computeIntegratedLoadFocus([activity], new Map([["bike", metrics]]), now));
  });
  it("유효하지 않은 0 SWOLF는 독립적으로 제외하고 다른 활동 근거를 보존한다", () => {
    const parsed = parseFitnessActivityWindow(document([entry({ activityId: "zero", discipline: "swim", swolf: 0, distancePerStroke: 0 }),
      entry({ activityId: "valid", discipline: "swim", swolf: 40, distancePerStroke: 2 })]));
    expect(buildWindowSwimEvidence(null, parsed.entries, now)).toMatchObject({ swolfAvg: 40, distancePerStrokeM: 2, activityCount: 1 });
  });
  it("28일 존 합계와 90일 수영 근거에 현재 경계를 다시 적용한다", () => {
    const entries = [entry({ activityId: "cutoff", startTime: now - 28 * day }), entry({ activityId: "before", startTime: now - 28 * day - 1 })];
    const map = fitnessWindowMetrics(entries);
    expect(aggregateRecentZoneSeconds(entries.map(value => ({ id: value.activityId, startTime: value.startTime })), map, "powerZoneSec", now).total).toBe(200);
    expect(buildWindowSwimEvidence(90, [entry({ discipline: "swim", swolf: 40, distancePerStroke: 2 }),
      entry({ discipline: "swim", swolf: null, distancePerStroke: 4 }), entry({ discipline: "swim", startTime: now - 90 * day - 1, swolf: 100 })], now))
      .toMatchObject({ swolfAvg: 40, distancePerStrokeM: 3, activityCount: 2 });
  });
});
