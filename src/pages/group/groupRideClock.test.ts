import { describe, expect, it } from "vitest";
import type { ActivityStreams } from "@shared/types";
import { groupRideClock, nearestClockSample } from "./groupRideClock";
const start = Date.UTC(2026, 9, 19, 23, 59);
const streams = (time: number[], distance = time.map((_, index) => index * 100)) => ({ time, distance } as ActivityStreams);
describe("group ride actual clock", () => {
  it("preserves different starts and nonzero first Strava offsets across midnight", () => {
    expect(groupRideClock({ source: "strava", startTime: start }, streams([20, 80]))).toEqual([start + 20_000, start + 80_000]);
    expect(groupRideClock({ source: "strava", startTime: start + 30_000 }, streams([0, 60]))).toEqual([start + 30_000, start + 90_000]);
  });
  it.each([1, 1000])("normalizes epoch coordinates without applying the activity start a second time (%s)", divisor => {
    expect(groupRideClock({ source: "orider", startTime: start }, streams([start / divisor, (start + 1000) / divisor]))).toEqual([start, start + 1000]);
  });
  it("rejects unknown relative units, mixed units, nonmonotonic/invalid coordinates, mismatched arrays and invalid starts", () => {
    expect(groupRideClock({ source: "orider", startTime: start }, streams([0, 1]))).toBeNull();
    for (const time of [[start, start / 1000], [2, 1], [0, NaN], [0, Infinity], [1, 1]]) {
      expect(groupRideClock({ source: "strava", startTime: start }, streams(time))).toBeNull();
    }
    expect(groupRideClock({ source: "strava", startTime: start }, streams([0, 1], [0]))).toBeNull();
    expect(groupRideClock({ source: "strava", startTime: NaN }, streams([0, 1]))).toBeNull();
  });
  it("uses nearby recorded samples and refuses long gaps or out-of-range time", () => {
    const axis = [0, 1000, 2000, 600_000, 601_000];
    expect(nearestClockSample(axis, 1300)).toBe(1);
    expect(nearestClockSample(axis, 300_000)).toBe(-1);
    expect(nearestClockSample(axis, -1)).toBe(-1);
    expect(nearestClockSample(axis, 602_000)).toBe(-1);
    expect(nearestClockSample([0, 600_000], 300_000)).toBe(-1);
  });
});
