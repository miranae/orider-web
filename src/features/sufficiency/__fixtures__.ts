import type { SufficiencyBlock, SufficiencySet } from "@shared/types/sufficiency";

/** 서버 `buildPdcSufficiency` 가 내는 모양과 같은 테스트 픽스처. */
export function sufficiencyBlock(overrides: Partial<SufficiencyBlock> = {}): SufficiencyBlock {
  return {
    featureId: "vo2max", viewId: "current", discipline: "bike", state: "locked",
    requirements: [
      { requirementId: "weight", kind: "input", satisfaction: "not_met", guarantee: "sufficient" },
      { requirementId: "power_5min_or_cp", kind: "count", satisfaction: "met", guarantee: "minimum",
        target: { value: 1, unit: "point" }, current: { value: 1, unit: "point" } },
    ],
    remainingRequirementCount: 1,
    nextAction: { code: "input_weight" },
    source: { basis: "measured", assumedInputs: [] },
    ...overrides,
  };
}

export function sufficiencySet(blocks: SufficiencyBlock[] = [sufficiencyBlock()],
  overrides: Partial<SufficiencySet> = {}): SufficiencySet {
  return {
    schemaVersion: 1, catalogVersion: "pdc-sufficiency-v1", ownerOutput: "pdc_bike",
    subjectKey: "a".repeat(32), asOf: Date.parse("2026-10-15T00:00:00+09:00"),
    computedAt: Date.parse("2026-10-15T01:00:00+09:00"), staleAfter: null,
    digest: "b".repeat(64), blocks, ...overrides,
  };
}
