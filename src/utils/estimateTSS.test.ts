import { describe, it, expect } from "vitest";
import type { Activity } from "@shared/types";
import { TIME_FACTORS } from "@shared/training/activityLoad";
import { estimateTSS, estimateActivityTss, sumActivityTss, estimateRunTSS, estimateSwimTSS, estimateBikeTSS } from "./estimateTSS";

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

describe("estimateActivityTss — 모르면 null, 추정이면 표식", () => {
  it("서버 사전계산 summary.tss 는 추정이 아니다", () => {
    expect(estimateActivityTss(act({ tss: 88, hours: 2 }))).toEqual({ value: 88, estimated: false });
  });

  it("옛 문서의 최상위 tss 도 사전계산 경로로 취급", () => {
    const legacy = { ...act({ hours: 2 }), tss: 77 } as unknown as Activity;
    expect(estimateActivityTss(legacy)).toEqual({ value: 77, estimated: false });
  });

  it("시간factor 로 채운 값은 추정으로 표식", () => {
    expect(estimateActivityTss(act({ hours: 2 }))).toEqual({
      value: Math.round(2 * TIME_FACTORS.bike),
      estimated: true,
    });
  });

  it("근거가 없으면 null — 0 을 확정값처럼 돌려주지 않는다", () => {
    expect(estimateActivityTss(act({ hours: 0 }))).toEqual({ value: null, estimated: false });
    expect(estimateTSS(act({ hours: 0 }))).toBeNull();
  });
});

describe("sumActivityTss — 아는 값만 합산, 추정 혼입 고지", () => {
  it("추정치가 섞이면 estimated=true", () => {
    const total = sumActivityTss([act({ tss: 50, hours: 1 }), act({ hours: 1 })]);
    expect(total).toEqual({ value: 50 + Math.round(TIME_FACTORS.bike), estimated: true });
  });

  it("전부 사전계산이면 estimated=false", () => {
    expect(sumActivityTss([act({ tss: 50, hours: 1 }), act({ tss: 30, hours: 1 })]))
      .toEqual({ value: 80, estimated: false });
  });

  it("모르는 활동은 0 으로 세지 않고 건너뛴다", () => {
    expect(sumActivityTss([act({ tss: 50, hours: 1 }), act({ hours: 0 })]))
      .toEqual({ value: 50, estimated: false });
  });

  it("아는 값이 하나도 없으면 null", () => {
    expect(sumActivityTss([act({ hours: 0 })])).toEqual({ value: null, estimated: false });
    expect(sumActivityTss([])).toEqual({ value: null, estimated: false });
  });
});
