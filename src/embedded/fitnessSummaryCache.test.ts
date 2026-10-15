import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_SCHEMA_VERSION, type CanonicalEnvelope } from "@shared/types/canonical";

const scope = "12345678-1234-1234-1234-123456789abc";
const now = Date.parse("2026-10-15T14:59:40Z");
const envelope: CanonicalEnvelope<unknown> = {
  schemaVersion: CANONICAL_SCHEMA_VERSION, algorithmVersion: "v1", status: "canonical",
  computedAt: now, inputRevision: "1", inputDigest: null, period: null, error: null,
  data: {
    current: { totalCTL: 40, totalATL: 30, totalTSB: 10, timezone: "Asia/Seoul",
      breakdown: Object.fromEntries(["bike", "run", "swim"].map(sport => [sport, { ctl: 40, atl: 30, tsb: 10, weeklyTSS: 100 }])),
      totalsBasis: ["bike", "run", "swim"],
    },
    timeseries: { bike: null, run: null, swim: null },
  },
};

async function modules() {
  return { cache: await import("./fitnessSummaryCache"), owner: await import("./trainingSurfaceCache") };
}

describe("fitnessSummaryCache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(Date, "now").mockReturnValue(now);
    localStorage.clear();
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = scope;
  });
  afterEach(() => { vi.restoreAllMocks(); delete window.__ORIDER_TRAINING_CACHE_SCOPE__; });


  it("native scope가 없는 일반웹에서는 summary를 저장하거나 재사용하지 않는다", async () => {
    delete window.__ORIDER_TRAINING_CACHE_SCOPE__;
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    cache.writeFitnessSummaryCache("u1", envelope);
    expect(cache.readFitnessSummaryCache("u1")).toBeNull();
    expect(owner.trainingSurfaceCacheTestApi.size()).toBe(0);
  });

  it("10분이 지난 summary는 재시작 후 stale로 복원하고 활동 캐시는 만료한다", async () => {
    const first = await modules();
    first.owner.prepareTrainingSurfaceCacheOwner("u1");
    first.cache.writeFitnessSummaryCache("u1", envelope);
    const activityKey = { uid: "u1", surface: "fitness" as const, sport: "bike", locale: "ko" };
    first.owner.setTrainingSurfaceCache(activityKey, { activities: [] });
    vi.mocked(Date.now).mockReturnValue(now + 11 * 60_000);
    vi.resetModules();
    const restarted = await modules();
    restarted.owner.prepareTrainingSurfaceCacheOwner("u1");
    expect(restarted.cache.readFitnessSummaryCache("u1")).toMatchObject({ fresh: false, envelope });
    expect(restarted.owner.getTrainingSurfaceCache(activityKey)).toBeNull();
    vi.mocked(Date.now).mockReturnValue(now + 24 * 60 * 60_000);
    expect(restarted.cache.readFitnessSummaryCache("u1")).toBeNull();
  });

  it("재시작 뒤 host 승인 전에는 숨기고 동일 owner 승인 뒤 복원한다", async () => {
    const first = await modules();
    first.owner.prepareTrainingSurfaceCacheOwner("u1");
    first.cache.writeFitnessSummaryCache("u1", envelope);
    vi.resetModules();
    const restarted = await modules();
    expect(restarted.cache.readFitnessSummaryCache("u1")).toBeNull();
    restarted.owner.prepareTrainingSurfaceCacheOwner("u1");
    expect(restarted.cache.readFitnessSummaryCache("u1")).toMatchObject({ fresh: true, envelope });
  });

  it("UID와 host scope가 바뀌면 이전 값이 보이지 않는다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    cache.writeFitnessSummaryCache("u1", envelope);
    expect(cache.readFitnessSummaryCache("u2")).toBeNull();
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "abcdefab-1234-1234-1234-123456789abc";
    expect(cache.readFitnessSummaryCache("u1")).toBeNull();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    expect(cache.readFitnessSummaryCache("u1")).toBeNull();
  });

  it("180초나 서버 timezone의 자정이 지나면 stale, 24시간 뒤에는 만료된다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    cache.writeFitnessSummaryCache("u1", envelope);
    vi.mocked(Date.now).mockReturnValue(now + 25_000);
    expect(cache.readFitnessSummaryCache("u1")?.fresh).toBe(false);
    vi.mocked(Date.now).mockReturnValue(now + 185_000);
    expect(cache.readFitnessSummaryCache("u1")?.fresh).toBe(false);
    vi.mocked(Date.now).mockReturnValue(now + 24 * 60 * 60_000);
    expect(cache.readFitnessSummaryCache("u1")).toBeNull();
  });


  it("180초 직전까지 fresh이고 정확히 180초부터 stale이다", async () => {
    const savedAt = now - 60 * 60_000;
    vi.mocked(Date.now).mockReturnValue(savedAt);
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    cache.writeFitnessSummaryCache("u1", envelope);
    vi.mocked(Date.now).mockReturnValue(savedAt + 179_999);
    expect(cache.readFitnessSummaryCache("u1")?.fresh).toBe(true);
    vi.mocked(Date.now).mockReturnValue(savedAt + 180_000);
    expect(cache.readFitnessSummaryCache("u1")?.fresh).toBe(false);
  });

  it("failed/stale 응답은 이전 fresh cache를 무효화한다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    for (const status of ["stale", "failed"] as const) {
      cache.writeFitnessSummaryCache("u1", envelope);
      cache.writeFitnessSummaryCache("u1", { ...envelope, status });
      expect(cache.readFitnessSummaryCache("u1")).toBeNull();
    }
  });

  it("변조된 저장 데이터의 필드 타입을 신뢰하지 않는다", async () => {
    const { cache, owner } = await modules();
    owner.prepareTrainingSurfaceCacheOwner("u1");
    owner.setTrainingSurfaceCache({ uid: "u1", surface: "fitness-summary", sport: "all", locale: "canonical", range: "v1" }, {
      savedAt: now, envelope: { ...envelope, computedAt: "bad", period: undefined },
    });
    expect(cache.readFitnessSummaryCache("u1")).toBeNull();
  });
});
