import { afterEach, describe, expect, it } from "vitest";
import { planSnapshotKey, writePlanSnapshot } from "../../embedded/planSnapshotCache";
import { clearTrainingSurfaceCache } from "../../embedded/trainingSurfaceCache";
import { readCachedTodayPlan } from "./cachedTodayPlan";

const scoped = window as unknown as { __ORIDER_TRAINING_CACHE_SCOPE__?: string };
const now = Date.parse("2026-11-22T03:00:00Z");
const today = Date.parse("2026-11-22T00:00:00+09:00");
const day = (offset: number, extra: Record<string, unknown> = {}) => ({ date: today + offset * 86_400_000, dayOfWeek: 0, workout: "z2", plannedTSS: 60, plannedDurationMin: 75, completed: false, skipped: false, ...extra });

afterEach(() => { clearTrainingSurfaceCache(); delete scoped.__ORIDER_TRAINING_CACHE_SCOPE__; });

describe("readCachedTodayPlan", () => {
  it("reads today's prescription from the plan snapshot only", () => {
    scoped.__ORIDER_TRAINING_CACHE_SCOPE__ = "a".repeat(64);
    expect(readCachedTodayPlan("u1", false, "bike", "ko", now)).toBeNull();
    writePlanSnapshot(planSnapshotKey("u1", "bike", "ko"), { goal: { id: "g", userId: "u1" } as never, weeks: [{ id: "w", days: [day(-1), day(0, { workout: "tempo", workoutName: "스윗스팟" }), day(1)] } as never] });
    expect(readCachedTodayPlan("u1", false, "bike", "ko", now)).toEqual({ workout: "tempo", workoutName: "스윗스팟", durationMin: 75 });
    expect(readCachedTodayPlan("u1", false, "run", "ko", now)).toBeNull();
  });
  it("returns nothing outside the app cache scope or for anonymous users", () => {
    expect(readCachedTodayPlan("u1", false, "bike", "ko", now)).toBeNull();
    scoped.__ORIDER_TRAINING_CACHE_SCOPE__ = "a".repeat(64);
    expect(readCachedTodayPlan("u1", true, "bike", "ko", now)).toBeNull();
  });
});
