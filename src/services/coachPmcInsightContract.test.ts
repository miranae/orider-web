import { describe, expect, it } from "vitest";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import parity from "../features/coach/__fixtures__/pmc-fitness-parity.json";
import { parseCoachPmcInsight } from "./coachPmcInsightContract";

const fitness = {
  ...parity.fitness,
  discipline: parity.fitness.discipline as FitnessTimeseriesDoc["discipline"],
} satisfies FitnessTimeseriesDoc;

function fixture() {
  return structuredClone(parity.cardEnvelope) as { data: Record<string, any> };
}

describe("coach PMC insight contract", () => {
  it("parses the exact backend envelope and preserves canonical Fitness parity without recomputing PMC", () => {
    const parsed = parseCoachPmcInsight(fixture(), "bike");
    const sevenDaysAgo = fitness.points[0]!; const latest = fitness.points.at(-1)!;
    expect(fitness.pointCount).toBe(fitness.points.length);
    expect(sevenDaysAgo.date).toBe("2026-07-11");
    expect(latest.date).toBe("2026-07-18");
    expect(parsed.current).toEqual({ ctl: latest.ctl, atl: latest.atl, form: latest.tsb });
    expect(parsed.delta7d).toEqual({ ctl: latest.ctl - sevenDaysAgo.ctl,
      atl: latest.atl - sevenDaysAgo.atl, form: latest.tsb - sevenDaysAgo.tsb });
    expect(parsed.asOf).toBe(new Date(fitness.computedAt).toISOString());
    expect(fitness).not.toHaveProperty("sourceRevision");
    expect(parsed.sourceRevision).toBe("pmcr_bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(parsed.exampleQuestionCodes).toEqual(["pmc_recent_load_change", "pmc_current_form_intensity"]);
    expect(parsed.execution).toEqual({ providerCalls: 0, quotaConsumed: false, writes: 0 });
  });

  it.each([
    ["partial", "fresh", "incomplete", "insufficient_history"],
    ["stale", "stale", "incomplete", "refresh_required"],
    ["missing", "missing", "unavailable", "data_unavailable"],
  ] as const)("accepts the exact safe %s cross-invariant", (status, freshness, quality, interpretation) => {
    const value = fixture(); value.data.status = status; value.data.freshness.status = freshness;
    value.data.sourceQuality.level = quality; value.data.classification = null;
    value.data.interpretationCode = interpretation;
    expect(parseCoachPmcInsight(value).status).toBe(status);
  });

  it("rejects extra keys, invalid nested values, status contradictions, discipline drift and unordered codes", () => {
    const mutations = [
      (value: ReturnType<typeof fixture>) => { (value as any).extra = true; },
      (value: ReturnType<typeof fixture>) => { value.data.extra = true; },
      (value: ReturnType<typeof fixture>) => { value.data.current.extra = 1; },
      (value: ReturnType<typeof fixture>) => { value.data.current.ctl = Number.NaN; },
      (value: ReturnType<typeof fixture>) => { value.data.asOf = "2026-7-18T03:00:00Z"; },
      (value: ReturnType<typeof fixture>) => { value.data.status = "stale"; },
      (value: ReturnType<typeof fixture>) => { value.data.sourceQuality.level = "estimated"; },
      (value: ReturnType<typeof fixture>) => { value.data.exampleQuestionCodes.reverse(); },
    ];
    for (const mutate of mutations) {
      const value = fixture(); mutate(value);
      expect(() => parseCoachPmcInsight(value, "bike")).toThrow("INVALID_COACH_PMC_INSIGHT");
    }
    expect(() => parseCoachPmcInsight(fixture(), "run")).toThrow("INVALID_COACH_PMC_INSIGHT");
  });

  it("applies the backend 2,000-byte cap to data rather than wrapper overhead", () => {
    const value = fixture();
    while (new TextEncoder().encode(JSON.stringify(value.data)).byteLength < 1_950) {
      value.data.sourceQuality.reasonCodes.push(`reason_${value.data.sourceQuality.reasonCodes.length}_${"x".repeat(40)}`);
    }
    expect(new TextEncoder().encode(JSON.stringify(value.data)).byteLength).toBeLessThanOrEqual(2_000);
    expect(new TextEncoder().encode(JSON.stringify(value)).byteLength).toBeGreaterThan(2_000);
    expect(parseCoachPmcInsight(value).status).toBe("ok");

    value.data.sourceQuality.reasonCodes.push("y".repeat(64));
    expect(new TextEncoder().encode(JSON.stringify(value.data)).byteLength).toBeGreaterThan(2_000);
    expect(() => parseCoachPmcInsight(value)).toThrow("INVALID_COACH_PMC_INSIGHT");
  });
});
