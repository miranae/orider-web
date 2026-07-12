import { describe, expect, it } from "vitest";
import { createEventSeriesId, joinDtLocal, joinStartTimeKst, shiftDtLocalByWeeks, splitDtLocal, splitStartTime } from "./eventFormUtils";

describe("eventFormUtils start time", () => {
  it("splits event startTime in KST, independent of browser local timezone", () => {
    const ms = Date.parse("2026-01-01T00:00:00.000Z");
    expect(splitStartTime(ms)).toEqual({ date: "2026-01-01", time: "09:00" });
  });

  it("round-trips KST event startTime without cumulative drift", () => {
    const original = Date.parse("2026-07-07T15:30:00.000Z");
    const first = splitStartTime(original);
    const saved = joinStartTimeKst(first.date, first.time);
    const second = splitStartTime(saved!);
    const savedAgain = joinStartTimeKst(second.date, second.time);

    expect(saved).toBe(original);
    expect(savedAgain).toBe(original);
  });

  it("stores registration windows with explicit KST offset", () => {
    const value = joinDtLocal("2026-07-11", "09:30");
    expect(value).toBe("2026-07-11T09:30:00+09:00");
    expect(splitDtLocal(value)).toEqual({ date: "2026-07-11", time: "09:30" });
  });
});

describe("shiftDtLocalByWeeks", () => {
  it("shifts a +09:00 datetime forward by N weeks, keeping the same weekday and time", () => {
    const value = joinDtLocal("2026-07-11", "09:30");
    expect(shiftDtLocalByWeeks(value, 1)).toBe("2026-07-18T09:30:00+09:00");
    expect(shiftDtLocalByWeeks(value, 3)).toBe("2026-08-01T09:30:00+09:00");
  });

  it("returns the input unchanged for empty or invalid values", () => {
    expect(shiftDtLocalByWeeks("", 2)).toBe("");
    expect(shiftDtLocalByWeeks("not-a-date", 2)).toBe("not-a-date");
  });
});

describe("createEventSeriesId", () => {
  it("creates a stable backend-safe opaque id from supplied attempt inputs", () => {
    const first = createEventSeriesId(1_750_000_000_000, 0.25);
    expect(first).toBe(createEventSeriesId(1_750_000_000_000, 0.25));
    expect(first).toMatch(/^web_[a-z0-9]+_[a-z0-9]+$/);
    expect(first.length).toBeLessThanOrEqual(100);
  });
});
