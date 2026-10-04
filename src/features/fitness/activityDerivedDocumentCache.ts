import type { ActivityStreams } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";

/**
 * 활동 파생 문서(activity_streams / activity_metrics) 모듈 단위 캐시.
 *
 * 임베드 피트니스 표면은 host 표면 선택·포그라운드 복귀마다 재마운트되는데, 훅 인스턴스 단위
 * 캐시는 그때마다 사라져 활동 수 × 2 건의 getDoc 을 매번 다시 했다. 같은 WebView(같은 JS 실행)
 * 안에서는 이 캐시로 재조회를 건너뛴다.
 *
 * - 키는 (종류, 활동 ID) 이고 값에는 읽을 당시의 활동 revision(activityDerivedDocumentRevision)을
 *   함께 둔다. revision 이 다르면 적중으로 보지 않고 버린다 — 파생 문서가 갱신된 활동의 옛 값을
 *   내보내지 않는다.
 * - 한 번에 한 계정만 보관한다. 다른 uid(또는 로그아웃)가 오면 전부 비운다.
 * - 메모리에만 두고(영속 저장 없음) 항목 수를 LRU 로 제한한다. 마운트 중인 훅 state 가 이미 같은
 *   객체를 들고 있으므로, 추가 비용은 언마운트 뒤에도 참조를 유지하는 만큼이다.
 */
export const ACTIVITY_DERIVED_DOCUMENT_CACHE_MAX_ENTRIES = 1_000;
/**
 * 항목 수명. 서버가 활동 문서는 그대로 두고 파생 문서만 다시 쓰는 경우(지표 백필·가상 파워 재계산 등)는
 * revision 이 바뀌지 않아 알 수 없다 — 그래도 이 시간이 지나면 다시 읽는다(#1032 리뷰).
 */
export const ACTIVITY_DERIVED_DOCUMENT_CACHE_TTL_MS = 10 * 60 * 1000;

export type ActivityDerivedDocumentKind = "stream" | "metrics";

type CachedValue<K extends ActivityDerivedDocumentKind> = K extends "stream"
  ? ActivityStreams
  : ActivityMetrics;

type CacheEntry = {
  revision: string;
  storedAt: number;
  value: ActivityStreams | ActivityMetrics;
};

const entries = new Map<string, CacheEntry>();
let ownerUid: string | null = null;

function cacheKey(kind: ActivityDerivedDocumentKind, activityId: string): string {
  return `${kind}\u0000${activityId}`;
}

/** 현재 계정을 지정한다. 직전 계정과 다르면(로그아웃 포함) 이전 계정의 값을 모두 버린다. */
export function prepareActivityDerivedDocumentCacheOwner(uid: string | null): void {
  if (ownerUid === uid) return;
  entries.clear();
  ownerUid = uid;
}

export function getCachedActivityDerivedDocument<K extends ActivityDerivedDocumentKind>(
  uid: string,
  kind: K,
  activityId: string,
  revision: string,
): CachedValue<K> | undefined {
  if (ownerUid !== uid) return undefined;
  const key = cacheKey(kind, activityId);
  const entry = entries.get(key);
  if (entry == null) return undefined;
  entries.delete(key);
  // revision 이 바뀌었거나 수명이 지난 항목은 다시 읽어야 하므로 버린다.
  if (entry.revision !== revision || Date.now() - entry.storedAt >= ACTIVITY_DERIVED_DOCUMENT_CACHE_TTL_MS) return undefined;
  entries.set(key, entry);
  return entry.value as CachedValue<K>;
}

export function setCachedActivityDerivedDocument<K extends ActivityDerivedDocumentKind>(
  uid: string,
  kind: K,
  activityId: string,
  revision: string,
  value: CachedValue<K>,
): void {
  if (ownerUid !== uid) return;
  const key = cacheKey(kind, activityId);
  entries.delete(key);
  entries.set(key, { revision, storedAt: Date.now(), value });
  while (entries.size > ACTIVITY_DERIVED_DOCUMENT_CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function clearActivityDerivedDocumentCache(): void {
  entries.clear();
  ownerUid = null;
}

export const activityDerivedDocumentCacheTestApi = {
  size: () => entries.size,
};
