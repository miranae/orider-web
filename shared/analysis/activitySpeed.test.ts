import { describe, expect, it } from "vitest";
import { averageActivitySpeedKph, observedMaxSpeedKph } from "./activitySpeed";
describe("whole-activity speed definitions", () => {
  it("uses the measured distance and moving seconds rather than a stream-sample average", () => {
    expect(averageActivitySpeedKph(36000, 3600)).toBe(36);
    expect(averageActivitySpeedKph(0, 60)).toBe(0);
    expect(averageActivitySpeedKph(36000, 0)).toBeNull();
    expect(averageActivitySpeedKph(NaN, 60)).toBeNull();
  });
  it("retains a valid short peak without averaging it down and skips invalid samples", () => {
    expect(observedMaxSpeedKph([10, 10, 20, 10, 10])).toBe(72);
    expect(observedMaxSpeedKph([null, NaN, Infinity, -1, 200, 15])).toBe(54);
    expect(observedMaxSpeedKph([null, 0, -1])).toBeNull();
  });
});
