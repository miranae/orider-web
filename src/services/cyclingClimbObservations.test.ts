import { describe, expect, it } from "vitest";
import type { CyclingClimbObservations } from "@shared/types/training-analysis-periods";
import { periodFixture } from "./trainingAnalysisPeriods.fixture";
import { validCyclingClimbObservations } from "./cyclingClimbObservations";
function fixture(n = 1) {
  const period = periodFixture().periods[0]!;
  period.coverage.representativeActivityCount = n; period.coverage.includedActivityCount = n;
  period.activities = Array.from({ length: n }, (_, i) => ({ ...period.activities[0]!, activityId: `a${i}`, startTime: 2000 + i, distanceM: 20000 }));
  const value: CyclingClimbObservations = { version: 1, scope: "observed_representatives", climbQuality: "unknown", candidateActivityCount: n, supportedActivityCount: n, observedActivityCount: n, noObservedActivityCount: 0, unsupportedActivityCount: 0, unavailableActivityCount: 0, truncated: false, sources: period.activities.slice(0, 5).map((a, i) => ({ sourceActivityId: a.activityId, startTime: a.startTime, metricsRevision: "100:1", contributingActivityCount: 1, startKm: 1, endKm: 2, lengthKm: 1, elevationGainM: 100 - i, avgGrade: (100 - i) / 10, durationSec: null, vam: null, timingBasis: "stored_detector_time_unverified", wholeActivityElevationQuality: "reliable", sourceLayer: "unknown" })) };
  return { value, period };
}
describe("bounded stored cycling climb channel", () => {
  it.each([0, 100, 1999])("rejects a climb beyond known canonical activity distance %s m", distanceM => {
    const { value, period } = fixture(); period.activities[0]!.distanceM = distanceM;
    expect(validCyclingClimbObservations(value, period)).toBe(false);
  });
  it("does not infer a canonical bound from summary or unavailable distance", () => {
    const { value, period } = fixture(); period.activities[0]!.distanceM = 100; period.activities[0]!.sourceBasis.distanceM = "activity_summary";
    expect(validCyclingClimbObservations(value, period)).toBe(true);
    period.activities[0]!.distanceM = null; period.activities[0]!.sourceBasis.distanceM = "unavailable";
    expect(validCyclingClimbObservations(value, period)).toBe(true);
  });
  it("allows only operation roundoff at the canonical distance boundary", () => {
    const { value, period } = fixture(); const s = value.sources[0]!;
    period.activities[0]!.distanceM = 2000; s.endKm = 2 + Number.EPSILON * 2; s.lengthKm = s.endKm - s.startKm; s.avgGrade = s.elevationGainM / (s.lengthKm * 1000) * 100;
    expect(validCyclingClimbObservations(value, period)).toBe(true);
    s.endKm = 2 + 1e-9; s.lengthKm = s.endKm - s.startKm; s.avgGrade = s.elevationGainM / (s.lengthKm * 1000) * 100;
    expect(validCyclingClimbObservations(value, period)).toBe(false);
  });

  it.each([0, 1, 3, 5, 6, 200])("accepts %s observed activities with min(N,5) sources", n => { const { value, period } = fixture(n); expect(validCyclingClimbObservations(value, period)).toBe(true); });
  it.each(["candidate", "supported", "observed", "sourceCount", "duplicate", "date", "revision", "quality", "layer", "shape", "grade", "duration", "vam", "extra", "order", "hole", "prototype"])("rejects %s contradictions", kind => {
    const { value: v, period } = fixture(5), s = v.sources[0]!;
    switch (kind) {
      case "candidate": v.candidateActivityCount++; break;
      case "supported": v.supportedActivityCount--; break;
      case "observed": v.observedActivityCount--; break;
      case "sourceCount": v.sources.pop(); break;
      case "duplicate": v.sources[1]!.sourceActivityId = s.sourceActivityId; break;
      case "date": s.startTime++; break;
      case "revision": s.metricsRevision = " "; break;
      case "quality": Object.assign(v, { climbQuality: "reliable" }); break;
      case "layer": Object.assign(s, { sourceLayer: "gps" }); break;
      case "shape": s.lengthKm += 0.000001; break;
      case "grade": s.avgGrade += 0.000001; break;
      case "duration": s.durationSec = Infinity; break;
      case "vam": s.vam = 3600; break;
      case "extra": Object.assign(s, { verified: true }); break;
      case "order": v.sources.reverse(); break;
      case "hole": delete v.sources[1]; break;
      case "prototype": { const saved = v.sources[1]; delete v.sources[1]; const prototype = Object.create(Array.prototype); prototype[1] = saved; Object.setPrototypeOf(v.sources, prototype); break; }
    }
    expect(validCyclingClimbObservations(v, period)).toBe(false);
  });
  it("accepts detector roundoff at the actual kilometre operands but rejects a geographic tolerance", () => {
    const { value, period } = fixture(); const s = value.sources[0]!;
    period.activities[0]!.distanceM = 200000;
    s.startKm = 123.456; s.endKm = 123.457; s.lengthKm = 0.001; s.elevationGainM = 0.1; s.avgGrade = 10;
    expect(validCyclingClimbObservations(value, period)).toBe(true);
    s.lengthKm += 1e-9; expect(validCyclingClimbObservations(value, period)).toBe(false);
  });
  it("preserves nullable detector timing and validates stored rounded VAM without exposing it as verified", () => {
    const { value, period } = fixture(); value.sources[0]!.durationSec = 100; value.sources[0]!.vam = 3600;
    expect(validCyclingClimbObservations(value, period)).toBe(true);
    value.sources[0]!.vam = 3601; expect(validCyclingClimbObservations(value, period)).toBe(false);
  });
  it("accepts mixed missing coverage and rejects contradictory truncation", () => {
    const { value, period } = fixture(4); Object.assign(value, { supportedActivityCount: 2, observedActivityCount: 1, noObservedActivityCount: 1, unsupportedActivityCount: 1, unavailableActivityCount: 1 }); value.sources = value.sources.slice(0, 1);
    expect(validCyclingClimbObservations(value, period)).toBe(true);
    value.truncated = true; expect(validCyclingClimbObservations(value, period)).toBe(false);
    period.coverage.truncated = true; expect(validCyclingClimbObservations(value, period)).toBe(true);
  });
});
