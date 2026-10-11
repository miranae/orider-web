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
