import { describe, expect, it } from "vitest";
import { periodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import { bikeObservedPeriodRecords, type BikeObservedActivity } from "./bikeObservedPeriodRecords";
const row = (activityId: string, value: number | null, startTime = 2000): BikeObservedActivity => ({ activityId, startTime, distanceM: value, movingTimeSec: 100, elevationGainM: value, sourceBasis: { distanceM: "canonical_metrics", movingTimeSec: "canonical_metrics", elevationGainM: "activity_summary" } });
const period = () => ({ ...periodFixture().periods[0]!, fromInclusive: 1000, toExclusive: 10000, activities: [] as BikeObservedActivity[] });
describe("queried cycling summary records", () => {
  it("sorts descending values, newest ties then fixed IDs, leaves inputs unchanged and caps five", () => {
    const data = period(); data.activities = [row("z", 10), row("a", 10), row("new", 10, 3000), ...Array.from({ length: 4 }, (_, i) => row(`long${i}`, 20 + i))];
    const snapshot = structuredClone(data), result = bikeObservedPeriodRecords(data, "distanceM");
    expect(result.observedCount).toBe(7); expect(result.records.map(item => item.activityId)).toEqual(["long3", "long2", "long1", "long0", "new"]); expect(data).toEqual(snapshot);
    data.activities = [row("z", 10), row("a", 10), row("new", 10, 3000)];
    expect(bikeObservedPeriodRecords(data, "distanceM").records.map(item => item.activityId)).toEqual(["new", "a", "z"]);
  });
  it("excludes nonpositive, nonfinite, missing, unavailable, out-of-range and duplicate identities", () => {
    const data = period(); data.activities = [row("valid", 100), row("null", null), row("nan", NaN), row("infinity", Infinity), row("negative", -1), row("zero", 0), row("future", 1000, 10000), row("early", 1000, 999), row("duplicate", 100), row("duplicate", 200), { ...row("unknown", 100), sourceBasis: { distanceM: "unavailable", movingTimeSec: "unavailable", elevationGainM: "unavailable" } }];
    expect(bikeObservedPeriodRecords(data, "distanceM").records.map(item => item.activityId)).toEqual(["valid"]);
    expect(bikeObservedPeriodRecords(data, "elevationGainM").observedCount).toBe(1);
  });
  it("uses the selected metric-specific source and never turns missing elevation into zero", () => {
    const data = period(); data.activities = [row("one", 100), { ...row("two", 200), elevationGainM: null }];
    expect(bikeObservedPeriodRecords(data, "distanceM", "activity_summary").observedCount).toBe(0);
    expect(bikeObservedPeriodRecords(data, "elevationGainM", "activity_summary").records.map(item => item.activityId)).toEqual(["one"]);
    data.status = "partial"; data.coverage.truncated = true;
    expect(bikeObservedPeriodRecords(data, "distanceM").observedCount).toBe(2);
  });
});
