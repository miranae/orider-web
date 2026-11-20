import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "@shared/types/goal";

const scope = "12345678-1234-1234-1234-123456789abc";
const plan = { goal: { id: "goal", userId: "u1" } as Goal, weeks: [] };

describe("notifyPlanGoalChanged", () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); window.__ORIDER_TRAINING_CACHE_SCOPE__ = scope; });
  afterEach(() => { delete window.__ORIDER_TRAINING_CACHE_SCOPE__; });

  // 목표를 만든 뒤 계획 화면이 3분 신선 캐시를 그대로 써서 앱을 다시 켤 때까지 이전 목표를 보여주던 결함.
  it("모든 종목·언어의 계획 캐시를 신선하지 않게 만들고 같은 사용자에게만 알린다", async () => {
    const cache = await import("./planSnapshotCache");
    const owner = await import("./trainingSurfaceCache");
    const { notifyPlanGoalChanged, PLAN_GOAL_CHANGED } = await import("./planGoalChanges");
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const keys = [cache.planSnapshotKey("u1", "bike", "ko"), cache.planSnapshotKey("u1", "bike", "en"), cache.planSnapshotKey("u1", "run", "ko")];
    for (const key of keys) cache.writePlanSnapshot(key, plan);
    owner.setTrainingSurfaceCache({ uid: "u1", surface: "plan", sport: "bike", locale: "ko" }, plan);
    expect(keys.map(key => cache.readPlanSnapshot(key)?.fresh)).toEqual([true, true, true]);
    const events: unknown[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener(PLAN_GOAL_CHANGED, listener);
    try { notifyPlanGoalChanged("u1", "bike", "ko"); } finally { window.removeEventListener(PLAN_GOAL_CHANGED, listener); }
    expect(keys.map(key => cache.readPlanSnapshot(key)?.fresh ?? false)).toEqual([false, false, false]);
    expect(owner.getTrainingSurfaceCache({ uid: "u1", surface: "plan", sport: "bike", locale: "ko" })).toBeNull();
    expect(events).toEqual([{ uid: "u1", sport: "bike" }]);
  });
});
