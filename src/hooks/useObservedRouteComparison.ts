import { useEffect, useMemo, useRef, useState } from "react";
import type { Activity } from "@shared/types";
import type { ObservedRouteComparison } from "@shared/activity-route-comparison";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadActivityRouteEvidence, observedRouteAvailable, validRouteComparison } from "../services/activityRouteEvidence";
import type { RouteWorkerRequest, RouteWorkerResponse } from "../utils/observedRouteComparison.worker";
export type RouteComparisonState = "idle" | "loading" | "available" | "pending" | "changed_input" | "unavailable" | "error";
export function useObservedRouteComparison(first: Activity, second: Activity) {
  const { user } = useAuth();
  const services = useFirebaseServices();
  const uid = user?.uid;
  const eligible = !!uid && !user?.isAnonymous && first.userId === uid && second.userId === uid && first.id !== second.id
    && first.deletedAt == null && second.deletedAt == null && services.auth.currentUser?.uid === uid && observedRouteAvailable();
  // 부모가 관측한 활동 head 변경만 반영한다. 새 구독이나 자동 GPS 조회를 만들지 않는다.
  const head = JSON.stringify([first, second].map(activity => [activity.id, activity.userId, activity.contentRevision, activity.contentSelectedRevision, activity.deletedAt, activity.startTime, activity.endTime, activity.source]));
  const scope = useMemo(() => ({ first, second, uid, services, eligible, head }), [first, second, uid, services, eligible, head]);
  const ownership = useRef({ scope, generation: 0 });
  if (ownership.current.scope !== scope) ownership.current = { scope, generation: ownership.current.generation + 1 };
  const generation = ownership.current.generation;
  const request = useRef(0);
  const worker = useRef<Worker | null>(null);
  const [value, setValue] = useState<{ generation: number; state: RouteComparisonState; result: ObservedRouteComparison | null } | null>(null);
  const stop = () => { if (worker.current) { worker.current.onmessage = null; worker.current.onerror = null; worker.current.terminate(); worker.current = null; } };
  useEffect(() => () => { request.current++; stop(); }, [generation]);
  const compare = async () => {
    if (!eligible || !uid) return;
    const requestId = ++request.current; stop();
    const current = () => ownership.current.generation === generation && request.current === requestId && services.auth.currentUser?.uid === uid && !services.auth.currentUser.isAnonymous;
    setValue({ generation, state: "loading", result: null });
    try {
      const evidence = await Promise.all([first, second].map(activity => loadActivityRouteEvidence(services, uid, activity.id)));
      if (!current()) return;
      if (evidence.some(item => item.state !== "available")) {
        const state = evidence.some(item => item.state === "changed_input") ? "changed_input" : evidence.some(item => item.state === "pending") ? "pending" : "unavailable";
        setValue({ generation, state, result: null }); return;
      }
      const routes = evidence.map(item => item.route) as RouteWorkerRequest["routes"];
      const instance = new Worker(new URL("../utils/observedRouteComparison.worker.ts", import.meta.url), { type: "module" });
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<RouteWorkerResponse>) => {
        if (!current() || worker.current !== instance) return;
        if (!event.data || typeof event.data !== "object") { setValue({ generation, state: "error", result: null }); stop(); return; }
        if (event.data.requestId !== requestId) return;
        if (!("result" in event.data) || !validRouteComparison(event.data.result, routes)) setValue({ generation, state: "error", result: null });
        else setValue({ generation, state: event.data.result.state === "unavailable" ? "unavailable" : "available", result: event.data.result });
        stop();
      };
      instance.onerror = () => { if (current() && worker.current === instance) { setValue({ generation, state: "error", result: null }); stop(); } };
      instance.postMessage({ requestId, routes } satisfies RouteWorkerRequest);
    } catch { if (current()) { setValue({ generation, state: "error", result: null }); stop(); } }
  };
  const visible = eligible && value?.generation === generation ? value : null;
  return { enabled: eligible, state: visible?.state ?? "idle", result: visible?.result ?? null, compare };
}
