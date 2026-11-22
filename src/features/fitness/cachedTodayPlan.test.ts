import { afterEach, describe, expect, it, vi } from "vitest";

const failRead = vi.hoisted(() => ({ on: false }));
const logClientError = vi.hoisted(() => vi.fn());
vi.mock("../../services/errorLogger", () => ({ logClientError }));
vi.mock("../../embedded/planSnapshotCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../embedded/planSnapshotCache")>();
  return { ...actual, readPlanSnapshot: (...args: Parameters<typeof actual.readPlanSnapshot>) => {
    if (failRead.on) throw new Error("snapshot read failed");
    return actual.readPlanSnapshot(...args);
  } };
});
import { planSnapshotKey, writePlanSnapshot } from "../../embedded/planSnapshotCache";
import { clearTrainingSurfaceCache } from "../../embedded/trainingSurfaceCache";
import { readCachedTodayPlan } from "./cachedTodayPlan";

const scoped = window as unknown as { __ORIDER_TRAINING_CACHE_SCOPE__?: string };
const now = Date.parse("2026-11-22T03:00:00Z");
const today = Date.parse("2026-11-22T00:00:00+09:00");
const day = (offset: number, extra: Record<string, unknown> = {}) => ({ date: today + offset * 86_400_000, dayOfWeek: 0, workout: "z2", plannedTSS: 60, plannedDurationMin: 75, completed: false, skipped: false, ...extra });

afterEach(() => { failRead.on = false; logClientError.mockReset(); clearTrainingSurfaceCache(); delete scoped.__ORIDER_TRAINING_CACHE_SCOPE__; });

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
  it("records a failed cache read and falls back to the plan link", () => {
    scoped.__ORIDER_TRAINING_CACHE_SCOPE__ = "a".repeat(64);
    failRead.on = true;
    expect(readCachedTodayPlan("u1", false, "bike", "ko", now)).toBeNull();
    expect(logClientError).toHaveBeenCalledWith("cachedTodayPlan.read", expect.any(Error), { sport: "bike" });
  });
});
