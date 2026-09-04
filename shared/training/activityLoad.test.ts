import { describe, expect, it } from "vitest";
import {
  estimateLoad,
  isNegligibleActivity,
  isNegligibleActivitySummary,
  isSaneTss,
  TSS_SANITY_MAX,
} from "./activityLoad";

describe("estimateLoad — 폴백 체인 (#365: streamTrimpTss 단계 삽입)", () => {
  it("precomputedTss 최우선", () => {
    const r = estimateLoad({ precomputedTss: 120, streamTss: 90, streamTrimpTss: 80, relativeEffort: 70, durationMillis: 3600000 });
    expect(r).toEqual({ value: 120, source: "tss" });
  });

  it("precomputedTss 없으면 streamTss", () => {
    const r = estimateLoad({ streamTss: 90, streamTrimpTss: 80, relativeEffort: 70, durationMillis: 3600000 });
    expect(r).toEqual({ value: 90, source: "tss" });
  });

  it("avgPower 근사(bike)가 streamTrimpTss 보다 우선", () => {
    const r = estimateLoad({
      avgPower: 190,
      ftp: 200,
      streamTrimpTss: 200,
      relativeEffort: 70,
      durationMillis: 3600000,
      discipline: "bike",
    });
    expect(r.source).toBe("tss");
    expect(r.value).not.toBe(200);
  });

  it("파워 데이터 없이 streamTrimpTss 만 있으면 그 값을 사용(TRIMP 소스)", () => {
    const r = estimateLoad({ streamTrimpTss: 85, relativeEffort: 70, durationMillis: 3600000 });
    expect(r).toEqual({ value: 85, source: "trimp" });
  });

  it("streamTrimpTss 가 relativeEffort 보다 우선", () => {
    const r = estimateLoad({ streamTrimpTss: 85, relativeEffort: 400, durationMillis: 3600000 });
    expect(r.value).toBe(85);
    expect(r.source).toBe("trimp");
  });

  it("streamTrimpTss 없거나 비정상(sanity 초과)이면 relativeEffort 로 폴백", () => {
    const r1 = estimateLoad({ streamTrimpTss: null, relativeEffort: 70, durationMillis: 3600000 });
    expect(r1).toEqual({ value: 70, source: "trimp" });

    const r2 = estimateLoad({ streamTrimpTss: TSS_SANITY_MAX + 1, relativeEffort: 70, durationMillis: 3600000 });
    expect(r2).toEqual({ value: 70, source: "trimp" });
  });

  it("streamTrimpTss·relativeEffort 모두 없으면 시간 기반으로 폴백", () => {
    const r = estimateLoad({ durationMillis: 2 * 3600000 }); // 2h, discipline 미상 → factor 50
    expect(r).toEqual({ value: 100, source: "time" });
  });
});

describe("isSaneTss", () => {
  it("0 초과 TSS_SANITY_MAX 이하만 유효", () => {
    expect(isSaneTss(1)).toBe(true);
    expect(isSaneTss(TSS_SANITY_MAX)).toBe(true);
    expect(isSaneTss(TSS_SANITY_MAX + 1)).toBe(false);
    expect(isSaneTss(0)).toBe(false);
    expect(isSaneTss(null)).toBe(false);
    expect(isSaneTss(undefined)).toBe(false);
    expect(isSaneTss(NaN)).toBe(false);
  });
});

describe("isNegligibleActivity", () => {
  it("requires both sub-500m distance and sub-10-minute duration", () => {
    expect(isNegligibleActivity(189, 165_000)).toBe(true);
    expect(isNegligibleActivity(500, 165_000)).toBe(false);
    expect(isNegligibleActivity(189, 10 * 60_000)).toBe(false);
    expect(isNegligibleActivity(null, 165_000)).toBe(false);
  });

  it("uses the server duration fallback order for activity summaries", () => {
    expect(isNegligibleActivitySummary({
      distance: 189,
      ridingTimeMillis: 165_000,
      movingTimeMillis: 20 * 60_000,
    })).toBe(true);
    expect(isNegligibleActivitySummary({ distance: 189, elapsedTimeMillis: 20 * 60_000 })).toBe(false);
  });
});
