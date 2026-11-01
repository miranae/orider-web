import { describe, expect, it } from "vitest";
import { isFirstWorkout, seoulDate, startSport, validWorkoutDate } from "./firstWorkout";

describe("first workout boundaries", () => {
  it("uses the service day across the UTC day boundary", () => {
    expect(seoulDate(Date.parse("2026-10-28T15:01:00Z"))).toBe("2026-10-29");
  });
  it("rejects impossible, past and distant dates", () => {
    expect(validWorkoutDate("2026-02-30", "2026-02-01")).toBe(false);
    expect(validWorkoutDate("2026-10-27", "2026-10-28")).toBe(false);
    expect(validWorkoutDate("2026-11-28", "2026-10-28")).toBe(false);
    expect(validWorkoutDate("2026-11-27", "2026-10-28")).toBe(true);
    expect(validWorkoutDate("2026-10-28", "2026-10-28")).toBe(true);
  });
  it("does not silently treat unsupported sports as cycling", () => {
    expect(startSport("swim")).toBeNull();
    expect(startSport(null)).toBeNull();
    expect(startSport("run")).toBe("run");
  });
  it("rejects mismatched template, sport and completion claims", () => {
    const workout = { id: "one", sport: "bike", date: "2026-10-28", revision: 1, template: "bike-first-local-v1", status: "scheduled" };
    expect(isFirstWorkout(workout)).toBe(true);
    expect(isFirstWorkout({ ...workout, sport: "run" })).toBe(false);
    expect(isFirstWorkout({ ...workout, status: "completed" })).toBe(false);
    expect(isFirstWorkout({ ...workout, revision: 0 })).toBe(false);
  });
});
