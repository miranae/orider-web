import { describe, expect, it } from "vitest";
import { displayedSufficiencyState, parseSufficiencySet } from "./sufficiencyContract";
import { sufficiencyBlock, sufficiencySet } from "../features/sufficiency/__fixtures__";

describe("parseSufficiencySet", () => {
  it("서버 모양을 그대로 받는다", () => {
    const parsed = parseSufficiencySet(sufficiencySet());
    expect(parsed?.dropped).toBe(0);
    expect(parsed?.set.blocks[0]).toMatchObject({ featureId: "vo2max", state: "locked" });
  });

  it("모르는 기능·행동 코드는 그 블록만 버린다", () => {
    const parsed = parseSufficiencySet(sufficiencySet([
      sufficiencyBlock(), sufficiencyBlock({ featureId: "future_feature" }),
      sufficiencyBlock({ featureId: "power_model", nextAction: { code: "future_action" as never } }),
    ]));
    expect(parsed?.set.blocks.map(block => block.featureId)).toEqual(["vo2max"]);
    expect(parsed?.dropped).toBe(2);
  });

  it("품질 조건에 수치가 실려 오면 그 블록을 버린다(내부 지표 비노출)", () => {
    const parsed = parseSufficiencySet(sufficiencySet([sufficiencyBlock({ requirements: [
      { requirementId: "curve_fit", kind: "quality", satisfaction: "not_met", guarantee: "unpredictable",
        current: { value: 0.91, unit: "point" } },
    ] })]));
    expect(parsed?.set.blocks).toEqual([]);
  });

  it("묶음 모양이 틀리면 null", () => {
    expect(parseSufficiencySet({ ...sufficiencySet(), schemaVersion: 2 })).toBeNull();
    expect(parseSufficiencySet({ ...sufficiencySet(), subjectKey: "raw-uid" })).toBeNull();
    expect(parseSufficiencySet(null)).toBeNull();
  });
});

describe("displayedSufficiencyState", () => {
  it("owner 가 적은 만료가 지났을 때만 지연으로 바꾼다", () => {
    const block = sufficiencyBlock();
    expect(displayedSufficiencyState(sufficiencySet([block]), block, Date.now())).toBe("locked");
    const set = sufficiencySet([block], { staleAfter: 1_000 });
    expect(displayedSufficiencyState(set, block, 999)).toBe("locked");
    expect(displayedSufficiencyState(set, block, 1_001)).toBe("delayed");
  });
});
