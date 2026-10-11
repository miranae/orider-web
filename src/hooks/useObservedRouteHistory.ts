import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { Activity } from "@shared/types";
import type { ActivityRouteEvidence, ActivityRouteEvidenceResponse, ObservedRouteComparison } from "@shared/activity-route-comparison";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityRouteEvidence, observedRouteAvailable, validRouteComparison } from "../services/activityRouteEvidence";
import type { RouteWorkerRequest, RouteWorkerResponse } from "../utils/observedRouteComparison.worker";
import { validObservedRouteHistorySelection } from "../features/activity/detail/observedRouteHistory";
export type ObservedRouteHistoryRow = { activity: Activity; read: boolean; reason: ActivityRouteEvidenceResponse["reason"] | ObservedRouteComparison["reason"] | "request_error" | "worker_error"; state: "available" | "pending" | "changed_input" | "unavailable" | "error"; result: ObservedRouteComparison | null };
type Batch = { generation: number; epoch: number; state: "loading" | "ready"; readCount: number; rows: ObservedRouteHistoryRow[]; anchorState: string };
/** 메모리 안의 수동 배치만 유지한다. 기준 활동 1회 + 선택 활동 최대3회, 순차 조회한다. */
export function useObservedRouteHistory(anchor: Activity, selected: readonly Activity[], observedMetricsIdentity: string) {
  const { user } = useAuth(), services = useFirebaseServices(), uid = user?.uid;
  const ownerAvailable = !!uid && !user?.isAnonymous && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous
    && anchor.userId === uid && anchor.deletedAt == null && observedRouteAvailable();
  const eligible = ownerAvailable && validObservedRouteHistorySelection(anchor, selected);
  const picks = eligible ? [...selected].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id)) : [];
  const key = JSON.stringify([uid, eligible, observedMetricsIdentity, [anchor, ...picks].map(a => [a.id, a.userId, a.type, a.contentRevision, a.contentSelectedRevision, a.deletedAt, a.startTime, a.endTime, a.source, a.localSessionId, a.stravaActivityId, a.stravaTwinActivityId, a.summary?.distance, a.summary?.movingTimeSec, a.summary?.elapsedTimeMillis])]);
  const scope = useRef({ key, services, generation: 0 }), epoch = useRef(0), busy = useRef<number | null>(null);
  const worker = useRef<{ instance: Worker; finish: (value: ObservedRouteComparison | null) => void } | null>(null);
  if (scope.current.key !== key || scope.current.services !== services) { scope.current = { key, services, generation: scope.current.generation + 1 }; epoch.current++; busy.current = null; }
  const generation = scope.current.generation;
  const [batch, setBatch] = useState<Batch | null>(null);
  const stop = () => { const active = worker.current; worker.current = null; if (active) { active.instance.onmessage = null; active.instance.onerror = null; active.instance.terminate(); active.finish(null); } };
  useEffect(() => () => { epoch.current++; busy.current = null; stop(); }, [generation]);
  useEffect(() => {
    let authIdentity = `${services.auth.currentUser?.uid}:${services.auth.currentUser?.isAnonymous}`;
    return onAuthStateChanged(services.auth, authUser => {
      const next = `${authUser?.uid}:${authUser?.isAnonymous}`;
      if (next !== authIdentity) { authIdentity = next; epoch.current++; busy.current = null; stop(); setBatch(null); }
    });
  }, [services]);
  const inspect = async () => {
    if (!eligible || !uid || busy.current === generation) return;
    const requestId = ++epoch.current; busy.current = generation; stop();
    const current = () => epoch.current === requestId && scope.current.generation === generation && scope.current.services === services
      && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
    let readCount = 0;
    const rows: ObservedRouteHistoryRow[] = [];
    const publish = (state: Batch["state"], anchorState: string) => { if (current()) setBatch({ generation, epoch: requestId, state, readCount, rows: [...rows], anchorState }); };
    publish("loading", "loading");
    try {
      readCount++;
      const first = await loadActivityRouteEvidence(services, uid, anchor.id);
      if (!current()) return;
      if (first.state !== "available") {
        picks.forEach(activity => rows.push({ activity, read: false, reason: first.reason, state: first.state, result: null })); publish("ready", first.state); return;
      }
      for (const activity of picks) {
        if (!current()) return;
        try {
          readCount++;
          const candidate = await loadActivityRouteEvidence(services, uid, activity.id);
          if (!current()) return;
          if (candidate.state !== "available") rows.push({ activity, read: true, reason: candidate.reason, state: candidate.state, result: null });
          else {
            const routes: [ActivityRouteEvidence, ActivityRouteEvidence] = [first.route, candidate.route];
            const result = await new Promise<ObservedRouteComparison | null>(resolve => {
              const instance = new Worker(new URL("../utils/observedRouteComparison.worker.ts", import.meta.url), { type: "module" });
              const timer = globalThis.setTimeout(() => finish(null), 30000);
              worker.current = { instance, finish: value => { globalThis.clearTimeout(timer); resolve(value); } };
              const finish = (value: ObservedRouteComparison | null) => { if (worker.current?.instance !== instance) return; worker.current = null; globalThis.clearTimeout(timer); instance.onmessage = null; instance.onerror = null; instance.terminate(); resolve(value); };
              instance.onmessage = (event: MessageEvent<RouteWorkerResponse>) => {
                if (!current()) { finish(null); return; }
                if (!event.data || event.data.requestId !== requestId) return;
                finish("result" in event.data && validRouteComparison(event.data.result, routes) ? event.data.result : null);
              };
              instance.onerror = () => finish(null);
              instance.postMessage({ requestId, routes } satisfies RouteWorkerRequest);
            });
            if (!current()) return;
            rows.push({ activity, read: true, reason: result?.reason ?? (result ? null : "worker_error"), state: result ? result.state === "unavailable" ? "unavailable" : "available" : "error", result });
          }
        } catch { stop(); if (!current()) return; rows.push({ activity, read: true, reason: "request_error", state: "error", result: null }); }
        publish("loading", "available");
      }
      publish("ready", "available");
    } catch { if (current()) { picks.forEach(activity => rows.push({ activity, read: false, reason: "request_error", state: "error", result: null })); publish("ready", "error"); } }
    finally { if (current()) busy.current = null; }
  };
  const visible = eligible && batch?.generation === generation && batch.epoch === epoch.current ? batch : null;
  return { ownerAvailable, enabled: eligible, state: visible?.state ?? "idle", rows: visible?.rows ?? [], readCount: visible?.readCount ?? 0, anchorState: visible?.anchorState ?? "idle", inspect };
}
