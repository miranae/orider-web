import { useEffect, useState } from "react";
import { logClientError } from "../services/errorLogger";
import { fetchRecentActivityTracks } from "../services/activityTracks";
import { aggregateExplorationGridAsync, type ExplorationGridResult } from "../features/explore/explorationGrid";

const EMPTY_RESULT: ExplorationGridResult = { tiles: [], tileCount: 0, maxSquare: 0 };

let sessionCache: { uid: string; result: ExplorationGridResult } | null = null;
export function clearExplorationGridSessionCache(): void { sessionCache = null; }

/**
 * 탐험 그리드(#363) — 개인 히트맵(#413)과 동일한 최근 1년 · 최대 500건 활동 스트림을
 * 재사용하되(fetchRecentActivityTracks), 방문 타일 집계는 별도 세션 캐시로 보관해 두 기능을
 * 오가며 토글해도 재계산하지 않는다.
 */
export function useExplorationGrid(uid: string | null | undefined, enabled: boolean) {
  const [owned, setOwned] = useState<{ uid: string; result: ExplorationGridResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!uid || !enabled) {
      setLoading(false);
      setError(false);
      if (!uid) {
        sessionCache = null;
        setOwned(null);
      }
      return;
    }
    if (sessionCache?.uid === uid) {
      setOwned(sessionCache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    // Never keep another account's in-memory geometry visible during a user switch.
    setOwned(null);
    setLoading(true);
    setError(false);
    void fetchRecentActivityTracks(uid).then((tracks) => {
      if (cancelled) return;
      return aggregateExplorationGridAsync(tracks, undefined, undefined, {
        signal: controller.signal,
        isCancelled: () => cancelled,
      });
    }).then((next) => {
      if (cancelled || !next) return;
      sessionCache = { uid, result: next };
      setOwned(sessionCache);
    }).catch((err) => {
      if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
      // Never attach route geometry or coordinates to logs.
      logClientError("useExplorationGrid.load", err);
      if (!cancelled) { setOwned(null); setError(true); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [enabled, uid]);

  return { result: owned && owned.uid === uid ? owned.result : EMPTY_RESULT, loading, error };
}
