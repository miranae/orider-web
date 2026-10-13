import { useLayoutEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { SegmentGapRef, SegmentGapResponse } from "@shared/segment-distance-time-gap";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadSegmentDistanceTimeGap, segmentGapAvailable } from "../services/segmentDistanceTimeGap";
export function useSegmentDistanceTimeGap(segmentId: string, pair: [SegmentGapRef, SegmentGapRef] | null, sourceIdentity: string) {
  const { user } = useAuth(), services = useFirebaseServices(), uid = user?.uid;
  const [authEpoch, setAuthEpoch] = useState(0);
  const eligible = !!uid && !user?.isAnonymous && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous && segmentGapAvailable() && !!pair;
  const key = JSON.stringify([uid, eligible, segmentId, pair, sourceIdentity, authEpoch]);
  const scope = useRef({ key, services, user, generation: 0 }), busy = useRef<number | null>(null), revision = useRef<string | undefined>(undefined), epoch = useRef(0);
  const mounted = useRef(true);
  if (scope.current.key !== key || scope.current.services !== services || scope.current.user !== user) {
    scope.current = { key, services, user, generation: scope.current.generation + 1 }; busy.current = null; revision.current = undefined; epoch.current++;
  }
  const generation = scope.current.generation;
  const [result, setResult] = useState<{ generation: number; state: "loading" | "error" | SegmentGapResponse["state"]; response: SegmentGapResponse | null } | null>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    let first = true;
    const unsubscribe = onAuthStateChanged(services.auth, authUser => {
      if (first && authUser?.uid === uid && !authUser?.isAnonymous) { first = false; return; }
      first = false;
      epoch.current++; scope.current.generation++; busy.current = null; revision.current = undefined; setResult(null); setAuthEpoch(n => n + 1);
    });
    return () => { mounted.current = false; unsubscribe(); epoch.current++; busy.current = null; };
  }, [services, uid]);
  const visible = eligible && result?.generation === generation ? result : null;
  const active = () => mounted.current && eligible && scope.current.generation === generation && scope.current.key === key
    && scope.current.services === services && scope.current.user === user && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
  const inspect = async () => {
    if (!active() || !uid || !pair || busy.current === generation) return;
    busy.current = generation; const requestEpoch = ++epoch.current;
    const current = () => active() && epoch.current === requestEpoch;
    setResult({ generation, state: "loading", response: null });
    try {
      const response = await loadSegmentDistanceTimeGap(services, uid, { mode: "segment_distance_time_gap", version: 1, segmentId, efforts: pair,
        ...(revision.current ? { expectedPairRevision: revision.current } : {}) }, current);
      if (!current()) return;
      revision.current = response.pairRevision ?? undefined;
      setResult({ generation, state: response.state, response });
    } catch { if (current()) setResult({ generation, state: "error", response: null }); }
    finally { if (current()) busy.current = null; }
  };
  return { eligible, state: visible?.state ?? "idle", response: visible?.response ?? null, inspect };
}
