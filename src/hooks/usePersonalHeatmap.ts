import { useEffect, useState } from "react";
import { logClientError } from "../services/errorLogger";
import { fetchRecentActivityTracks } from "../services/activityTracks";
import { aggregatePersonalHeatmapAsync, type PersonalHeatPoint } from "../features/explore/personalHeatmap";

let sessionCache: { uid: string; points: PersonalHeatPoint[] } | null = null;
export function clearPersonalHeatmapSessionCache(): void { sessionCache = null; }

export function usePersonalHeatmap(uid: string | null | undefined, enabled: boolean) {
  const [ownedPoints, setOwnedPoints] = useState<{ uid: string; points: PersonalHeatPoint[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!uid || !enabled) {
      setLoading(false);
      setError(false);
      if (!uid) {
        sessionCache = null;
        setOwnedPoints(null);
      }
      return;
    }
    if (sessionCache?.uid === uid) {
      setOwnedPoints(sessionCache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    // Never keep another account's in-memory geometry visible during a user switch.
    setOwnedPoints(null);
    setLoading(true);
    setError(false);
    void fetchRecentActivityTracks(uid).then((tracks) => {
      if (cancelled) return;
      return aggregatePersonalHeatmapAsync(tracks, undefined, undefined, {
        signal: controller.signal,
        isCancelled: () => cancelled,
      });
    }).then((next) => {
      if (cancelled || !next) return;
      sessionCache = { uid, points: next };
      setOwnedPoints(sessionCache);
    }).catch((err) => {
      if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
      // Never attach route geometry or coordinates to logs.
      logClientError("usePersonalHeatmap.load", err);
      if (!cancelled) { setOwnedPoints(null); setError(true); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [enabled, uid]);

  return { points: ownedPoints && ownedPoints.uid === uid ? ownedPoints.points : [], loading, error };
}
