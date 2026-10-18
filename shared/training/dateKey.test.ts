import { describe, expect, it } from "vitest";
import {
  addFitnessDateKeyDays,
  fitnessDateKeyFor,
  fitnessDateKeyTimezoneAt,
  fitnessTodayKey,
  normalizeFitnessDateKeyBasis,
  UTC_FITNESS_DATE_KEY_BASIS,
} from "./dateKey";
import { validFitnessLoadSnapshotProof } from "./fitnessLoadLifecycle";

// UTC→KST 전환: 새 시간대의 다음 자정 2026-10-11 00:00 KST = 2026-10-10T15:00Z
const CUT = Date.parse("2026-10-10T15:00:00.000Z");
const KST_BASIS = { segments: [{ fromMs: null, tz: "UTC" }, { fromMs: CUT, tz: "Asia/Seoul" }] };

describe("fitnessDateKeyFor", () => {
  it("basis 가 없거나 깨졌으면 기존 UTC 날짜와 같다", () => {
    for (const ms of [0, Date.parse("2026-10-17T16:00:00.000Z"), Date.parse("2026-03-08T06:59:59.999Z")]) {
      const utc = new Date(ms).toISOString().slice(0, 10);
      expect(fitnessDateKeyFor(ms)).toBe(utc);
      expect(fitnessDateKeyFor(ms, undefined)).toBe(utc);
      expect(fitnessDateKeyFor(ms, null)).toBe(utc);
      expect(fitnessDateKeyFor(ms, { segments: [] })).toBe(utc);
      expect(fitnessDateKeyFor(ms, { segments: [{ fromMs: null, tz: "Not/AZone" }] })).toBe(utc);
      expect(fitnessDateKeyFor(ms, { segments: [{ fromMs: 10, tz: "UTC" }, { fromMs: 5, tz: "Asia/Seoul" }] })).toBe(utc);
    }
    expect(normalizeFitnessDateKeyBasis(undefined)).toBe(UTC_FITNESS_DATE_KEY_BASIS);
  });

  it("전환 경계 직전은 UTC, 직후는 KST 키 — 15시간짜리 하루 뒤 날짜가 이어진다", () => {
    expect(fitnessDateKeyFor(CUT - 1, KST_BASIS)).toBe("2026-10-10");
    expect(fitnessDateKeyFor(CUT, KST_BASIS)).toBe("2026-10-11");
    // 전환일 2026-10-10 은 UTC 00:00 ~ 15:00 (15시간)
    expect(fitnessDateKeyFor(Date.parse("2026-10-10T00:00:00.000Z"), KST_BASIS)).toBe("2026-10-10");
    expect(fitnessDateKeyFor(Date.parse("2026-10-09T23:59:59.999Z"), KST_BASIS)).toBe("2026-10-09");
    expect(fitnessDateKeyTimezoneAt(CUT - 1, KST_BASIS)).toBe("UTC");
    expect(fitnessDateKeyTimezoneAt(CUT, KST_BASIS)).toBe("Asia/Seoul");
  });

  it("KST 01:00(UTC 전날 16:00) 의 오늘 키는 KST 날짜", () => {
    const now = Date.parse("2026-10-17T16:00:00.000Z");
    expect(fitnessTodayKey(now, KST_BASIS)).toBe("2026-10-18");
    expect(fitnessTodayKey(now)).toBe("2026-10-17");
  });

  it("America/New_York DST 시작·종료일(23·25시간) 경계", () => {
    const ny = { segments: [{ fromMs: null, tz: "America/New_York" }] };
    // 2026-03-08: 00:00 EST = 05:00Z, 다음 자정 00:00 EDT = 2026-03-09T04:00Z (23시간)
    expect(fitnessDateKeyFor(Date.parse("2026-03-08T04:59:59.999Z"), ny)).toBe("2026-03-07");
    expect(fitnessDateKeyFor(Date.parse("2026-03-08T05:00:00.000Z"), ny)).toBe("2026-03-08");
    expect(fitnessDateKeyFor(Date.parse("2026-03-09T03:59:59.999Z"), ny)).toBe("2026-03-08");
    expect(fitnessDateKeyFor(Date.parse("2026-03-09T04:00:00.000Z"), ny)).toBe("2026-03-09");
    // 2026-11-01: 00:00 EDT = 04:00Z, 다음 자정 00:00 EST = 2026-11-02T05:00Z (25시간)
    expect(fitnessDateKeyFor(Date.parse("2026-11-01T03:59:59.999Z"), ny)).toBe("2026-10-31");
    expect(fitnessDateKeyFor(Date.parse("2026-11-01T04:00:00.000Z"), ny)).toBe("2026-11-01");
    expect(fitnessDateKeyFor(Date.parse("2026-11-02T04:59:59.999Z"), ny)).toBe("2026-11-01");
    expect(fitnessDateKeyFor(Date.parse("2026-11-02T05:00:00.000Z"), ny)).toBe("2026-11-02");
  });

  it("첫 구간보다 이른 순간은 첫 구간 시간대", () => {
    const pruned = { segments: [{ fromMs: CUT, tz: "Asia/Seoul" }] };
    // 2026-10-09T20:00Z = KST 2026-10-10 05:00 (UTC 로는 10-09)
    expect(fitnessDateKeyFor(Date.parse("2026-10-09T20:00:00.000Z"), pruned)).toBe("2026-10-10");
  });

  it("달력 산술은 날짜 문자열 기준", () => {
    expect(addFitnessDateKeyDays("2026-03-09", -1)).toBe("2026-03-08");
    expect(addFitnessDateKeyDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addFitnessDateKeyDays("2026-10-18", -13)).toBe("2026-10-05");
  });
});

describe("validFitnessLoadSnapshotProof dateKeyBasis", () => {
  const proof = (asOf: number, coverageEndDate: string, dateKeyBasis?: unknown) => ({
    inputRevision: 1,
    inputDigest: "a".repeat(64),
    asOf,
    inputReadTime: { seconds: Math.floor(asOf / 1000), nanoseconds: (asOf % 1000) * 1_000_000 },
    coverageStartDate: coverageEndDate,
    coverageEndDate,
    points: [{ date: coverageEndDate, dailyLoad: 0, status: "final", quality: "zero" }],
    ...(dateKeyBasis === undefined ? {} : { dateKeyBasis }),
  });
  const asOf = Date.parse("2026-10-17T16:00:00.000Z");

  it("basis 없음 — 기존처럼 UTC(asOf) 와 일치해야 한다", () => {
    expect(validFitnessLoadSnapshotProof(proof(asOf, "2026-10-17"))).toBe(true);
    expect(validFitnessLoadSnapshotProof(proof(asOf, "2026-10-18"))).toBe(false);
  });

  it("KST basis — coverageEndDate 는 KST(asOf)", () => {
    expect(validFitnessLoadSnapshotProof(proof(asOf, "2026-10-18", KST_BASIS))).toBe(true);
    expect(validFitnessLoadSnapshotProof(proof(asOf, "2026-10-17", KST_BASIS))).toBe(false);
  });
});
