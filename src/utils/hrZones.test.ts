import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveHrZones, isValidHrThresholdRelationship, resolveActivityHrZones } from "./hrZones";

describe("deriveHrZones", () => {
  it("uses Friel LTHR boundaries and rounds bpm consistently", () => {
    const result = deriveHrZones({ maxHr: 190, lthr: 173 });
    expect(result.source).toBe("lthr");
    expect(result.referenceBpm).toBe(173);
    expect(result.zones.map(({ minPct, maxPct, minBpm, maxBpmExclusive }) => ({ minPct, maxPct, minBpm, maxBpmExclusive }))).toEqual([
      { minPct: 0, maxPct: 85, minBpm: 0, maxBpmExclusive: 148 },
      { minPct: 85, maxPct: 90, minBpm: 148, maxBpmExclusive: 156 },
      { minPct: 90, maxPct: 95, minBpm: 156, maxBpmExclusive: 165 },
      { minPct: 95, maxPct: 100, minBpm: 165, maxBpmExclusive: 173 },
      { minPct: 100, maxPct: null, minBpm: 173, maxBpmExclusive: null },
    ]);
  });

  it("uses Friel cycling %LTHR boundaries when sport is bike (#365)", () => {
    const result = deriveHrZones({ maxHr: 190, lthr: 173, sport: "bike" });
    expect(result.source).toBe("lthr");
    expect(result.zones.map(({ minPct, maxPct }) => ({ minPct, maxPct }))).toEqual([
      { minPct: 0, maxPct: 81 },
      { minPct: 81, maxPct: 90 },
      { minPct: 90, maxPct: 94 },
      { minPct: 94, maxPct: 100 },
      { minPct: 100, maxPct: null },
    ]);
  });

  it("defaults to running bounds when sport is unspecified (back-compat)", () => {
    const withSport = deriveHrZones({ maxHr: 190, lthr: 173, sport: "run" });
    const withoutSport = deriveHrZones({ maxHr: 190, lthr: 173 });
    expect(withoutSport).toEqual(withSport);
  });

  it("has contiguous, non-overlapping integer BPM boundaries", () => {
    const zones = deriveHrZones({ maxHr: 191, lthr: 173 }).zones;
    for (let i = 0; i < zones.length - 1; i++) {
      expect(zones[i]!.maxBpmExclusive).toBe(zones[i + 1]!.minBpm);
    }
  });

  it.each([[190, 190], [180, 181], [180, 180]])("rejects LTHR >= max HR (%s, %s)", (maxHr, lthr) => {
    expect(isValidHrThresholdRelationship(maxHr, lthr)).toBe(false);
  });

  it("leaves missing values to individual field validation", () => {
    expect(isValidHrThresholdRelationship(null, 170)).toBe(true);
    expect(isValidHrThresholdRelationship(190, null)).toBe(true);
  });

  it.each([undefined, null, Number.NaN, 49, 251, 190])("falls back to max-HR zones for invalid LTHR: %s", (lthr) => {
    const result = deriveHrZones({ maxHr: 190, lthr });
    expect(result.source).toBe("max_hr");
    expect(result.referenceBpm).toBe(190);
    expect(result.zones.map((zone) => zone.maxPct)).toEqual([60, 70, 80, 90, 100]);
  });

  it("uses the existing default when max HR is invalid", () => {
    expect(deriveHrZones({ maxHr: undefined }).referenceBpm).toBe(184);
  });

  it("keeps max HR inside Z5 and uses the existing theme colors", () => {
    const zones = deriveHrZones({ maxHr: 190 }).zones;
    expect(zones[4]).toMatchObject({ minBpm: 171, maxBpmExclusive: 191, label: "vo2", color: "var(--zone-5)" });
    expect(zones.map((zone) => zone.color)).toEqual([
      "var(--zone-1)", "var(--zone-2)", "var(--zone-3)", "var(--zone-4)", "var(--zone-5)",
    ]);
  });

  it.each(["ko", "en"])("defines explicit LTHR and max-HR source labels for %s", (locale) => {
    const resource = JSON.parse(readFileSync(join(process.cwd(), `src/i18n/resources/${locale}/settings.json`), "utf8")) as {
      training: { hrZonesSource: Record<string, string>; hrZonesNote: Record<string, string> };
    };
    expect(resource.training.hrZonesSource.lthr).toContain("LTHR");
    expect(resource.training.hrZonesSource.max_hr).toBeTruthy();
    expect(resource.training.hrZonesNote.lthr).toBeTruthy();
    expect(resource.training.hrZonesNote.max_hr).toBeTruthy();
  });
});

