import { describe, expect, it } from "vitest";
import type { PowerCurvePeriodResult } from "@shared/types/power-curve-periods";
import { POWER_SKILLS_DURATIONS, powerSkillsDisplayValue, powerSkillsObservedCell } from "./powerSkillsObserved";
const period = (): PowerCurvePeriodResult => ({ fromInclusive: 0, toExclusive: 10000, status: "partial", points: [], coverage: { scannedActivityCount: 1, candidateActivityCount: 1, candidateCountKnown: false, includedActivityCount: 1, pendingActivityCount: 0, missingActivityCount: 0, incompleteActivityCount: 0, ineligibleActivityCount: 0, skippedActivityCount: 0, truncated: true, scanLimit: 1000 }, powerDurationObservations: { algorithmVersion: "power-duration-grid-v1", gridVersion: 1, timingBasis: "sample_owned_elapsed", scope: "observed_power_candidates", fromInclusive: 0, toExclusive: 10000, partial: true, scanTruncated: true, inputCandidateCount: 1, counts: { available: 1, missing: 0, pending: 0, incomplete: 0, malformed: 0, unavailable: 0 }, unavailableReasonCounts: { incomplete_input: 0, virtual_power: 0, unknown_provenance: 0, unaligned_elapsed_axis: 0, missing_power: 0, input_limit: 0 }, points: [30,60,120,300,600,1200,1800,3600].map(durationSeconds => ({ durationSeconds, maxAveragePowerW: 200, sourceActivityId: "ride", startTime: 1, parentRevision: "1:2", provenance: "direct_file", observedActivityCount: 1 })) } });
describe("powerSkillsObserved", () => {
  it("retains exactly12 durations and only8 measured exact points", () => {
    const data = period();
    expect(POWER_SKILLS_DURATIONS).toHaveLength(12);
    expect(POWER_SKILLS_DURATIONS.filter(seconds => powerSkillsObservedCell(data, seconds, "W").state === "observed")).toHaveLength(8);
    for (const seconds of [15,180,900,2700]) expect(powerSkillsObservedCell(data, seconds, "W")).toEqual({ state: "missing_exact_duration" });
  });
  it("never fills a duration from nearby or legacy points", () => {
    const data = period(); data.powerDurationObservations!.points[0]!.durationSeconds = 14;
    expect(powerSkillsObservedCell(data, 15, "W").state).toBe("missing_exact_duration");
    data.points = [{ durationSeconds: 15, watts: 900, sourceActivityId: "legacy", startTime: 1, source: "strava_api", cohortEligible: true, metricsRevision: "1:2" }];
    expect(powerSkillsObservedCell(data, 15, "W").state).toBe("missing_exact_duration");
    delete data.powerDurationObservations;
    expect(powerSkillsObservedCell(data, 15, "W").state).toBe("channel_unavailable");
  });
  it("does not turn missing weight into W/kg or reuse W winners", () => {
    expect(powerSkillsObservedCell(period(), 300, "W/kg").state).toBe("weight_unavailable");
    for (const seconds of [15,180,900,2700]) expect(powerSkillsObservedCell(period(), seconds, "W/kg").state).toBe("missing_exact_duration");
  });
  it("rejects unqualified channels without hiding real zero and small positives", () => {
    const data = period(); data.powerDurationObservations!.points[0]!.maxAveragePowerW = 0;
    expect(powerSkillsObservedCell(data, 30, "W")).toMatchObject({ state: "observed", value: 0 });
    data.powerDurationObservations!.timingBasis = "unverified" as "sample_owned_elapsed";
    expect(powerSkillsObservedCell(data, 30, "W").state).toBe("qualification_unverified");
    expect(powerSkillsDisplayValue(0.004, "W/kg")).toBe("<0.01");
    expect(powerSkillsDisplayValue(0, "W/kg")).toBe("0.00");
    expect(powerSkillsDisplayValue(100 / 3600, "W")).toBe("<0.1");
    expect(powerSkillsDisplayValue(0.099, "W")).toBe("<0.1");
    expect(powerSkillsDisplayValue(0.1, "W")).toBe("0.1");
    expect(powerSkillsDisplayValue(0, "W")).toBe("0.0");
    expect(powerSkillsDisplayValue(0.01, "W/kg")).toBe("0.01");
  });
  it("uses a normalized winner and its calculation-time weight independently", () => {
    const data = period(), original = data.powerDurationObservations!;
    data.weightNormalized = { unit: "W/kg", basis: "calculation_profile_snapshot", status: "partial", coverage: data.coverage,
      weightCounts: { includedActivityCount: 1, missingWeightActivityCount: 0, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 }, points: [],
      powerDurationObservations: { ...original, unit: "W/kg", basis: "calculation_profile_snapshot", weightCounts: { includedActivityCount: 1, missingWeightActivityCount: 0, invalidWeightActivityCount: 0, incompatibleWeightActivityCount: 0 },
        points: [{ ...original.points[3]!, sourceActivityId: "normalized-winner", maxAveragePowerW: 100, maxAveragePowerWPerKg: 2, weightKg: 50, weightRevision: "2:3" }] } };
    expect(powerSkillsObservedCell(data, 300, "W/kg")).toMatchObject({ state: "observed", value: 2, point: { sourceActivityId: "normalized-winner", weightKg: 50, weightRevision: "2:3" } });
    expect(powerSkillsObservedCell(data, 30, "W/kg").state).toBe("weight_unavailable");
  });
});
