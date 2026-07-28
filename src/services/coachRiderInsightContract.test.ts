import { describe, expect, it } from "vitest";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { parseCoachRiderInsight } from "./coachRiderInsightContract";

function envelope() { return structuredClone(parity.cardEnvelope) as any; }

describe("coach Rider Insight contract", () => {
  it.each(parity.typeFixtures)("preserves canonical PDC parity for $type", (profile) => {
    const value = envelope(); value.data.profile = profile;
    const parsed = parseCoachRiderInsight(value);
    expect(parsed.profile).toEqual(profile);
    expect(parsed.mmpWatts).toEqual(Object.fromEntries(Object.entries(parity.persistedPdc.mmpAll).map(([duration, entry]) => [duration, entry.value])));
    expect(parsed.sourceRevision).toBe(parity.cardEnvelope.data.sourceRevision);
    expect(Date.parse(parsed.asOf)).toBe(parity.persistedPdc.computedAt);
    expect(parsed.execution).toEqual({ providerCalls: 0, quotaConsumed: false, writes: 0 });
  });

  it.each(parity.gateFixtures)("suppresses definitive classification for $status", ({ status, reasonCodes }) => {
    const value = envelope(); value.data.status = status; value.data.reasonCodes = reasonCodes; value.data.profile = null;
    if (status === "missing_weight") { value.data.weightKgSnapshot = null; value.data.ability = null; }
    const parsed = parseCoachRiderInsight(value);
    expect(parsed.profile).toBeNull();
  });

  it("rejects privacy leaks, forged revisions, non-zero execution, and inconsistent duration facts", () => {
    for (const mutate of [
      (value: any) => { value.data.activityId = "raw-ride"; },
      (value: any) => { value.data.sourceRevision = "activity-history-r1"; },
      (value: any) => { value.data.execution.providerCalls = 1; },
      (value: any) => { value.data.mmpWatts["20m"] = 700; },
      (value: any) => { value.data.ability.byDuration[0].wPerKg = 29; },
      (value: any) => { value.data.asOf = "2026-07-27"; },
    ]) {
      const value = envelope(); mutate(value);
      expect(() => parseCoachRiderInsight(value)).toThrow("INVALID_COACH_RIDER_INSIGHT");
    }
    expect(JSON.stringify(parseCoachRiderInsight(envelope()))).not.toMatch(/activityId|\bdate\b|history|uid|users\//i);
  });

  it("rejects forged definitive status below the persisted weight and activity gates", () => {
    const missingWeight = envelope(); missingWeight.data.weightKgSnapshot = null; missingWeight.data.ability = null;
    expect(() => parseCoachRiderInsight(missingWeight)).toThrow("INVALID_COACH_RIDER_INSIGHT");
    const tooFewActivities = envelope(); tooFewActivities.data.activityCount = 4;
    expect(() => parseCoachRiderInsight(tooFewActivities)).toThrow("INVALID_COACH_RIDER_INSIGHT");
  });
});
