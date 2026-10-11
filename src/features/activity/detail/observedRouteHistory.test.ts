import { describe, expect, it } from "vitest";
import { observedHistoryActivity } from "./observedRouteHistory.fixture";
import { observedRouteHistoryChoices, observedRouteHistorySummary, validObservedRouteHistorySelection, observedRouteHistoryTrend, observedRouteHistoryYear } from "./observedRouteHistory";
describe("loaded route-history representative choices", () => {
  const anchor = observedHistoryActivity("anchor");
  it("excludes owner/deleted/sport/samephysical/duplicate IDs and reuses representative priority", () => {
    const native = observedHistoryActivity("native", 1), imported = { ...native, id: "strava_1", source: "strava", localSessionId: "one" }; native.localSessionId = "one";
    const wrongOwner = { ...observedHistoryActivity("wrong", 2), userId: "other" }, deleted = { ...observedHistoryActivity("deleted", 3), deletedAt: 1 }, wrongSport = { ...observedHistoryActivity("run", 4), type: "Run" };
    const duplicate = observedHistoryActivity("dup", 5);
    expect(observedRouteHistoryChoices(anchor, [native, imported, anchor, wrongOwner, deleted, wrongSport, duplicate, duplicate]).map(a => a.id)).toEqual(["strava_1"]);
  });
  it("caps selected inputs at3, refuses duplicate representatives and retains chronology independent of list order", () => {
    const choices = [1, 2, 3, 4].map(i => observedHistoryActivity(`pick${i}`, i));
    expect(validObservedRouteHistorySelection(anchor, choices.slice(0, 3))).toBe(true);
    expect(validObservedRouteHistorySelection(anchor, choices)).toBe(false);
    expect(validObservedRouteHistorySelection(anchor, [])).toBe(false);
    expect(observedRouteHistoryChoices(anchor, [...choices].reverse()).map(a => a.id)).toEqual(choices.map(a => a.id));
  });
  it("rejects invalid activity dates and IDs without inventing a timestamp or date group", () => {
    expect(observedRouteHistoryChoices(anchor, [{ ...observedHistoryActivity("bad", 1), startTime: NaN }, { ...observedHistoryActivity("bad2", 2), startTime: -1 }, { ...observedHistoryActivity("bad/id", 3) }])).toEqual([]);
  });
  it("extracts Seoul years safely at the Date upper bound and UTC New Year boundary", () => {
    expect(observedRouteHistoryYear(8640000000000000)).toBe("275760");
    expect(observedRouteHistoryYear(Date.parse("2025-12-31T15:00:00Z"))).toBe("2026");
    expect(observedRouteHistoryYear(NaN)).toBeNull();
  });
  it("uses actual date gaps, null gaps, unit conversion and stable coincident timestamp positions", () => {
    const one = observedHistoryActivity("one", 1), ten = observedHistoryActivity("ten", 10);
    const trend = observedRouteHistoryTrend([ten, anchor, { ...one, summary: {} }], "distance", "metric");
    expect(trend.map(point => point.x)).toEqual([65, 97, 385]);
    expect(trend.map(point => point.value)).toEqual([12, null, 12]);
    expect(observedRouteHistoryTrend([anchor], "distance", "imperial")[0]!.value).toBeCloseTo(7.45645);
    expect(observedRouteHistoryTrend([{ ...anchor, id: "z" }, { ...anchor, id: "a" }], "movingTime", "metric").map(point => [point.activity.id, point.x])).toEqual([["a", 225], ["z", 225]]);
  });
  it("keeps summary pause separate from GPS clock and preserves unknown values", () => {
    expect(observedRouteHistorySummary(anchor)).toEqual({ distanceM: 12000, movingSec: 3300, pauseSec: 300 });
    expect(observedRouteHistorySummary({ ...anchor, summary: {} })).toEqual({ distanceM: null, movingSec: null, pauseSec: null });
    expect(observedRouteHistorySummary({ ...anchor, summary: { movingTimeSec: 4000, elapsedTimeMillis: 3600000 } }).pauseSec).toBeNull();
  });
});

it("uses canonical dimensions only: runsec/km→sec/mi, bikespeedkm/h→mph,0bike!=0runpace and nullgaps", async () => {
  const { observedRouteAverage, observedRouteAverageTrend }=await import("./observedRouteHistory");const { routeAverageResponse }=await import("../../../services/activityRouteEvidence.fixture");
  const bike=observedHistoryActivity("bike"),run={...bike,id:"run",type:"Run"};const average=(activity:typeof bike,speed:number|null)=>routeAverageResponse(activity.id,activity.startTime,activity.type==="Run"?"run":"bike",speed).canonicalAverage;
  expect(observedRouteAverage(average(run,12),run,"metric")).toEqual({value:300,formatted:"5:00/km"});expect(observedRouteAverage(average(run,12),run,"imperial").value).toBeCloseTo(482.8032);
  expect(observedRouteAverage(average(bike,16.09344),bike,"imperial")).toEqual({value:10,formatted:"10.0mph"});
  expect(observedRouteAverage(average(bike,0),bike,"metric")).toEqual({value:0,formatted:"0.0km/h"});expect(observedRouteAverage(average(run,0),run,"metric").value).toBeNull();expect(observedRouteAverage(average(bike,null),bike,"metric").value).toBeNull();
  const missing={...bike,id:"missing",startTime:bike.startTime+86400000},ten={...bike,id:"ten",startTime:bike.startTime+10*86400000};
  expect(observedRouteAverageTrend([{activity:ten,canonicalAverage:average(ten,20)},{activity:bike,canonicalAverage:average(bike,10)},{activity:missing}],"metric").map(p=>[p.x,p.value])).toEqual([[65,10],[97,null],[385,20]]);
});

it.each([["run",2.4e-305],["bike",1e308]] as const)("isolates nonfinite%s unit/formatter conversions as a point gap while preserving finite raw input", async (discipline,speed) => {
  const { observedRouteAverage }=await import("./observedRouteHistory"),{routeAverageResponse}=await import("../../../services/activityRouteEvidence.fixture");const activity={...observedHistoryActivity("extreme"),type:discipline==="run"?"Run":"Ride"};const average=routeAverageResponse(activity.id,activity.startTime,discipline,speed).canonicalAverage;
  expect(observedRouteAverage(average,activity,"imperial")).toEqual({value:null,formatted:"—"});expect(average?.state==="available"&&average.avgSpeedKph).toBe(speed);
});
