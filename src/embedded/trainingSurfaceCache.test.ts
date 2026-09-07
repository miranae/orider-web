import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTrainingSurfaceCache,
  getTrainingSurfaceCache,
  prepareTrainingSurfaceCacheOwner,
  setTrainingSurfaceCache,
  trainingSurfaceCacheTestApi,
} from "./trainingSurfaceCache";

afterEach(() => { delete window.__ORIDER_TRAINING_CACHE_SCOPE__; });

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

const scope = "12345678-1234-1234-1234-123456789abc";
const diskKey = "orider.trainingSurfaceCache.v2";
const snapshot = { goal: null, weeks: [] };

async function freshCache() {
  vi.resetModules();
  return import("./trainingSurfaceCache");
}

describe("훈련 스냅샷 영속 캐시", () => {
  beforeEach(() => {
    localStorage.clear();
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = scope;
    vi.useRealTimers();
  });

  it("재시작 후 실제 UID 승인 전에는 복원하지 않고 승인 후 디스크를 읽는다", async () => {
    const first = await freshCache();
    first.prepareTrainingSurfaceCacheOwner(key.uid);
    first.setTrainingSurfaceCache(key, snapshot);
    const persisted = localStorage.getItem(diskKey);
    expect(persisted).not.toBeNull();

    const restarted = await freshCache();
    expect(restarted.getTrainingSurfaceCache(key)).toBeNull();
    expect(localStorage.getItem(diskKey)).toBe(persisted);
    restarted.prepareTrainingSurfaceCacheOwner(key.uid);
    expect(restarted.getTrainingSurfaceCache(key)).toEqual(snapshot);
    localStorage.setItem(diskKey, "깨진 JSON");
    expect(restarted.getTrainingSurfaceCache(key)).toEqual(snapshot);
  });

  it("네이티브 scope가 없는 기존 앱은 메모리만 사용한다", async () => {
    delete window.__ORIDER_TRAINING_CACHE_SCOPE__;
    const cache = await freshCache();
    cache.prepareTrainingSurfaceCacheOwner(key.uid);
    cache.setTrainingSurfaceCache(key, snapshot);
    expect(cache.getTrainingSurfaceCache(key)).toEqual(snapshot);
    expect(localStorage.getItem(diskKey)).toBeNull();
  });

  it.each(["uid", "scope", "schema", "expired", "future", "badKey", "badDto", "oversize", "broken"])(
    "%s 불일치나 손상은 디스크 캐시 미스로 처리한다", async (kind) => {
      const first = await freshCache();
      first.prepareTrainingSurfaceCacheOwner(key.uid);
      first.setTrainingSurfaceCache(key, snapshot);
      const envelope = JSON.parse(localStorage.getItem(diskKey)!);
      if (kind === "uid") envelope.uid = "other";
      if (kind === "scope") envelope.scope = "87654321-4321-4321-4321-cba987654321";
      if (kind === "schema") envelope.schema = -1;
      if (kind === "expired") envelope.entries[0].expiresAt = Date.now() - 1;
      if (kind === "future") envelope.entries[0].expiresAt = Date.now() + 20 * 60_000;
      if (kind === "badKey") envelope.entries[0].key.uid = "other";
      if (kind === "badDto") envelope.entries[0].value.weeks = "잘못된 배열";
      localStorage.setItem(diskKey, kind === "broken" ? "{" : kind === "oversize" ? "x".repeat(524289) : JSON.stringify(envelope));
      const restarted = await freshCache();
      restarted.prepareTrainingSurfaceCacheOwner(key.uid);
      expect(restarted.getTrainingSurfaceCache(key)).toBeNull();
    },
  );

  it("로그아웃은 구버전 prefix까지 삭제하고 다른 저장소는 유지한다", async () => {
    const cache = await freshCache();
    cache.prepareTrainingSurfaceCacheOwner(key.uid);
    cache.setTrainingSurfaceCache(key, snapshot);
    localStorage.setItem("orider.trainingSurfaceCache.v1", "legacy");
    localStorage.setItem("unrelated", "유지");
    cache.clearTrainingSurfaceCache();
    expect(cache.getTrainingSurfaceCache(key)).toBeNull();
    expect(localStorage.getItem(diskKey)).toBeNull();
    expect(localStorage.getItem("orider.trainingSurfaceCache.v1")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("유지");
  });

  it("계정 변경과 scope 회전은 이전 캐시 및 늦은 저장을 차단한다", async () => {
    const cache = await freshCache();
    cache.prepareTrainingSurfaceCacheOwner(key.uid);
    cache.setTrainingSurfaceCache(key, snapshot);
    cache.prepareTrainingSurfaceCacheOwner("other");
    cache.setTrainingSurfaceCache(key, snapshot);
    expect(localStorage.getItem(diskKey)).toBeNull();
    cache.prepareTrainingSurfaceCacheOwner(key.uid);
    cache.setTrainingSurfaceCache(key, snapshot);
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "87654321-4321-4321-4321-cba987654321";
    expect(cache.getTrainingSurfaceCache(key)).toBeNull();
    cache.prepareTrainingSurfaceCacheOwner(key.uid);
    expect(cache.getTrainingSurfaceCache(key)).toBeNull();
  });

  it("인증 자격증명과 과도한 DTO는 디스크에 저장하지 않는다", async () => {
    const cache = await freshCache();
    cache.prepareTrainingSurfaceCacheOwner(key.uid);
    cache.setTrainingSurfaceCache(key, { goal: { accessToken: "민감값" }, weeks: [] });
    expect(localStorage.getItem(diskKey)).not.toContain("민감값");
    cache.setTrainingSurfaceCache(key, { goal: { title: "x".repeat(524289) }, weeks: [] });
    expect(localStorage.getItem(diskKey)!.length).toBeLessThan(524288);
  });

  it("SHA256 scope도 허용하고 디스크 항목 수와 총 바이트를 제한한다", async () => {
    window.__ORIDER_TRAINING_CACHE_SCOPE__ = "a".repeat(64);
    const cache = await freshCache();
    cache.prepareTrainingSurfaceCacheOwner(key.uid);
    for (let index = 0; index < 13; index += 1) {
      cache.setTrainingSurfaceCache({ ...key, sport: `sport-${index}` }, snapshot);
    }
    expect(JSON.parse(localStorage.getItem(diskKey)!).entries).toHaveLength(12);
    for (let index = 0; index < 3; index += 1) {
      cache.setTrainingSurfaceCache({ ...key, sport: `large-${index}` }, {
        goal: { userId: key.uid, id: "goal", title: "큰".repeat(80_000) }, weeks: [],
      });
    }
    const encoded = localStorage.getItem(diskKey)!;
    expect(new TextEncoder().encode(encoded).byteLength).toBeLessThanOrEqual(524288);
    expect(JSON.parse(encoded).entries.length).toBeLessThan(12);
    expect(cache.getTrainingSurfaceCache({ ...key, sport: "large-2" })).not.toBeNull();
  });

  it("용량 초과 저장 예외에도 메모리 조회는 성공한다", async () => {
    const cache = await freshCache();
    cache.prepareTrainingSurfaceCacheOwner(key.uid);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    try {
      cache.setTrainingSurfaceCache(key, snapshot);
      expect(cache.getTrainingSurfaceCache(key)).toEqual(snapshot);
    } finally { spy.mockRestore(); }
  });
});
