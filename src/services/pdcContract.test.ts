import { describe, expect, expectTypeOf, it } from "vitest";
import type { PdcDoc } from "@shared/types/pdc";
import { hasCanonicalPdcV5Source } from "@shared/training/pdcRiderGate";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { parsePersistedPdc, unknownPdcTopLevelKeys } from "./pdcContract";

const fixture = () => structuredClone(parity.persistedPdc) as any;
const v6Fixture = () => {
  const value = fixture();
  value.version = 6;
  value.status = "final";
  value.inputDigest = "a".repeat(64);
  value.asOf = value.computedAt;
  value.coverage = { state: "complete", candidateActivityCount: value.activityCount,
    includedActivityCount: value.activityCount, excludedActivityCount: 0,
    excludedActivityIds: [], excludedActivityIdsTruncated: false, excludedReasonCounts: {},
    carriedForwardDurationCount: 0 };
  return value;
};
const legacyFixture = () => {
  const legacy = fixture();
  legacy.version = 1;
  delete legacy.provenance;
  for (const entry of Object.values(legacy.mmpAll) as any[]) {
    delete entry.source;
    delete entry.cohortEligible;
  }
  return legacy;
};

describe("persisted PDC contract", () => {
  it("accepts a complete v6 final document with measured provenance", () => {
    const parsed = parsePersistedPdc(v6Fixture());
    expect(parsed).toMatchObject({ version: 6, status: "final", coverage: { state: "complete", excludedActivityCount: 0 } });
    expect(hasCanonicalPdcV5Source(parsed)).toBe(true);
  });

  it("accepts a v6 final document with more candidate rides than measured PDC inputs", () => {
    const value = v6Fixture();
    value.activityCount = 20;
    value.coverage.includedActivityCount = 20;
    value.coverage.candidateActivityCount = 76;
    expect(parsePersistedPdc(value)).toMatchObject({ version: 6, status: "final",
      coverage: { candidateActivityCount: 76, includedActivityCount: 20, excludedActivityCount: 0 } });
  });

  it("accepts a structurally valid v6 partial document without promoting it as canonical", () => {
    const value = v6Fixture();
    value.status = "partial";
    value.coverage = { ...value.coverage, state: "partial", candidateActivityCount: value.activityCount + 1,
      excludedActivityCount: 1, excludedActivityIds: ["pending-ride"],
      excludedReasonCounts: { metrics_not_final: 1 } };
    value.inputExclusions = { reason: "input_pending", count: 1,
      activityIds: ["pending-ride"], mergedWithLastKnownGood: false };
    const parsed = parsePersistedPdc(value);
    expect(parsed).toMatchObject({ version: 6, status: "partial" });
    expect(hasCanonicalPdcV5Source(parsed)).toBe(false);
  });

  it.each([
    ["missing digest", (value: any) => { delete value.inputDigest; }],
    ["malformed digest", (value: any) => { value.inputDigest = "not-a-sha256"; }],
    ["missing evaluation time", (value: any) => { delete value.asOf; }],
    ["wrong coverage state", (value: any) => { value.coverage.state = "partial"; }],
    ["excluded activity in final coverage", (value: any) => { value.coverage.excludedActivityCount = 1; }],
    ["partial status without exclusions", (value: any) => { value.status = "partial"; }],
    ["unexpected lifecycle field", (value: any) => { value.inputExclusions = { reason: "input_pending" }; }],
  ] as Array<[string, (value: any) => void]>)('rejects malformed v6 lifecycle: %s', (_label, mutate) => {
    const value = v6Fixture(); mutate(value);
    expect(() => parsePersistedPdc(value)).toThrow("INVALID_PERSISTED_PDC_V5");
  });

  it("모르는 최상위 키는 읽기를 막지 않고 드러낸다", () => {
    // 예전에는 fail-closed 로 거부했는데, 서버가 필드를 **더하기만 해도** 화면이 통째로
    // 비었다(2026-09-20 `ftpEstTrust` 추가 → 피트니스 상세 분석 전체 소실, 데이터는 정상).
    // 누출 감시는 로그가 맡고 화면은 살린다.
    const value = fixture();
    value.rawActivities = [];
    expect(() => parsePersistedPdc(value)).not.toThrow();
    expect(unknownPdcTopLevelKeys(value)).toEqual(["rawActivities"]);
  });

  it("나중에 추가된 선택 필드는 모르는 키로 보고하지 않는다", () => {
    const value = v6Fixture();
    value.ftpEstTrust = "consistent";
    expect(() => parsePersistedPdc(value)).not.toThrow();
    expect(unknownPdcTopLevelKeys(value)).toEqual([]);
  });

  it("선택 필드가 없는 옛 문서도 그대로 읽는다", () => {
    // 아직 재계산되지 않은 문서에는 ftpEstTrust 가 없다. 필수로 만들면 같은 사고가 난다.
    const value = v6Fixture();
    expect("ftpEstTrust" in value).toBe(false);
    expect(() => parsePersistedPdc(value)).not.toThrow();
  });

  it("선택 필드의 값이 계약 밖이면 거부한다", () => {
    const value = v6Fixture();
    value.ftpEstTrust = "maybe";
    expect(() => parsePersistedPdc(value)).toThrow("INVALID_PERSISTED_PDC_V5");
  });

  it("accepts only the canonical v5 measured-power provenance source", () => {
    const parsed = parsePersistedPdc(fixture());
    expect(parsed).toMatchObject({ version: 5, provenance: { version: 2, power: "measured", excludesVirtualPower: true },
      activityCount: 12, weightKgSnapshot: 70, riderType: { type: "AllRounder", confidence: 0.91 } });
  });

  it("preserves a valid optional v5 MMP context", () => {
    const value = fixture();
    value.mmpAll["5s"].context = "race";
    expect(parsePersistedPdc(value).mmpAll["5s"]).toMatchObject({ context: "race" });
  });

  it.each([42, "x".repeat(129)])("rejects an invalid v5 MMP context", (context) => {
    const value = fixture();
    value.mmpAll["5s"].context = context;
    expect(() => parsePersistedPdc(value)).toThrow("INVALID_PERSISTED_PDC_V5");
  });

  it("reconstructs persisted v1 as a non-canonical v5 document using only validated CP and MMP", () => {
    const legacy = legacyFixture();
    const parsed = parsePersistedPdc(legacy);
    expectTypeOf(parsed).toEqualTypeOf<PdcDoc>();
    expectTypeOf(parsed.version).toEqualTypeOf<5 | 6>();
    expect(parsed).toMatchObject({ version: 5, activityCount: 12, cp: { value: 270 },
      provenance: { version: 2, power: "unknown", excludesVirtualPower: false, migration: "legacy_v1" },
      pdcModel: null, stamina: null, powerProfile: "unclassified", wPerKgAtKey: null,
      riderType: null, ability: null, sustainablePower: [], history: [], vo2maxEst: null, weightKgSnapshot: null });
    expect(parsed.mmpAll["5s"]).toMatchObject({ source: "unknown", cohortEligible: false });
    expect(parsed.mmpAll["5s"]).not.toHaveProperty("context");
    expect(hasCanonicalPdcV5Source(parsed)).toBe(false);
  });

  it("preserves a valid optional v1 MMP context during migration", () => {
    const legacy = legacyFixture();
    legacy.mmpAll["5s"].context = "race";
    expect(parsePersistedPdc(legacy).mmpAll["5s"]).toMatchObject({ context: "race",
      source: "unknown", cohortEligible: false });
  });

  it("rejects an invalid v1 MMP context", () => {
    const legacy = legacyFixture();
    legacy.mmpAll["5s"].context = 42;
    expect(() => parsePersistedPdc(legacy)).toThrow("INVALID_PERSISTED_PDC_V5");
  });

  it("rejects malformed persisted v1 documents", () => {
    const legacy = legacyFixture();
    delete legacy.mmpAll["5s"].activityId;
    expect(() => parsePersistedPdc(legacy)).toThrow("INVALID_PERSISTED_PDC_V5");
  });

  it("accepts an incomplete v5 curve only when no definitive rider classification is claimed", () => {
    const value = fixture();
    value.riderType = null; value.ability = null; value.wPerKgAtKey = null; value.powerProfile = "unclassified";
    delete value.mmpAll["20m"]; delete value.provenance.byDuration["20m"];
    const parsed = parsePersistedPdc(value);
    expect(parsed.riderType).toBeNull();
    expect(hasCanonicalPdcV5Source(parsed)).toBe(false);
  });

  it("accepts a structurally valid personal Strava PDC without promoting it to the public cohort", () => {
    const value = fixture();
    for (const duration of ["5s", "1m", "5m", "20m"]) {
      value.mmpAll[duration].source = "strava_api";
      value.mmpAll[duration].cohortEligible = false;
      value.provenance.byDuration[duration] = { source: "strava_api", cohortEligible: false };
    }

    const parsed = parsePersistedPdc(value);
    expect(parsed.riderType).toMatchObject({ type: "AllRounder" });
    expect(hasCanonicalPdcV5Source(parsed)).toBe(false);
  });

  it.each([
    ["legacy version", (value: any) => { value.version = 4; }],
    ["legacy provenance", (value: any) => { value.provenance.version = 1; }],
    ["virtual power", (value: any) => { value.provenance.power = "virtual"; }],
    ["non-finite MMP", (value: any) => { value.mmpAll["5s"].value = Infinity; }],
    ["increasing curve", (value: any) => { value.mmpAll["20m"].value = 900; }],
    ["CP/model drift", (value: any) => { value.pdcModel.cpEst = 200; }],
    ["weight/ability drift", (value: any) => { value.ability.byDuration[0].wPerKg = 10; }],
    ["provenance/source drift", (value: any) => { value.provenance.byDuration["5s"].source = "direct_file"; }],
    ["unknown rider evidence", (value: any) => {
      value.mmpAll["5s"].source = "unknown"; value.mmpAll["5s"].cohortEligible = false;
      value.provenance.byDuration["5s"] = { source: "unknown", cohortEligible: false };
    }],
    ["empty rider MMP evidence", (value: any) => {
      delete value.mmpAll["20m"]; delete value.provenance.byDuration["20m"];
      delete value.wPerKgAtKey["20m"];
      value.ability.byDuration = value.ability.byDuration.filter((row: any) => row.duration !== "20m");
    }],
    ["invalid rider MMP activity evidence", (value: any) => { value.mmpAll["5m"].activityId = ""; }],
    ["invalid rider MMP date evidence", (value: any) => { value.mmpAll["5m"].date = "2026-02-30"; }],
    ["classification out of range", (value: any) => { value.riderType.confidence = 1.1; }],
    ["missing required field", (value: any) => { delete value.activityCount; }],
  ] as Array<[string, (value: any) => void]>)("rejects %s fail-closed", (_label, mutate) => {
    const value = fixture(); mutate(value);
    expect(() => parsePersistedPdc(value)).toThrow("INVALID_PERSISTED_PDC_V5");
  });
});

describe("운영 문서 회귀 (2026-09-20 ftpEstTrust 추가)", () => {
  it("서버가 필드를 더한 실제 문서를 읽는다", async () => {
    // 이 픽스처는 운영에서 그대로 가져온 v6 문서다(활동 id 만 마스킹). 이전 계약은
    // INVALID_PERSISTED_PDC_V5 로 던져 피트니스 "상세 분석" 이 통째로 비었다.
    const raw = (await import("./__fixtures__/pdc-v6-ftp-trust.json")).default;
    const parsed = parsePersistedPdc(raw);
    expect(parsed.cp?.value).toBe(177);
    expect(parsed.vo2maxEst).toBe(44.4);
    expect(parsed.riderType?.type).toBe("Puncher");
    expect(unknownPdcTopLevelKeys(raw)).toEqual([]);
  });
});
