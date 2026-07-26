import { describe, expect, it } from "vitest";
import parity from "../coach/__fixtures__/rider-insight-parity.json";
import { parseCoachRiderInsight } from "../../services/coachRiderInsightContract";
import { parsePersistedPdc } from "../../services/pdcContract";
import { buildCanonicalRiderFitnessView, cyclingAbilityFromCanonicalRider } from "./riderInsightParity";

describe("persisted PDC → Fitness → Coach Rider Insight parity", () => {
  it("carries one revision/asOf/type/confidence/duration snapshot through the Fitness surface", () => {
    const pdc = parsePersistedPdc(parity.persistedPdc);
    const coach = parseCoachRiderInsight(parity.cardEnvelope);
    const fitness = buildCanonicalRiderFitnessView(pdc, coach);
    expect(fitness).not.toBeNull();
    expect(fitness).toMatchObject({ sourceRevision: coach.sourceRevision, asOf: coach.asOf,
      profile: { type: pdc.riderType?.type, confidence: pdc.riderType?.confidence }, mmpWatts: coach.mmpWatts });
    expect(fitness?.asOf).toBe(new Date(pdc.computedAt).toISOString());
    const surface = cyclingAbilityFromCanonicalRider(fitness);
    expect(surface).toMatchObject({ sourceRevision: coach.sourceRevision, asOf: coach.asOf, activityCount: pdc.activityCount });
    expect(surface?.axes.flatMap((axis) => axis.evidence.map((item) => [item.duration, item.watts, item.wPerKg, item.percentile])))
      .toEqual([
        ["5s", 1050, 15, 82], ["1m", 560, 8, 76], ["5m", 350, 5, 70], ["20m", 280, 4, 64],
      ]);
    expect(JSON.stringify(fitness)).not.toMatch(/private-ride|activityId|\bdate\b|history/i);
  });

  it.each([
    ["asOf", (value: any) => { value.data.asOf = "2026-07-27T02:00:01.000Z"; }],
    ["type", (value: any) => { value.data.profile.type = "Climber"; }],
    ["confidence", (value: any) => { value.data.profile.confidence = 0.9; }],
    ["duration", (value: any) => { value.data.mmpWatts["5m"] = 349; }],
  ] as Array<[string, (value: any) => void]>)("refuses a Fitness surface when Coach %s drifts", (_label, mutate) => {
    const pdc = parsePersistedPdc(parity.persistedPdc); const envelope = structuredClone(parity.cardEnvelope) as any;
    mutate(envelope); const coach = parseCoachRiderInsight(envelope);
    expect(buildCanonicalRiderFitnessView(pdc, coach)).toBeNull();
  });
});
