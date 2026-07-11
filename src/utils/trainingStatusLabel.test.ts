import { describe, it, expect } from "vitest";
import {
  trainingStatusLabel,
  trainingStatusAdviceKey,
  TRAINING_STATUS_ORDER,
  type TrainingStatusKey,
} from "./trainingStatusLabel";
import { tsbStatusLabel } from "../features/fitness/fitnessPageUtils";

describe("trainingStatusLabel — TSB 구간", () => {
  const cases: [number, TrainingStatusKey][] = [
    [-45, "overload"],
    [-30, "overload"],
    [-29, "needsRecovery"],
    [-10, "needsRecovery"],
    [-9, "productive"],
    [5, "productive"],
    [6, "fresh"],
    [25, "fresh"],
    [26, "overRecovered"],
    [40, "overRecovered"],
  ];

  it.each(cases)("TSB %d → %s", (tsb, expected) => {
    expect(trainingStatusLabel({ tsb }).key).toBe(expected);
  });

  it("상태 index 는 TSB 오름차순으로 단조 증가한다", () => {
    const tsbs = [-45, -20, 0, 15, 40];
    const indices = tsbs.map((tsb) => trainingStatusLabel({ tsb }).index);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("스펙트럼 순서는 5개 상태를 모두 포함하고 index 와 일치한다", () => {
    expect(TRAINING_STATUS_ORDER).toHaveLength(5);
    const sample: Record<TrainingStatusKey, number> = {
      overload: -40,
      needsRecovery: -20,
      productive: 0,
      fresh: 15,
      overRecovered: 40,
    };
    for (const key of TRAINING_STATUS_ORDER) {
      const status = trainingStatusLabel({ tsb: sample[key] });
      expect(status.key).toBe(key);
      expect(TRAINING_STATUS_ORDER[status.index]).toBe(key);
    }
  });
});

/**
 * 회귀 방지: 기존 KPI 스트립(`tsbStatusLabel`)과 경계가 어긋나면 같은 화면에서
 * 같은 TSB 가 두 가지 상태로 표시된다. 두 함수는 반드시 같은 밴드를 가리켜야 한다.
 */
describe("trainingStatusLabel — 기존 tsbStatusLabel 과 경계 정합", () => {
  const EXPECTED_PAIRS: [TrainingStatusKey, string][] = [
    ["overload", "status.overtraining"],
    ["needsRecovery", "status.fatigueBuild"],
    ["productive", "status.optimalForm"],
    ["fresh", "status.racingPeak"],
    ["overRecovered", "status.overRecovery"],
  ];
  const identity = (key: string) => key;

  // 경계 근방을 촘촘히 훑어 두 구현이 같은 밴드로 떨어지는지 확인.
  const probes = [-45, -31, -30, -29, -11, -10, -9, 0, 5, 6, 24, 25, 26, 40];

  it.each(probes)("TSB %d 에서 두 라벨이 같은 밴드를 가리킨다", (tsb) => {
    const mine = trainingStatusLabel({ tsb }).key;
    const legacy = tsbStatusLabel(tsb, identity);
    const expectedLegacy = EXPECTED_PAIRS.find(([k]) => k === mine)![1];
    expect(legacy).toBe(expectedLegacy);
  });
});

describe("trainingStatusLabel — 시맨틱 톤", () => {
  it("경고색은 과부하 주의 하나뿐 (양끝을 모두 경고로 칠하지 않는다)", () => {
    expect(trainingStatusLabel({ tsb: -40 }).tone).toBe("warning");
    expect(trainingStatusLabel({ tsb: -20 }).tone).toBe("neutral");
    expect(trainingStatusLabel({ tsb: 40 }).tone).toBe("neutral");
  });

  it("순항만 accent 톤", () => {
    expect(trainingStatusLabel({ tsb: 0 }).tone).toBe("accent");
  });
});

describe("trainingStatusLabel — CTL 램프 승격", () => {
  it("램프가 과도하고 이미 피로하면 과부하로 승격", () => {
    const s = trainingStatusLabel({ tsb: -15, ctlRampPerWeek: 10 });
    expect(s.key).toBe("overload");
    expect(s.drivenByRamp).toBe(true);
  });

  it("램프가 과도해도 충분히 신선하면(TSB > -10) 승격하지 않는다", () => {
    const s = trainingStatusLabel({ tsb: 0, ctlRampPerWeek: 12 });
    expect(s.key).toBe("productive");
    expect(s.drivenByRamp).toBe(false);
  });

  it("램프가 완만하면 승격하지 않는다", () => {
    expect(trainingStatusLabel({ tsb: -15, ctlRampPerWeek: 3 }).key).toBe("needsRecovery");
  });

  it("램프 정보가 없으면 TSB 만으로 판정", () => {
    expect(trainingStatusLabel({ tsb: -15, ctlRampPerWeek: null }).key).toBe("needsRecovery");
    expect(trainingStatusLabel({ tsb: -15 }).key).toBe("needsRecovery");
  });

  it("이미 TSB 로 과부하면 drivenByRamp 는 false (원인은 램프가 아님)", () => {
    const s = trainingStatusLabel({ tsb: -40, ctlRampPerWeek: 12 });
    expect(s.key).toBe("overload");
    expect(s.drivenByRamp).toBe(false);
  });
});

describe("trainingStatusAdviceKey", () => {
  it("램프 승격이면 adviceRamp 키", () => {
    const s = trainingStatusLabel({ tsb: -15, ctlRampPerWeek: 10 });
    expect(trainingStatusAdviceKey(s)).toBe("trainingStatus.overload.adviceRamp");
  });

  it("일반 상태면 advice 키", () => {
    const s = trainingStatusLabel({ tsb: 0 });
    expect(trainingStatusAdviceKey(s)).toBe("trainingStatus.productive.advice");
  });
});
