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
