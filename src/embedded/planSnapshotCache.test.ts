import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "@shared/types/goal";
const scope = "12345678-1234-1234-1234-123456789abc";
const now = Date.parse("2026-10-15T03:00:00Z");
const plan = { goal: { id: "goal", userId: "u1" } as Goal, weeks: [] };
async function modules() {
  return { cache: await import("./planSnapshotCache"), owner: await import("./trainingSurfaceCache") };
}
describe("planSnapshotCache", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = scope;
    vi.spyOn(Date, "now").mockReturnValue(now);
  });
  afterEach(() => { vi.restoreAllMocks(); delete window.__ORIDER_TRAINING_CACHE_SCOPE__; });
  it("일반웹에서는 기존 조회를 유지한다", async () => {
    delete window.__ORIDER_TRAINING_CACHE_SCOPE__;
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const key = cache.planSnapshotKey("u1", "bike", "ko");
    cache.writePlanSnapshot(key, plan);
    expect(cache.readPlanSnapshot(key)).toBeNull();
  });
  it("179999ms까지 fresh, 정확히 3분부터 stale, 24h부터 만료다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const key = cache.planSnapshotKey("u1", "bike", "ko");
    cache.writePlanSnapshot(key, plan);
    vi.mocked(Date.now).mockReturnValue(now + 179_999);
    expect(cache.readPlanSnapshot(key)?.fresh).toBe(true);
    vi.mocked(Date.now).mockReturnValue(now + 180_000);
    expect(cache.readPlanSnapshot(key)).toMatchObject({ fresh: false, data: plan });
    vi.mocked(Date.now).mockReturnValue(now + 24 * 60 * 60_000);
    expect(cache.readPlanSnapshot(key)).toBeNull();
  });
  it("재시작 후 host 승인 뒤에만 10분 넘은 last-good를 복원한다", async () => {
    const first = await modules();
    first.owner.prepareTrainingSurfaceCacheOwner("u1");
    const key = first.cache.planSnapshotKey("u1", "run", "ko");
    first.cache.writePlanSnapshot(key, plan);
    vi.mocked(Date.now).mockReturnValue(now + 11 * 60_000);
    vi.resetModules();
    const restarted = await modules();
    expect(restarted.cache.readPlanSnapshot(key)).toBeNull();
    restarted.owner.prepareTrainingSurfaceCacheOwner("u1");
    expect(restarted.cache.readPlanSnapshot(key)).toMatchObject({ fresh: false, data: plan });
  });
  it("자정과 기기 시간대 변경은 fresh를 무효화한다", async () => {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ ...resolved, timeZone: "UTC" });
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const key = cache.planSnapshotKey("u1", "bike", "ko");
    const midnight = Date.parse("2026-10-15T14:59:40Z");
    vi.mocked(Date.now).mockReturnValue(midnight);
    cache.writePlanSnapshot(key, plan);
    vi.mocked(Date.now).mockReturnValue(midnight + 21_000);
    expect(cache.readPlanSnapshot(key)?.fresh).toBe(false);
    vi.mocked(Date.now).mockReturnValue(now);
    cache.writePlanSnapshot(key, plan);
    vi.mocked(Intl.DateTimeFormat.prototype.resolvedOptions).mockReturnValue({ ...resolved, timeZone: "Asia/Seoul" });
    expect(cache.readPlanSnapshot(key)?.fresh).toBe(false);
  });
  it("프로그램 부재와 빈 계획도 유효한 성공 스냅샷으로 보관한다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const runKey = cache.run30SnapshotKey("u1");
    cache.writePlanSnapshot(runKey, null);
    expect(cache.readPlanSnapshot(runKey)).toMatchObject({ fresh: true, data: null });
    const planKey = cache.planSnapshotKey("u1", "run", "ko");
    cache.writePlanSnapshot(planKey, { goal: null, weeks: [] });
    expect(cache.readPlanSnapshot(planKey)?.data).toEqual({ goal: null, weeks: [] });
  });
  it("계정·scope·로그아웃·익명 사용자 사이에서 값을 격리한다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const key = cache.planSnapshotKey("u1", "bike", "ko");
    cache.writePlanSnapshot(key, plan);
    expect(cache.readPlanSnapshot(cache.planSnapshotKey("u2", "bike", "ko"))).toBeNull();
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "abcdefab-1234-1234-1234-123456789abc";
    expect(cache.readPlanSnapshot(key)).toBeNull();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    expect(cache.readPlanSnapshot(key)).toBeNull();
    cache.writePlanSnapshot(key, plan);
    owner.prepareTrainingSurfaceCacheOwner("u1", true);
    expect(cache.readPlanSnapshot(key)).toBeNull();
    expect(localStorage.length).toBe(0);
  });
  it("잘못된 owner, DTO, 미래 timestamp 및 인증정보를 거부한다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const key = cache.planSnapshotKey("u1", "bike", "ko");
    cache.writePlanSnapshot(key, { goal: { ...plan.goal, userId: "u2" }, weeks: [] });
    expect(cache.readPlanSnapshot(key)).toBeNull();
    cache.writePlanSnapshot(key, { goal: { ...plan.goal, accessToken: "private" } as Goal, weeks: [] });
    expect(cache.readPlanSnapshot(key)).toBeNull();
    owner.setTrainingSurfaceCache(key, { savedAt: now + 1, timezone: "UTC", data: plan });
    expect(cache.readPlanSnapshot(key)).toBeNull();
  });
  it("강제 갱신 실패에도 last-good timestamp와 24h 보존 한계를 유지한다", async () => {
    const first = await modules();
    first.owner.prepareTrainingSurfaceCacheOwner("u1");
    const key = first.cache.planSnapshotKey("u1", "bike", "ko");
    first.cache.writePlanSnapshot(key, plan);
    vi.mocked(Date.now).mockReturnValue(now + 60_000);
    first.cache.invalidatePlanSnapshot(key);
    expect(first.cache.readPlanSnapshot(key)).toMatchObject({ savedAt: now, fresh: false, data: plan });
    vi.resetModules();
    const restarted = await modules();
    restarted.owner.prepareTrainingSurfaceCacheOwner("u1");
    expect(restarted.cache.readPlanSnapshot(key)).toMatchObject({ savedAt: now, fresh: false, data: plan });
    vi.mocked(Date.now).mockReturnValue(now + 24 * 60 * 60_000);
    expect(restarted.cache.readPlanSnapshot(key)).toBeNull();
  });

  it("변조된 plan 필드와 null 주차/일자는 예외 없이 거부한다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const key = cache.planSnapshotKey("u1", "bike", "ko");
    for (const data of [{ weeks: [] }, { goal: undefined, weeks: [] }, { goal: plan.goal, weeks: [null] },
      { goal: plan.goal, weeks: [{ id: "w", days: [null] }] }]) {
      expect(() => cache.writePlanSnapshot(key, data as never)).not.toThrow();
      expect(cache.readPlanSnapshot(key)).toBeNull();
    }
  });

  it("변경 성공 시 해당 종목의 모든 언어 캐시만 무효화한다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    const bike = cache.planSnapshotKey("u1", "bike", "ko");
    const run = cache.planSnapshotKey("u1", "run", "en");
    cache.writePlanSnapshot(bike, plan);
    cache.writePlanSnapshot(run, plan);
    cache.writePlanSnapshot(cache.run30SnapshotKey("u1"), null);
    owner.removeTrainingSurfaceCacheForSport("u1", "run");
    expect(cache.readPlanSnapshot(run)?.fresh).toBe(false);
    expect(cache.readPlanSnapshot(cache.run30SnapshotKey("u1"))?.fresh).toBe(false);
    expect(cache.readPlanSnapshot(bike)).not.toBeNull();
  });
});
