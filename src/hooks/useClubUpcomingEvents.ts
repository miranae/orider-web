import { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { firestore } from "../services/firebase";
import { logClientError } from "../services/errorLogger";

export interface ClubUpcomingEvent {
  id: string;
  name: string;
  /** 시작 시각(ms). 원본에 없으면 0 — 날짜를 지어내지 않고 표시만 생략한다. */
  startTime: number;
}

function toMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const ts = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    if (typeof ts._seconds === "number") return ts._seconds * 1000;
  }
  return 0;
}

/** 소식 > 현재 동호회 범위의 "다가오는 모임" — GroupDashboardPage 와 같은 OPEN/LIVE 최대 5건 쿼리. */
export function useClubUpcomingEvents(groupId: string) {
  const [events, setEvents] = useState<ClubUpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setLoading(true);
    setError(null);
    getDocs(query(collection(firestore, "events"), where("info.groupId", "==", groupId), where("info.status", "in", ["OPEN", "LIVE"]), orderBy("info.startTime", "asc"), limit(5)))
      .then((snapshot) => {
        if (cancelled) return;
        setEvents(snapshot.docs.map((event) => {
          const info = event.data().info ?? {};
          return { id: event.id, name: typeof info.name === "string" ? info.name : "", startTime: toMillis(info.startTime) };
        }));
      }).catch((err: unknown) => {
        logClientError("useClubUpcomingEvents.load", err, { groupId });
        if (!cancelled) setError(err);
      }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId, reloadKey]);
  return { events, loading, error, retry: () => setReloadKey((key) => key + 1) };
}
