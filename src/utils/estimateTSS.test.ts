import { describe, it, expect } from "vitest";
import type { Activity } from "@shared/types";
import { TIME_FACTORS } from "@shared/training/activityLoad";
import { estimateTSS, estimateRunTSS, estimateSwimTSS, estimateBikeTSS } from "./estimateTSS";

/** 테스트용 최소 Activity. summary 핵심 필드만 채우고 나머지는 캐스팅으로 우회. */
function act(opts: {
  type?: string;
  hours?: number;
  tss?: number | null;
  relativeEffort?: number | null;
  averageSpeed?: number;
  averagePower?: number | null;
}): Activity {
  return {
    type: opts.type ?? "Ride",
    summary: {
      ridingTimeMillis: (opts.hours ?? 1) * 3600000,
      averageSpeed: opts.averageSpeed ?? 0,
      averagePower: opts.averagePower ?? null,
      relativeEffort: opts.relativeEffort ?? null,
      tss: opts.tss ?? null,
    },
  } as unknown as Activity;
}

describe("estimateTSS — 정본(activityLoad) 수렴", () => {
  it("사전계산 summary.tss 가 sane 하면 최우선", () => {
    expect(estimateTSS(act({ tss: 88, relativeEffort: 200, hours: 2 }))).toBe(88);
  });

  it("tss 없으면 relativeEffort(TRIMP) 사용", () => {
    expect(estimateTSS(act({ tss: null, relativeEffort: 150, hours: 3 }))).toBe(150);
  });

  it("tss/relativeEffort 없으면 bike 시간factor(42) — 옛 65 아님", () => {
    expect(estimateTSS(act({ type: "Ride", hours: 2 }))).toBe(Math.round(2 * TIME_FACTORS.bike));
  });

  it("run 타입은 시간factor 60 — 옛 80 아님", () => {
    expect(estimateTSS(act({ type: "Run", hours: 1.5 }))).toBe(Math.round(1.5 * TIME_FACTORS.run));
  });

  it("swim 타입은 시간factor 40 — 옛 50 아님", () => {
    expect(estimateTSS(act({ type: "Swim", hours: 1 }))).toBe(Math.round(1 * TIME_FACTORS.swim));
  });

  it("sanity 상한 초과 사전계산 tss 는 무시하고 폴백", () => {
    // tss=9999(>600) → 무시 → relativeEffort 없음 → bike 시간factor
    expect(estimateTSS(act({ type: "Ride", tss: 9999, hours: 1 }))).toBe(
      Math.round(1 * TIME_FACTORS.bike),
    );
  });
});

describe("estimateRunTSS / estimateSwimTSS — IF² 우선, 정본 factor 폴백", () => {
  it("thresholdPace 있으면 IF² 기반 rTSS", () => {
    // avgSpeed 12km/h → avgPace 300s/km. threshold 270s/km → IF=0.9 → 1h*0.81*100=81
    const v = estimateRunTSS(act({ type: "Run", hours: 1, averageSpeed: 12 }), 270);
    expect(Math.round(v)).toBe(81);
  });

  it("thresholdPace 없으면 run 시간factor(60) 폴백", () => {
    expect(estimateRunTSS(act({ type: "Run", hours: 2 }))).toBe(2 * TIME_FACTORS.run);
  });

  it("CSS 없으면 swim 시간factor(40) 폴백", () => {
    expect(estimateSwimTSS(act({ type: "Swim", hours: 1 }))).toBe(1 * TIME_FACTORS.swim);
  });
});

describe("estimateBikeTSS", () => {
  it("relativeEffort 우선", () => {
    expect(estimateBikeTSS(act({ relativeEffort: 120, hours: 3 }))).toBe(120);
  });

  it("relativeEffort 없으면 bike 시간factor(42)", () => {
    expect(estimateBikeTSS(act({ hours: 2 }))).toBe(2 * TIME_FACTORS.bike);
  });
});
