import { describe, expect, it } from "vitest";
import { joinStartTimeKst, splitStartTime } from "./eventFormUtils";

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
});

