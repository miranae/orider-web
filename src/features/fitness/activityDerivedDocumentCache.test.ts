import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import {
  ACTIVITY_DERIVED_DOCUMENT_CACHE_MAX_ENTRIES,
  ACTIVITY_DERIVED_DOCUMENT_CACHE_TTL_MS,
  activityDerivedDocumentCacheTestApi,
  clearActivityDerivedDocumentCache,
  getCachedActivityDerivedDocument,
  prepareActivityDerivedDocumentCacheOwner,
  setCachedActivityDerivedDocument,
} from "./activityDerivedDocumentCache";

const metrics = (tss: number) => ({ tss }) as unknown as ActivityMetrics;

describe("activityDerivedDocumentCache", () => {
  beforeEach(() => {
    clearActivityDerivedDocumentCache();
    prepareActivityDerivedDocumentCacheOwner("user-a");
  });

  it("같은 revision 만 적중으로 보고, 다른 revision 은 버린다", () => {
    setCachedActivityDerivedDocument("user-a", "metrics", "a1", "r1", metrics(10));
    expect(getCachedActivityDerivedDocument("user-a", "metrics", "a1", "r1")).toEqual({ tss: 10 });
    expect(getCachedActivityDerivedDocument("user-a", "stream", "a1", "r1")).toBeUndefined();
    expect(getCachedActivityDerivedDocument("user-a", "metrics", "a1", "r2")).toBeUndefined();
    // 어긋난 revision 항목은 제거되어 원래 revision 으로도 더는 적중하지 않는다.
    expect(getCachedActivityDerivedDocument("user-a", "metrics", "a1", "r1")).toBeUndefined();
  });

  it("다른 계정의 조회·저장은 무시하고, 계정이 바뀌면 비운다", () => {
    setCachedActivityDerivedDocument("user-a", "metrics", "a1", "r1", metrics(10));
    setCachedActivityDerivedDocument("user-b", "metrics", "b1", "r1", metrics(20));
    expect(activityDerivedDocumentCacheTestApi.size()).toBe(1);
    expect(getCachedActivityDerivedDocument("user-b", "metrics", "a1", "r1")).toBeUndefined();

    prepareActivityDerivedDocumentCacheOwner(null);
    expect(activityDerivedDocumentCacheTestApi.size()).toBe(0);
    prepareActivityDerivedDocumentCacheOwner("user-a");
    expect(getCachedActivityDerivedDocument("user-a", "metrics", "a1", "r1")).toBeUndefined();
  });

  it("항목 수를 LRU 로 제한한다", () => {
    for (let index = 0; index < ACTIVITY_DERIVED_DOCUMENT_CACHE_MAX_ENTRIES; index += 1) {
      setCachedActivityDerivedDocument("user-a", "metrics", `a${index}`, "r", metrics(index));
    }
    // 가장 오래된 a0 을 최근 사용으로 올리면 다음 추가 때 a1 이 밀려난다.
    expect(getCachedActivityDerivedDocument("user-a", "metrics", "a0", "r")).toEqual({ tss: 0 });
    setCachedActivityDerivedDocument("user-a", "metrics", "overflow", "r", metrics(-1));
    expect(activityDerivedDocumentCacheTestApi.size()).toBe(ACTIVITY_DERIVED_DOCUMENT_CACHE_MAX_ENTRIES);
    expect(getCachedActivityDerivedDocument("user-a", "metrics", "a1", "r")).toBeUndefined();
    expect(getCachedActivityDerivedDocument("user-a", "metrics", "a0", "r")).toEqual({ tss: 0 });
  });

  describe("수명", () => {
    afterEach(() => vi.useRealTimers());
    it("revision 이 같아도 수명이 지나면 다시 읽게 한다 — 서버가 파생 문서만 다시 쓴 경우(#1032 리뷰)", () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      setCachedActivityDerivedDocument("user-a", "metrics", "a1", "r1", metrics(10));
      vi.setSystemTime(1_000_000 + ACTIVITY_DERIVED_DOCUMENT_CACHE_TTL_MS - 1);
      expect(getCachedActivityDerivedDocument("user-a", "metrics", "a1", "r1")).toEqual({ tss: 10 });
      vi.setSystemTime(1_000_000 + ACTIVITY_DERIVED_DOCUMENT_CACHE_TTL_MS);
      expect(getCachedActivityDerivedDocument("user-a", "metrics", "a1", "r1")).toBeUndefined();
    });
  });
});