describe("resolveActivityHrZones", () => {
  const values = { profileMaxHr: 195, profileLthr: 172, activityContextMaxHr: 190, activityContextLthr: 168, streamMaxHr: 188, summaryPeakHr: 181 };

  it.each([
    ["run", "lthr", "profile_lthr"],
    // #365: ride(bike) 도 Friel 사이클 LTHR 존 적용 — bike 는 앱 주 종목이라 run 과 동등하게 취급.
    ["ride", "lthr", "profile_lthr"],
    ["swim", "max_hr", "profile_max_hr"],
  ] as const)("resolves owner %s zones", (sport, zoneSource, source) => {
    const result = resolveActivityHrZones({ ...values, isOwner: true, sport });
    expect(result.zones.source).toBe(zoneSource);
    expect(result.source).toBe(source);
  });

  it("uses Friel cycling %LTHR bounds (distinct from running bounds) for ride zones", () => {
    const result = resolveActivityHrZones({ isOwner: true, sport: "ride", profileMaxHr: 190, profileLthr: 165 });
    expect(result.zones.source).toBe("lthr");
    expect(result.zones.referenceBpm).toBe(165);
    // Friel bike bounds [0,81,90,94,100,null] vs run bounds [0,85,90,95,100,null] — Z1/Z4 differ.
    expect(result.zones.zones.map((z) => z.maxPct)).toEqual([81, 90, 94, 100, null]);
  });

  it.each(["run", "ride", "swim"] as const)("excludes viewer profile from public %s zones", (sport) => {
    const result = resolveActivityHrZones({ ...values, isOwner: false, sport });
    expect(result).toMatchObject({ maxHr: 188, source: "stream_max_hr" });
    expect(result.zones.source).toBe("max_hr");
  });

  it("uses owner activity context before stream fallback", () => {
    expect(resolveActivityHrZones({ isOwner: true, sport: "ride", activityContextMaxHr: 190, streamMaxHr: 188 }))
      .toMatchObject({ maxHr: 190, source: "activity_context_max_hr" });
  });

  it("falls back to a valid context LTHR when the profile relationship is invalid", () => {
    const result = resolveActivityHrZones({
      isOwner: true,
      sport: "run",
      profileMaxHr: 190,
      profileLthr: 195,
      activityContextLthr: 170,
    });
    expect(result).toMatchObject({ source: "activity_context_lthr", maxHrSource: "profile_max_hr" });
    expect(result.zones).toMatchObject({ source: "lthr", referenceBpm: 170 });
  });

  it("keeps max-HR provenance separate when LTHR uses the default max HR", () => {
    const result = resolveActivityHrZones({ isOwner: true, sport: "run", profileLthr: 170 });
    expect(result).toMatchObject({ source: "profile_lthr", maxHrSource: "default", maxHr: 190 });
  });

  it("accepts a legacy activity metrics document without a context snapshot", () => {
    expect(() => resolveActivityHrZones({
      isOwner: true,
      sport: "run",
      activityContextMaxHr: undefined,
      activityContextLthr: undefined,
      streamMaxHr: 188,
    })).not.toThrow();
  });

  it("uses public activity peak then default without viewer profile", () => {
    expect(resolveActivityHrZones({ isOwner: false, sport: "run", profileMaxHr: 200, profileLthr: 175, summaryPeakHr: 182 }).source).toBe("summary_peak_hr");
    const fallback = resolveActivityHrZones({ isOwner: false, sport: "run", profileMaxHr: 200, profileLthr: 175 });
    expect(fallback).toMatchObject({ maxHr: 190, source: "default" });
    expect(fallback.zones.source).toBe("max_hr");
  });
});
