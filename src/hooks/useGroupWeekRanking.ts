import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useAuth } from "../contexts/AuthContext";
import { logClientError } from "../services/errorLogger";

export type GroupWeekMetric = "distance" | "time" | "elevation";
interface Cursor { phase: "scores" | "members"; userId: string; value: number; metric: GroupWeekMetric; weekStartAt: number; revision: number; membershipVersion: number }
export interface GroupWeekRankingEntry { userId: string; nickname: string; distance: number; time: number; elevation: number; tss: number }
interface Page { entries: GroupWeekRankingEntry[]; nextCursor: Cursor | null }

export function useGroupWeekRanking(groupId: string | undefined, metric: GroupWeekMetric, accessKey?: string) {
  const { auth, functions, ensureAppCheckReady } = useFirebaseServices();
  const { user } = useAuth(); const uid = user?.uid;
  const [entries, setEntries] = useState<GroupWeekRankingEntry[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const busy = useRef(false);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const run = ++generation.current;
    busy.current = false; setEntries([]); setCursor(null); setError(false); setMoreError(false); setLoadingMore(false);
    if (!groupId || !uid) { setLoading(false); return; }
    setLoading(true);
    const current = () => generation.current === run && auth.currentUser?.uid === uid;
    void (async () => {
      try {
        await ensureAppCheckReady(); if (!current()) return;
        const response = await httpsCallable<{ groupId: string; metric: GroupWeekMetric; pageSize: number }, Page>(functions, "getGroupWeekRanking")({ groupId, metric, pageSize: 20 });
        if (current()) { setEntries(response.data.entries); setCursor(response.data.nextCursor); }
      } catch (reason) { if (current()) { setError(true); logClientError("useGroupWeekRanking", reason, { groupId }); } }
      finally { if (current()) setLoading(false); }
    })();
    return () => { generation.current++; };
  }, [auth, functions, ensureAppCheckReady, groupId, uid, metric, accessKey, attempt]);
  const loadMore = useCallback(async () => {
    if (!groupId || !uid || !cursor || busy.current) return;
    const run = generation.current; busy.current = true; setLoadingMore(true); setMoreError(false);
    const current = () => generation.current === run && auth.currentUser?.uid === uid;
    try {
      await ensureAppCheckReady(); if (!current()) return;
      const response = await httpsCallable<{ groupId: string; metric: GroupWeekMetric; pageSize: number; cursor: Cursor }, Page>(functions, "getGroupWeekRanking")({ groupId, metric, pageSize: 20, cursor });
      if (current()) {
        setEntries(previous => [...previous, ...response.data.entries.filter(entry => !previous.some(item => item.userId === entry.userId))]);
        setCursor(response.data.nextCursor);
      }
    } catch (reason) { if (current()) {
      const code = (reason as { code?: string } | null)?.code;
      if (["failed-precondition", "functions/failed-precondition", "invalid-argument", "functions/invalid-argument"].includes(code ?? "")) {
        setEntries([]); setCursor(null); setError(true); setMoreError(false);
      } else setMoreError(true);
      logClientError("useGroupWeekRanking.loadMore", reason, { groupId });
    } }
    finally { if (current()) { busy.current = false; setLoadingMore(false); } }
  }, [auth, functions, ensureAppCheckReady, groupId, uid, metric, cursor]);
  return { entries, loading, error, moreError, loadingMore, hasMore: cursor !== null, loadMore, retry };
}
