import { describe, expect, it } from "vitest";
import { buildCyclingDynamicsCards } from "./cyclingDynamicsPresentation";

describe("buildCyclingDynamicsCards", () => {
  it("모든 센서 지표를 확장 가능한 카드 목록으로 변환", () => {
    const cards = buildCyclingDynamicsCards({
      cyclingDynamics: {
        source: "records", sampleCount: 100, validSampleCount: 80, coverage: 0.8,
        balance: { leftAvgPct: 48.2, rightAvgPct: 51.8, asymmetryPct: 3.6 },
        torqueEffectiveness: { leftAvgPct: 72.1, rightAvgPct: 73.2 },
        pedalSmoothness: { leftAvgPct: 21.2, rightAvgPct: 22.3, combinedAvgPct: 21.8 },
        platformCenterOffset: { leftAvgMm: -3.2, rightAvgMm: 1.4 },
        powerPhase: { left: { startDeg: 350, endDeg: 210, arcDeg: 220, peakStartDeg: 40, peakEndDeg: 110 } },
      },
    });
    expect(cards.map((card) => card.kind)).toEqual([
      "balance", "torqueEffectiveness", "pedalSmoothness", "platformCenterOffset", "powerPhaseLeft", "coverage",
    ]);
    expect(cards.find((card) => card.kind === "platformCenterOffset")?.value).toBe("-3.2 / 1.4");
    expect(cards.find((card) => card.kind === "powerPhaseLeft")).toMatchObject({ value: "350°–210°", detailValue: "220°|40°–110°" });
  });

  it("한쪽 페달과 0 값을 보존", () => {
    const cards = buildCyclingDynamicsCards({
      cyclingDynamics: {
        source: "session", sampleCount: 1, validSampleCount: 1, coverage: 1,
        torqueEffectiveness: { leftAvgPct: 0 },
        platformCenterOffset: { rightAvgMm: 0 },
      },
    });
    expect(cards.find((card) => card.kind === "torqueEffectiveness")?.value).toBe("0.0 / —");
    expect(cards.find((card) => card.kind === "platformCenterOffset")?.value).toBe("— / 0.0");
  });

  it("새 balance가 없으면 구형 lrBalance를 폴백으로 사용하고 중복하지 않음", () => {
    const cards = buildCyclingDynamicsCards({ lrBalance: { avg: 51.8, asymmetryPct: 3.6 } });
    expect(cards).toEqual([{ kind: "balance", value: "48.2 / 51.8", unit: "L/R %", detailValue: "3.6" }]);
  });

  it("센서 지표와 구형 폴백이 모두 없으면 빈 목록", () => {
    expect(buildCyclingDynamicsCards({})).toEqual([]);
  });
});
