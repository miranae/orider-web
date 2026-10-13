import type { ActivityRouteEvidence, ObservedRouteComparison } from "@shared/activity-route-comparison";
import { compareObservedRoutes } from "@shared/observed-route-comparison";
export type RouteWorkerRequest = { requestId: number; routes: [ActivityRouteEvidence, ActivityRouteEvidence] };
export type RouteWorkerResponse = { requestId: number; result: ObservedRouteComparison } | { requestId: number; error: true };
self.onmessage = (event: MessageEvent<RouteWorkerRequest>) => {
  const { requestId, routes } = event.data;
  try { self.postMessage({ requestId, result: compareObservedRoutes(routes[0], routes[1]) } satisfies RouteWorkerResponse); }
  catch { self.postMessage({ requestId, error: true } satisfies RouteWorkerResponse); }
};
