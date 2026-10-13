import { describe, expect, it } from "vitest";
import { getWorkoutDiscipline } from "./workoutDiscipline";

describe("goal-scoped legacy workout display", () => {
  it("uses the goal context only for recognized generic kinds", () => {
    expect(getWorkoutDiscipline("z2", "run")).toBe("run");
    expect(getWorkoutDiscipline("z2", "bike")).toBe("bike");
    expect(getWorkoutDiscipline("z2", "swim")).toBe("swim");
    expect(getWorkoutDiscipline("z2", "tri")).toBe("bike");
    expect(getWorkoutDiscipline("z2")).toBe("bike");
    expect(getWorkoutDiscipline("unknown", "run")).toBe("bike");
    expect(getWorkoutDiscipline("rest", "run")).toBe("rest");
  });
  it("retains explicit disciplines in a mixed plan", () => {
    expect(getWorkoutDiscipline("easyRun", "swim")).toBe("run");
    expect(getWorkoutDiscipline("easySwim", "run")).toBe("swim");
    expect(getWorkoutDiscipline("brickSwim", "run")).toBe("swim");
  });
});
