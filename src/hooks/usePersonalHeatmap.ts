import type { User } from "firebase/auth";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useEffect, useState } from "react";
import { logClientError } from "../services/errorLogger";
import { fetchRecentActivityTracks } from "../services/activityTracks";
import { aggregatePersonalHeatmapAsync, type PersonalHeatPoint } from "../features/explore/personalHeatmap";

let sessionCache: { database: object; owner: User; uid: string; points: PersonalHeatPoint[] } | null = null;
export function clearPersonalHeatmapSessionCache(): void { sessionCache = null; }

export function usePersonalHeatmap(uid: string | null | undefined, enabled: boolean) {
  // 임베드는 별도 Firebase app 을 쓴다 — 싱글턴 대신 주입된 auth(#847).
  const services = useFirebaseServices();
  const { auth } = services;
  const [ownedPoints, setOwnedPoints] = useState<{ database: object; owner: User; uid: string; points: PersonalHeatPoint[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const owner = auth.currentUser;
  useEffect(() => {
    if (!uid || !enabled || !owner || owner.uid !== uid || owner.isAnonymous) {
      setLoading(false);
      setError(false);
      if (!uid) {
        sessionCache = null;
        setOwnedPoints(null);
      }
      return;
    }
    if (sessionCache?.uid === uid && sessionCache.owner === owner && sessionCache.database === services.firestore) {
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
    void fetchRecentActivityTracks(uid, services).then((tracks) => {
      if (cancelled || auth.currentUser !== owner) return;
      return aggregatePersonalHeatmapAsync(tracks, undefined, undefined, {
        signal: controller.signal,
        isCancelled: () => cancelled || auth.currentUser !== owner,
      });
    }).then((next) => {
      if (cancelled || auth.currentUser !== owner || !next) return;
      sessionCache = { database: services.firestore, owner, uid, points: next };
      setOwnedPoints(sessionCache);
    }).catch((err) => {
      if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
      // Never attach route geometry or coordinates to logs.
      logClientError("usePersonalHeatmap.load", err);
      if (!cancelled) { setOwnedPoints(null); setError(true); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [auth, enabled, uid, owner, services]);

  return { points: ownedPoints && ownedPoints.uid === uid && ownedPoints.owner === owner && ownedPoints.database === services.firestore ? ownedPoints.points : [], loading, error };
}
