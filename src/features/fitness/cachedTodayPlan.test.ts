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
import { invalidatePlanSnapshot, planSnapshotKey, writePlanSnapshot } from "../../embedded/planSnapshotCache";
import { clearTrainingSurfaceCache, prepareTrainingSurfaceCacheOwner } from "../../embedded/trainingSurfaceCache";
import { readCachedTodayPlan, todayPlanLabel } from "./cachedTodayPlan";

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
  it("ignores a snapshot that is no longer fresh or was invalidated", () => {
    scoped.__ORIDER_TRAINING_CACHE_SCOPE__ = "a".repeat(64);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.parse("2026-11-22T03:00:00Z"));
      const key = planSnapshotKey("u1", "bike", "ko");
      prepareTrainingSurfaceCacheOwner("u1");
      writePlanSnapshot(key, { goal: { id: "g", userId: "u1" } as never, weeks: [{ id: "w", days: [day(0)] } as never] });
      expect(readCachedTodayPlan("u1", false, "bike", "ko", now)).not.toBeNull();
      invalidatePlanSnapshot(key);
      expect(readCachedTodayPlan("u1", false, "bike", "ko", now)).toBeNull();
      writePlanSnapshot(key, { goal: { id: "g", userId: "u1" } as never, weeks: [{ id: "w", days: [day(0)] } as never] });
      vi.setSystemTime(Date.parse("2026-11-22T03:04:00Z"));
      expect(readCachedTodayPlan("u1", false, "bike", "ko", now)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("todayPlanLabel", () => {
  const t = (key: string, options?: Record<string, unknown>) => key === "decision.duration" ? `${options?.value}분` : key === "workouts.z2" ? "Z2 지구력" : key;
  const known = (key: string) => key === "workouts.z2";
  it("labels known workouts and keeps imported names", () => {
    expect(todayPlanLabel({ workout: "z2", workoutName: null, durationMin: 75 }, t, known)).toBe("Z2 지구력 75분");
    expect(todayPlanLabel({ workout: "tempo", workoutName: "스윗스팟", durationMin: null }, t, known)).toBe("스윗스팟");
  });
  it("never shows a raw translation key for an unknown workout", () => {
    expect(todayPlanLabel({ workout: "mystery" as never, workoutName: null, durationMin: 60 }, t, known)).toBeNull();
  });
});
