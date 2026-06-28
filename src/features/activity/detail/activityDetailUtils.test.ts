import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatPace,
  formatSwimPace,
  formatTime,
  getSportCategory,
  isStreamNotCachedError,
} from "./activityDetailUtils";

describe("activityDetailUtils", () => {
  it("classifies sport categories", () => {
    expect(getSportCategory("Ride")).toBe("ride");
    expect(getSportCategory("TrailRun")).toBe("run");
    expect(getSportCategory("Swim")).toBe("swim");
    expect(getSportCategory("Yoga")).toBe("other");
  });

  it("formats duration, elapsed time, and pace", () => {
    expect(formatDuration(3_900_000)).toBe("1h 5m");
    expect(formatDuration(65_000)).toBe("1m 5s");
    expect(formatTime(185_000)).toBe("3:05");
    expect(formatPace(12)).toBe("5'00\"");
    expect(formatSwimPace(3)).toBe("2'00\"");
  });

  it("detects stream-not-cached errors without masking generic not-found errors", () => {
    expect(isStreamNotCachedError({ code: "functions/not-found" })).toBe(true);
    expect(isStreamNotCachedError(new Error("Stream data not yet available"))).toBe(true);
    expect(isStreamNotCachedError(new Error("Activity not found"))).toBe(false);
  });
});
