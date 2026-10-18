import { describe, expect, it } from "vitest";
import { kstLocalDate, parseTodayWorkoutChoice, todayChoiceOrNull } from "./todayWorkoutChoiceContract";

const AFTER_KST_MIDNIGHT = Date.UTC(2026, 9, 17, 15, 30); // 2026-10-18 00:30 KST
const valid = { schemaVersion: "today-choice-v1", discipline: "bike", localDate: "2026-10-18", workoutType: "endurance", targetTss: 45, chosenAt: 1 };

describe("today workout choice contract", () => {
  it("uses the Asia/Seoul calendar day", () => {
    expect(kstLocalDate(AFTER_KST_MIDNIGHT)).toBe("2026-10-18");
    expect(kstLocalDate(AFTER_KST_MIDNIGHT - 60 * 60 * 1000)).toBe("2026-10-17");
  });

  it("parses only well-formed choices for the requested sport", () => {
    expect(parseTodayWorkoutChoice(valid, "bike")).toMatchObject({ workoutType: "endurance", targetTss: 45 });
    expect(parseTodayWorkoutChoice(valid, "run")).toBeNull();
    expect(parseTodayWorkoutChoice({ ...valid, workoutType: "threshold" }, "bike")).toBeNull();
    expect(parseTodayWorkoutChoice({ ...valid, schemaVersion: "v0" }, "bike")).toBeNull();
    expect(parseTodayWorkoutChoice(null, "bike")).toBeNull();
  });

  it("drops a choice made on another day", () => {
    const choice = parseTodayWorkoutChoice(valid, "bike");
    expect(todayChoiceOrNull(choice, AFTER_KST_MIDNIGHT)).toEqual(choice);
    expect(todayChoiceOrNull(choice, AFTER_KST_MIDNIGHT + 24 * 60 * 60 * 1000)).toBeNull();
  });
});
