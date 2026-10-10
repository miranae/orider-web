import { describe, expect, it } from "vitest";
import { segmentHistoryContext, segmentHistoryPath } from "./segmentHistoryNavigation";
describe("explicit segment drilldown identity", () => {
  it("preserves native canonical identities and parses explicit context", () => { const path = segmentHistoryPath("native-segment", "orider_a_native-segment", "orider_a"); expect(path).toContain("/segment/native-segment?"); expect(segmentHistoryContext(new URLSearchParams(path.split("?")[1]))).toEqual({ activityId: "orider_a", effortId: "orider_a_native-segment" }); });
  it("maps proven Strava producer numeric IDs and preserves prefixed IDs", () => { expect(segmentHistoryPath(22, 11, "strava_7")).toBe("/segment/strava_22?currentActivityId=strava_7&currentEffortId=strava_11"); expect(segmentHistoryPath("strava_22", "strava_11", "strava_7")).toContain("currentEffortId=strava_11"); });
  it("does not invent a current effort for ambiguous numeric native IDs", () => { expect(segmentHistoryPath(22, 11, "orider_a")).toBe("/segment/strava_22"); expect(segmentHistoryContext(new URLSearchParams("currentActivityId=a"))).toBeNull(); expect(segmentHistoryPath("../unsafe", "e", "a")).toBe("/segment"); });
});
