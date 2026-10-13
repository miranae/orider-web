import { useEffect, useMemo, useState } from "react";
import type { MySegmentHistoryResponse, SegmentHistoryAttempt } from "@shared/types/segment-history";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadMySegmentHistory } from "../services/segmentHistory";
export function useMySegmentHistory(segmentId: string, selection: { activityId: string; effortId: string; nonce: number } | null, enabled = false) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const uid = user?.isAnonymous ? null : user?.uid;
  const key = uid && selection ? JSON.stringify([uid, segmentId, selection.activityId, selection.effortId, selection.nonce]) : null;
  const lifetime = useMemo(() => ({}), [key, services, enabled]);
  const [page, setPage] = useState<{ key: string; lifetime: object; cursor?: string; revision?: string; nonce: number } | null>(null);
  const [result, setResult] = useState<{ key: string; lifetime: object; services: typeof services; response: MySegmentHistoryResponse | null; rows: SegmentHistoryAttempt[]; error: boolean; pageNonce: number } | null>(null);
  const cursor = page?.key === key && page.lifetime === lifetime ? page.cursor : undefined;
  const revision = page?.key === key && page.lifetime === lifetime ? page.revision : undefined;
  const nonce = page?.key === key && page.lifetime === lifetime ? page.nonce : 0;
  useEffect(() => {
    if (!enabled || !key || !uid || !selection) return;
    let active = true;
    void loadMySegmentHistory(services, uid, { segmentId, currentActivityId: selection.activityId, currentEffortId: selection.effortId, pageSize: 50,
      ...(cursor ? { cursor, expectedInputRevision: revision } : {}) }).then(response => {
      if (!active) return;
      setResult(previous => {
        const prior = cursor && previous?.key === key && previous.lifetime === lifetime && previous.services === services ? previous.rows : [];
        const incoming = response.state === "available" ? response.attempts : [];
        const duplicate = incoming.some(row => prior.some(old => old.effortId === row.effortId));
        return { key, lifetime, services, response: duplicate ? null : response, rows: duplicate || response.state !== "available" ? [] : [...prior, ...incoming], error: duplicate, pageNonce: nonce };
      });
    }).catch(() => { if (active) setResult({ key, lifetime, services, response: null, rows: [], error: true, pageNonce: nonce }); });
    return () => { active = false; };
  }, [enabled, key, lifetime, uid, services, segmentId, selection, cursor, revision, nonce]);
  const current = enabled && result?.key === key && result.lifetime === lifetime && result.services === services ? result : null;
  const loading = enabled && !!key && (!current || current.pageNonce !== nonce);
  return { response: current?.response ?? null, rows: current?.rows ?? [], loading, error: current?.error ?? false,
    loadMore: () => { if (!loading && key && current?.response?.nextCursor) setPage({ key, lifetime, cursor: current.response.nextCursor, revision: current.response.inputRevision, nonce: nonce + 1 }); },
    retry: () => { if (key) setPage({ key, lifetime, nonce: nonce + 1 }); } };
}
