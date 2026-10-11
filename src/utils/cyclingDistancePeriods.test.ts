import { describe, expect, it } from "vitest";
import { validCyclingDistanceAnalysis, compareCyclingSources } from "./cyclingDistancePeriods";
import { cyclingDistancePeriodFixture } from "./cyclingDistancePeriods.fixture";
describe("stored cycling13 period evidence", () => {
  it("accepts fixed13 SI distances and independent missing/no-observed states", () => {
    const p = cyclingDistancePeriodFixture().periods[0]!; expect(validCyclingDistanceAnalysis(p.cyclingDistanceObservations, p)).toBe(true);
    const a = p.cyclingDistanceObservations!; expect(a.distances[7]!.distanceM).toBe(80000); expect(a.distances[8]!.distanceM).toBe(80467.2);
    for (const d of a.distances) { d.supportedActivityCount = 0; d.unsupportedActivityCount = 1; d.observedEffortActivityCount = 0; d.noObservedEffortActivityCount = 0; d.sources = []; d.bestTimeSeconds = d.medianTimeSeconds = null; }
    expect(validCyclingDistanceAnalysis(a,p)).toBe(true);
  });
  it.each(["hole", "inherited", "source-hole", "null", "duplicate", "meters", "order", "N", "supported", "candidate", "truncated", "revision", "foreign", "date", "seconds", "best", "median", "quality", "version", "sourceN"])("rejects%s", fault => {
    const p = cyclingDistancePeriodFixture().periods[0]!, a = p.cyclingDistanceObservations!, d = a.distances[1]!, source = d.sources[0]!;
    if (fault === "hole") delete a.distances[12];
    if (fault === "inherited") { const value = a.distances[12]; delete a.distances[12]; Object.setPrototypeOf(a.distances,Object.assign(Object.create(Array.prototype), { 12: value })); }
    if (fault === "source-hole") delete d.sources[0];
    if (fault === "null") d.sources[0] = null as unknown as typeof source;
    if (fault === "duplicate") a.distances[12] = d;
    if (fault === "meters") a.distances[8]!.distanceM = 80000;
    if (fault === "order") [a.distances[0], a.distances[1]] = [a.distances[1]!, a.distances[0]!];
    if (fault === "N") d.observedEffortActivityCount = 2;
    if (fault === "supported") d.supportedActivityCount = 0;
    if (fault === "candidate") d.candidateActivityCount = 2;
    if (fault === "truncated") d.truncated = true;
    if (fault === "revision") source.metricsRevision = "opaque";
    if (fault === "foreign") source.sourceActivityId = "other";
    if (fault === "date") source.startTime = 10000;
    if (fault === "seconds") source.elapsedSec = NaN;
    if (fault === "best") d.bestTimeSeconds = Infinity;
    if (fault === "median") d.medianTimeSeconds = 1000.5;
    if (fault === "quality") a.quality = "good" as "unknown";
    if (fault === "version") a.targetsVersion = 2 as 1;
    if (fault === "sourceN") source.contributingActivityCount = 2;
    expect(validCyclingDistanceAnalysis(a,p)).toBe(false);
  });
  it("preserves half-second medians and stable elapsed/date/id sorting", () => {
    const p = cyclingDistancePeriodFixture().periods[0]!, a=p.cyclingDistanceObservations!;
    p.activities.push({...p.activities[0]!,activityId:"b",startTime:3000});p.coverage.representativeActivityCount=2;p.coverage.includedActivityCount=2;
    for (const d of a.distances) {d.candidateActivityCount=d.supportedActivityCount=2;d.noObservedEffortActivityCount=2-d.observedEffortActivityCount;}
    const d=a.distances[1]!;d.sources.push({...d.sources[0]!,sourceActivityId:"b",startTime:3000,elapsedSec:1001});d.observedEffortActivityCount=2;d.noObservedEffortActivityCount=0;d.medianTimeSeconds=1000.5;
    expect(validCyclingDistanceAnalysis(a,p)).toBe(true);
    const first=d.sources[0]!, second={...d.sources[1]!,elapsedSec:1000};expect(compareCyclingSources(first,second)).toBeGreaterThan(0);
    expect(compareCyclingSources({...first,sourceActivityId:"a"},{...first,sourceActivityId:"b"})).toBeLessThan(0);
  });
});

it.each(["pendingActivityCount", "missingActivityCount", "incompleteActivityCount"] as const)("rejects supported or unsupported claims when the representative is%s", state => {
  for (const claim of ["supported", "unsupported"] as const) {
    const p = cyclingDistancePeriodFixture().periods[0]!, a=p.cyclingDistanceObservations!;
    p.coverage.includedActivityCount=0;p.coverage[state]=1;
    if(claim === "unsupported") for(const d of a.distances){d.supportedActivityCount=d.observedEffortActivityCount=d.noObservedEffortActivityCount=0;d.unsupportedActivityCount=1;d.sources=[];d.bestTimeSeconds=d.medianTimeSeconds=null;}
    expect(validCyclingDistanceAnalysis(a,p)).toBe(false);
  }
});
