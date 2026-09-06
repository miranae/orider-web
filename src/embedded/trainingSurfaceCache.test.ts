import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTrainingSurfaceCache,
  getTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
  setTrainingSurfaceCache,
  trainingSurfaceCacheTestApi,
} from "./trainingSurfaceCache";

const key = {
  uid: "owner-1",
  surface: "plan" as const,
  sport: "bike",
  locale: "ko",
};

describe("trainingSurfaceCache", () => {
  beforeEach(() => {
    clearTrainingSurfaceCache();
    vi.useRealTimers();
  });

  it("isolates UID, sport, and locale and clears synchronously on owner change", () => {
    prepareTrainingSurfaceCacheOwner("owner-1");
    setTrainingSurfaceCache(key, { weeks: [{ id: "week-1" }] });

    expect(getTrainingSurfaceCache(key)).toEqual({ weeks: [{ id: "week-1" }] });
    expect(getTrainingSurfaceCache({ ...key, sport: "run" })).toBeNull();
    expect(getTrainingSurfaceCache({ ...key, locale: "en" })).toBeNull();

    prepareTrainingSurfaceCacheOwner("owner-2");
    expect(trainingSurfaceCacheTestApi.size()).toBe(0);
    expect(getTrainingSurfaceCache(key)).toBeNull();
  });

  it("isolates fitness activity snapshots by query range", () => {
    prepareTrainingSurfaceCacheOwner("owner-1");
    const fitnessKey = { ...key, surface: "fitness" as const, range: 30 };
    setTrainingSurfaceCache(fitnessKey, { activities: [{ id: "recent" }] });

    expect(getTrainingSurfaceCache(fitnessKey)).toEqual({ activities: [{ id: "recent" }] });
    expect(getTrainingSurfaceCache({ ...fitnessKey, range: 90 })).toBeNull();
  });

  it("stores detached DTO copies and expires them by TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T00:00:00Z"));
    prepareTrainingSurfaceCacheOwner("owner-1");
    const value = { weeks: [{ id: "week-1" }] };
    setTrainingSurfaceCache(key, value);
    value.weeks[0]!.id = "mutated";

    expect(getTrainingSurfaceCache<typeof value>(key)?.weeks[0]?.id).toBe("week-1");
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(getTrainingSurfaceCache(key)).toBeNull();
  });

  it("keeps the cache bounded and disables it for anonymous users", () => {
    prepareTrainingSurfaceCacheOwner("owner-1");
    for (let index = 0; index < 13; index += 1) {
      setTrainingSurfaceCache({ ...key, sport: `sport-${index}` }, { index });
    }
    expect(trainingSurfaceCacheTestApi.size()).toBe(12);

    expect(prepareTrainingSurfaceCacheOwner("owner-1", true)).toBe(false);
    expect(trainingSurfaceCacheTestApi.size()).toBe(0);
  });
});
