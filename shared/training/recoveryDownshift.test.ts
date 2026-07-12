import { describe, expect, it } from "vitest";
import { evaluateRecoveryDownshift, BURNOUT_TSB, RECOVERY_TSB } from "./recoveryDownshift";

describe("evaluateRecoveryDownshift (#365)", () => {
  it("이지/휴식/지구력 계획은 TSB 와 무관하게 다운시프트하지 않음", () => {
    for (const workoutKind of ["rest", "rec", "z2", "z2Long", "easyRun", "recoveryRun", "easySwim", "recoverySwim"] as const) {
      const r = evaluateRecoveryDownshift({ workoutKind, tsb: -40 });
      expect(r.shouldDownshift).toBe(false);
      expect(r.suggestedSwap).toBeNull();
    }
  });

  it("하드데이(ftp) + TSB 양호 → 계획 유지", () => {
    const r = evaluateRecoveryDownshift({ workoutKind: "ftp", tsb: 0 });
    expect(r.shouldDownshift).toBe(false);
    expect(r.suggestedSwap).toBeNull();
  });

  it("하드데이(vo2) + TSB 회복 임계 미만(-5 미만) → easy 스왑 제안", () => {
    const r = evaluateRecoveryDownshift({ workoutKind: "vo2", tsb: -10 });
    expect(r.shouldDownshift).toBe(true);
    expect(r.suggestedSwap).toBe("easy");
  });

  it("하드데이(hillRepeats) + TSB 번아웃 임계 미만(-20 미만) → rest 스왑 제안(easy 보다 강한 제안)", () => {
    const r = evaluateRecoveryDownshift({ workoutKind: "hillRepeats", tsb: -25 });
    expect(r.shouldDownshift).toBe(true);
    expect(r.suggestedSwap).toBe("rest");
  });

  it("경계값: TSB 정확히 RECOVERY_TSB(-5) → 다운시프트 없음(미만일 때만)", () => {
    expect(evaluateRecoveryDownshift({ workoutKind: "tempo", tsb: RECOVERY_TSB }).shouldDownshift).toBe(false);
    expect(evaluateRecoveryDownshift({ workoutKind: "tempo", tsb: RECOVERY_TSB - 0.01 }).shouldDownshift).toBe(true);
  });

  it("경계값: TSB 정확히 BURNOUT_TSB(-20) → easy(rest 아님, 미만일 때만 rest)", () => {
    const atBoundary = evaluateRecoveryDownshift({ workoutKind: "tempo", tsb: BURNOUT_TSB });
    expect(atBoundary.suggestedSwap).toBe("easy");
    const belowBoundary = evaluateRecoveryDownshift({ workoutKind: "tempo", tsb: BURNOUT_TSB - 0.01 });
    expect(belowBoundary.suggestedSwap).toBe("rest");
  });

  it.each(["tempoRun", "intervalRun", "threshRun", "raceRun", "progressRun"] as const)(
    "러닝 하드데이(%s) 도 동일하게 판정",
    (workoutKind) => {
      const r = evaluateRecoveryDownshift({ workoutKind, tsb: -10 });
      expect(r.shouldDownshift).toBe(true);
      expect(r.suggestedSwap).toBe("easy");
    },
  );

  it.each(["intervalSwim", "cssSwim", "racepaceSwim", "sprintSwim"] as const)(
    "수영 하드데이(%s) 도 동일하게 판정",
    (workoutKind) => {
      const r = evaluateRecoveryDownshift({ workoutKind, tsb: -25 });
      expect(r.shouldDownshift).toBe(true);
      expect(r.suggestedSwap).toBe("rest");
    },
  );
});

describe("evaluateRecoveryDownshift — 지평·의도된 하드데이 (#429 리뷰 반영)", () => {
  it("goal(레이스 당일)·sim(레이스 시뮬)은 피로해도 다운시프트를 제안하지 않는다", () => {
    expect(evaluateRecoveryDownshift({ workoutKind: "goal", tsb: -30 }).shouldDownshift).toBe(false);
    expect(evaluateRecoveryDownshift({ workoutKind: "sim", tsb: -30 }).shouldDownshift).toBe(false);
  });

  it("오늘 TSB 는 +3일까지만 유효 — 지평 밖 미래 하드데이는 판정하지 않는다", () => {
    expect(evaluateRecoveryDownshift({ workoutKind: "vo2", tsb: -30, daysUntil: 3 }).shouldDownshift).toBe(true);
    expect(evaluateRecoveryDownshift({ workoutKind: "vo2", tsb: -30, daysUntil: 4 }).shouldDownshift).toBe(false);
    expect(evaluateRecoveryDownshift({ workoutKind: "vo2", tsb: -30, daysUntil: 56 }).shouldDownshift).toBe(false);
  });

  it("daysUntil 생략 시 오늘(0)로 간주해 기존 동작 보존", () => {
    expect(evaluateRecoveryDownshift({ workoutKind: "ftp", tsb: -21 }).suggestedSwap).toBe("rest");
  });
});
