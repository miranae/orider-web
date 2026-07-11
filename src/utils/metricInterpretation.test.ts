import { describe, it, expect } from "vitest";
import { interpretMetric, interpretActivitySummary } from "./metricInterpretation";

describe("interpretMetric — gap", () => {
  it("GAP 이 실제 페이스보다 빠르면 오르막", () => {
    const r = interpretMetric("gap", { paceSecPerKm: 352, gapSecPerKm: 340 })!;
    expect(r.variant).toBe("uphill");
    expect(r.values.diffSec).toBe(12);
  });

  it("GAP 이 느리면 내리막", () => {
    const r = interpretMetric("gap", { paceSecPerKm: 330, gapSecPerKm: 345 })!;
    expect(r.variant).toBe("downhill");
    expect(r.values.diffSec).toBe(15);
  });

  it("차이가 5초 미만이면 평지", () => {
    expect(interpretMetric("gap", { paceSecPerKm: 340, gapSecPerKm: 337 })!.variant).toBe("flat");
  });

  it("GAP 이 없으면 해석 생략", () => {
    expect(interpretMetric("gap", { paceSecPerKm: 340 })).toBeNull();
  });
});

describe("interpretMetric — pace (낮을수록 좋음)", () => {
  it("기준선보다 빠르면 faster + 단축 초 반환", () => {
    const r = interpretMetric("pace", { paceSecPerKm: 340, baselinePaceSecPerKm: 348 })!;
    expect(r.variant).toBe("faster");
    expect(r.values.diffSec).toBe(8);
  });

  it("기준선보다 느리면 slower (양수 초로 표기)", () => {
    const r = interpretMetric("pace", { paceSecPerKm: 355, baselinePaceSecPerKm: 348 })!;
    expect(r.variant).toBe("slower");
    expect(r.values.diffSec).toBe(7);
  });

  it("3초 미만 차이는 steady", () => {
    expect(interpretMetric("pace", { paceSecPerKm: 348, baselinePaceSecPerKm: 350 })!.variant).toBe("steady");
  });

  it("기준선이 없으면 해석 생략", () => {
    expect(interpretMetric("pace", { paceSecPerKm: 340 })).toBeNull();
  });
});

describe("interpretMetric — cadence", () => {
  it.each([
    [160, "low"],
    [178, "optimal"],
    [192, "high"],
  ])("케이던스 %d spm → %s", (cadenceSpm, variant) => {
    expect(interpretMetric("cadence", { cadenceSpm })!.variant).toBe(variant);
  });

  it("값이 없으면 null", () => {
    expect(interpretMetric("cadence", {})).toBeNull();
  });
});

describe("interpretMetric — rtss (IF 기반 회복 안내)", () => {
  // IF = thresholdPace / avgPace. 임계 300, 실제 280 → IF 1.07 (임계 초과 = 고강도)
  it("IF ≥ 1.0 이면 hard", () => {
    const r = interpretMetric("rtss", { rtss: 82, thresholdPaceSecPerKm: 300, paceSecPerKm: 280 })!;
    expect(r.variant).toBe("hard");
    expect(r.values.if).toBe("1.07");
  });

  it("IF < 0.85 이면 easy", () => {
    const r = interpretMetric("rtss", { rtss: 30, thresholdPaceSecPerKm: 300, paceSecPerKm: 380 })!;
    expect(r.variant).toBe("easy");
  });

  it("중간 강도는 moderate", () => {
    const r = interpretMetric("rtss", { rtss: 64, thresholdPaceSecPerKm: 300, paceSecPerKm: 326 })!;
    expect(r.variant).toBe("moderate");
    expect(r.values.rtss).toBe(64);
  });

  it("임계 페이스가 없으면 해석 생략 (근거 없는 개인화 금지)", () => {
    expect(interpretMetric("rtss", { rtss: 64, paceSecPerKm: 340 })).toBeNull();
  });
});

describe("interpretMetric — tsb / ctl / atl", () => {
  it("TSB 해석은 훈련 상태 라벨과 같은 판정을 쓴다", () => {
    expect(interpretMetric("tsb", { tsb: 0 })!.variant).toBe("productive");
    expect(interpretMetric("tsb", { tsb: -12 })!.variant).toBe("needsRecovery");
    expect(interpretMetric("tsb", { tsb: -40 })!.variant).toBe("overload");
    expect(interpretMetric("tsb", { tsb: 40 })!.variant).toBe("overRecovered");
  });

  it("TSB 램프 승격이 해석에도 반영된다", () => {
    expect(interpretMetric("tsb", { tsb: -15, ctlRampPerWeek: 10 })!.variant).toBe("overload");
  });

  it("CTL 은 램프 방향으로 분기", () => {
    expect(interpretMetric("ctl", { ctl: 42, ctlRampPerWeek: 2.5 })!.variant).toBe("rising");
    expect(interpretMetric("ctl", { ctl: 42, ctlRampPerWeek: -1.2 })!.variant).toBe("falling");
    expect(interpretMetric("ctl", { ctl: 42 })!.variant).toBe("plain");
  });

  it("ATL 은 CTL 대비 비율로 분기", () => {
    expect(interpretMetric("atl", { atl: 60, ctl: 42 })!.variant).toBe("high");
    expect(interpretMetric("atl", { atl: 30, ctl: 42 })!.variant).toBe("low");
    expect(interpretMetric("atl", { atl: 40, ctl: 42 })!.variant).toBe("balanced");
  });
});

describe("interpretMetric — thresholdPace", () => {
  it("설정되어 있으면 set, 없으면 unset", () => {
    expect(interpretMetric("thresholdPace", { thresholdPaceSecPerKm: 325 })!.variant).toBe("set");
    expect(interpretMetric("thresholdPace", {})!.variant).toBe("unset");
  });
});

describe("interpretActivitySummary", () => {
  it("GAP·페이스 근거가 있으면 둘 다 담아 반환", () => {
    const r = interpretActivitySummary({
      paceSecPerKm: 352,
      gapSecPerKm: 340,
      baselinePaceSecPerKm: 360,
    })!;
    expect(r.gap!.variant).toBe("uphill");
    expect(r.pace!.variant).toBe("faster");
  });

  it("근거가 하나도 없으면 null — 요약 카드를 렌더하지 않는다", () => {
    expect(interpretActivitySummary({ paceSecPerKm: 340 })).toBeNull();
  });

  it("한쪽 근거만 있어도 요약은 렌더한다", () => {
    const r = interpretActivitySummary({ paceSecPerKm: 340, gapSecPerKm: 320 })!;
    expect(r.gap).not.toBeNull();
    expect(r.pace).toBeNull();
  });
});
