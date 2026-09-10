import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveHrZones, isValidHrThresholdRelationship } from "./hrZones";
import { deriveHrZoneBoundaries } from "@shared/training/hrZoneTable";

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

describe("정본 위임 (#2437)", () => {
  it("설정 미리보기 경계는 서버와 같은 shared 표에서 나온다", () => {
    const ui = deriveHrZones({ maxHr: 190, lthr: 170, sport: "bike" });
    const canonical = deriveHrZoneBoundaries({ maxHr: 190, lthr: 170, sport: "bike" });
    expect(ui.zones.map((z) => [z.minBpm, z.maxBpmExclusive])).toEqual(canonical.zones.map((z) => [z.minBpm, z.maxBpmExclusive]));
    expect(ui.source).toBe(canonical.reference);
  });
  it("자체 경계 표를 갖지 않는다", () => {
    const src = readFileSync(join(__dirname, "hrZones.ts"), "utf8");
    expect(src).not.toMatch(/BOUNDS\s*[:=]/);
    expect(src).toMatch(/@shared\/training\/hrZoneTable/);
  });
});
