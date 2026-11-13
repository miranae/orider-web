import { Timestamp, collection, getCountFromServer, query, where, type Firestore } from "firebase/firestore";

/** 활성 시청자 판정 창. 서버 heartbeat 는 30초 간격이다. */
export const ACTIVE_VIEWER_WINDOW_MS = 90_000;

export interface ViewerRecord {
  lastSeenAt?: number | { toMillis?: () => number } | null;
}

export function countActiveViewers(records: ViewerRecord[], now = Date.now()): number {
  const cutoff = now - ACTIVE_VIEWER_WINDOW_MS;
  return records.filter((record) => {
    const value = record.lastSeenAt;
    const millis = typeof value === "number" ? value : typeof value?.toMillis === "function" ? value.toMillis() : 0;
    return millis >= cutoff;
  }).length;
}

export function createViewerSessionId(): string {
  return crypto.randomUUID().replace(/-/g, "_");
}

/**
 * 활성 시청자 수를 서버 count 집계로 센다. viewers 문서를 전부 읽거나 컬렉션을 구독하면
 * 시청자마다 다른 시청자의 heartbeat 를 매번 읽어 비용이 시청자 수의 제곱으로 늘었다.
 * count 는 색인 항목 1,000개당 읽기 1회다.
 */
export async function loadActiveViewerCount(firestore: Firestore, eventId: string, now = Date.now()): Promise<number> {
  const active = query(collection(firestore, `events/${eventId}/viewers`), where("lastSeenAt", ">=", Timestamp.fromMillis(now - ACTIVE_VIEWER_WINDOW_MS)));
  const snapshot = await getCountFromServer(active);
  return snapshot.data().count;
}

export interface ViewerSummaryRecord {
  activeCount?: unknown;
  computedAt?: { toMillis?: () => number } | null;
}

/**
 * 서버가 heartbeat 때 30초에 한 번 세어 쓰는 events/{id}/viewer_summary/current 를 읽는다.
 * 요약이 없거나 활성 창(90초)보다 오래됐으면 지금 보는 사람이 없다고 본다.
 */
export function activeViewerCountFromSummary(record: ViewerSummaryRecord | null | undefined, now = Date.now()): number {
  const computedAt = typeof record?.computedAt?.toMillis === "function" ? record.computedAt.toMillis() : null;
  const count = record?.activeCount;
  if (computedAt === null || now - computedAt > ACTIVE_VIEWER_WINDOW_MS) return 0;
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}
