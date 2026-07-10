import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("TodaysWorkoutCard loading guard", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/training/TodaysWorkoutCard.tsx"),
    "utf8",
  );

  it("only shows the skeleton before the first completed fetch", () => {
    expect(source).toContain("hasCompletedInitialFetchRef");
    expect(source).toContain("const showSkeleton = !hasCompletedInitialFetchRef.current");
    expect(source).toContain("if (showSkeleton) setLoading(true)");
  });

  it("bounds getTodaysWorkout calls so loading cannot stay true forever", () => {
    expect(source).toContain("TODAYS_WORKOUT_FETCH_TIMEOUT_MS");
    expect(source).toContain("withTimeout(fn({}), TODAYS_WORKOUT_FETCH_TIMEOUT_MS)");
  });
});
