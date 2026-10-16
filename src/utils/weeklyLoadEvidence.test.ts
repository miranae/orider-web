import { describe, expect, it } from "vitest";
import type { Activity } from "@shared/types";
import { acceptedTrainingActivities, sumActivityTss } from "./estimateTSS";
import { buildWeeklyLoadEvidence } from "./weeklyLoadEvidence";

const start = Date.parse("2026-10-05T00:00:00+09:00");
const options = { periodStartMs: start, periodEndMs: start + 7 * 86400000, scope: "allSupported" as const, coverage: "ready" as const, timeZone: "Asia/Seoul" };
function activity(id: string, summary: Record<string, unknown> | null, extra: Record<string, unknown> = {}): Activity {
  return { id, userId: "u", description: `원문 ${id}`, type: "Ride", source: "orider", startTime: start + Number(id.replace(/\D/g, "") || 1) * 4 * 3600000,
    summary, ...extra } as unknown as Activity;
}

describe("주간 훈련 부하 근거", () => {
  it("동일 산입 정본으로 저장·서버·시간·심박·미확인·제외를 분리한다", () => {
    const rows = [
      activity("1", { tss: 100.4 }),
      activity("2", {}, { source: "strava", serverDerivedLoad: { schemaVersion: 1, userId: "u", inputBinding: "bound", streamTss: 80.6 } }),
      activity("3", { ridingTimeMillis: 3600000 }),
      activity("4", { ridingTimeMillis: 3600000, streamTrimpTss: 40.6, relativeEffort: 55 }),
      activity("5", { ridingTimeMillis: 3600000, relativeEffort: 30.6 }),
      activity("6", null),
      activity("7", { distance: 100, ridingTimeMillis: 60000, tss: 30 }),
      activity("8", { ridingTimeMillis: 0, tss: 0 }),
      activity("9", { tss: 50 }, { type: "unsupported" }),
      activity("10", { tss: 60 }, { deletedAt: 1 }),
    ];
    const evidence = buildWeeklyLoadEvidence(rows, options);
    expect(evidence).toMatchObject({ total: 295, storedTotal: 181, estimatedTotal: 114, rawCount: 10, acceptedCount: 8,
      duplicateCount: 0, contributingCount: 6, storedCount: 2, estimatedCount: 3, unknownCount: 1, excludedCount: 1,
      knownZeroCount: 1, unsupportedOrDeletedCount: 2, estimated: true, timeZone: "Asia/Seoul",
      basisTotals: { power: 81, heartRate: 72, time: 42, unknown: 100 } });
    expect(evidence.total).toBe(sumActivityTss(rows).value);
    expect(evidence.rows[0]).toMatchObject({ title: "원문 1", source: "recorded", basis: "unknown", value: 100 });
    expect(evidence.rows[0]?.input).toBeUndefined();
    expect(evidence.rows[1]).toMatchObject({ basis: "power", source: "server", value: 81 });
    expect(evidence.rows[1]?.input).toBeUndefined();
    expect(evidence.rows[2]?.input).toEqual({ kind: "time", durationMillis: 3600000, factor: 42 });
    expect(evidence.rows[3]?.input).toEqual({ kind: "streamTrimpTss", value: 40.6 });
    expect(evidence.rows[4]?.input).toEqual({ kind: "relativeEffort", value: 30.6 });
    expect(evidence.rows[7]).toMatchObject({ knownZero: true, basis: "unknown", value: 0 });
    expect(Object.values(evidence.basisTotals).reduce((sum, value) => sum + value, 0)).toBe(evidence.total);
    expect(evidence.rows[7]?.input).toBeUndefined();
  });

  it("반올림으로 0이 된 심박 추정과 저장값을 명시적 0으로 오분류하지 않는다", () => {
    const rows = [activity("1", { streamTrimpTss: 0.4 }), activity("2", { relativeEffort: 0.4 }),
      activity("3", { tss: 0.4 }), activity("4", { tss: 0, ridingTimeMillis: 0 })];
    const evidence = buildWeeklyLoadEvidence(rows, options);
    expect(evidence).toMatchObject({ total: 0, estimated: true, estimatedCount: 2, storedCount: 1,
      knownZeroCount: 1, unknownCount: 0, excludedCount: 0, contributingCount: 4 });
    expect(evidence.rows[0]).toMatchObject({ source: "trimp", value: 0, input: { kind: "streamTrimpTss", value: 0.4 } });
    expect(evidence.rows[1]).toMatchObject({ source: "trimp", value: 0, input: { kind: "relativeEffort", value: 0.4 } });
    expect(evidence.rows[2]).toMatchObject({ source: "recorded", value: 0 });
    expect(evidence.rows.slice(0, 3).every(row => row.knownZero === undefined)).toBe(true);
    expect(evidence.rows[3]).toMatchObject({ source: "time", value: 0, knownZero: true });
    expect(evidence.storedCount + evidence.estimatedCount + evidence.knownZeroCount).toBe(evidence.acceptedCount);
    expect(evidence.total).toBe(sumActivityTss(rows).value);
    expect(evidence.estimated).toBe(sumActivityTss(rows).estimated);
  });

  it("반올림은 정본의 활동별 값과 같고 부분합은 최종 합계와 정확히 일치한다", () => {
    const rows = [activity("1", { tss: 10.49 }), activity("2", { tss: 10.49 }), activity("3", { relativeEffort: 10.49 })];
    const evidence = buildWeeklyLoadEvidence(rows, options);
    expect(evidence.total).toBe(30);
    expect(evidence.storedTotal + evidence.estimatedTotal).toBe(evidence.total);
    expect(evidence.rows.reduce((sum, row) => sum + (row.value ?? 0), 0)).toBe(evidence.total);
    expect(evidence.total).toBe(sumActivityTss(rows).value);
  });

  it("저장된 TSS는 주변 파워·심박·거리 수치만으로 원래 계산 방식을 추측하지 않는다", () => {
    const row = activity("1", { tss: 100, averagePower: 250, averageHeartRate: 150,
      distance: 40000, ridingTimeMillis: 3600000, streamTrimpTss: 80, relativeEffort: 75 });
    const evidence = buildWeeklyLoadEvidence([row], options);
    expect(evidence.rows[0]).toMatchObject({ source: "recorded", basis: "unknown", value: 100 });
    expect(evidence.rows[0]?.input).toBeUndefined();
    expect(evidence.basisTotals).toEqual({ power: 0, heartRate: 0, time: 0, unknown: 100 });
  });

  it("현재 FTP와 평균 파워로 새 계산을 하지 않고 실제 선택한 시간 입력만 공개한다", () => {
    const row = activity("1", { ridingTimeMillis: 3600000, averagePower: 300 });
    expect(buildWeeklyLoadEvidence([row], options).rows[0]).toMatchObject({ value: 42, source: "time", basis: "time", input: { kind: "time", durationMillis: 3600000, factor: 42 } });
  });

  it("주 경계 중복은 전체 범위에서 고른 대표가 속한 주에만 산입한다", () => {
    const native = activity("native", { tss: 100, ridingTimeMillis: 3600000 }, { startTime: start - 15000, endTime: start + 3585000 });
    const strava = activity("strava_1", { tss: 100, ridingTimeMillis: 3600000 }, { source: "strava", startTime: start + 15000, endTime: start + 3615000 });
    const rows = [native, strava];
    const accepted = acceptedTrainingActivities(rows);
    const current = buildWeeklyLoadEvidence(rows, { ...options, acceptedActivities: accepted });
    const previous = buildWeeklyLoadEvidence(rows, { ...options, periodStartMs: start - 7 * 86400000, periodEndMs: start, acceptedActivities: accepted });
    expect((current.total ?? 0) + (previous.total ?? 0)).toBe(sumActivityTss(rows).value);
    expect(current.acceptedCount + previous.acceptedCount).toBe(1);
    expect(current.duplicateCount + previous.duplicateCount).toBe(1);
  });

  it("데이터 범위가 불완전하거나 값이 없으면 확정 0을 만들지 않는다", () => {
    expect(buildWeeklyLoadEvidence([], { ...options, coverage: "partial" })).toMatchObject({ total: null, coverage: "partial", rows: [] });
    expect(buildWeeklyLoadEvidence([activity("1", {})], options)).toMatchObject({ total: null, unknownCount: 1, estimated: false });
  });
});
