import { httpsCallable } from "firebase/functions";
import type { RouteHistorySnapshotRequest, RouteHistorySnapshotResponse } from "@shared/activity-route-history-snapshot";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { observedRouteAvailable } from "./activityRouteEvidence";
import { localTrainingEmulatorAvailable, matchesLocalTrainingEmulator } from "./localTrainingEmulator";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(v);
export function validateRouteHistorySnapshot(value: unknown, request: RouteHistorySnapshotRequest, previous?: RouteHistorySnapshotResponse): RouteHistorySnapshotResponse {
 const fail = (): never => { throw Error("invalid_route_history_response"); };
 if (!object(value)) fail();
 const r = value as unknown as RouteHistorySnapshotResponse;
 if (!/^[a-f0-9-]{36}$/.test(r.runId) || !count(r.version) || !["scanning","identity","reducing","complete","invalidated","expired"].includes(r.state)
  || !Number.isFinite(r.asOf) || r.asOf <= 0 || r.asOf > Date.now() || r.expiresAt !== r.asOf + 50 * 60000
  || r.scope !== "recorded_observations_at_snapshot" || r.physicalRideCompleteness !== "unknown"
  || ![r.scanned,r.excluded,r.unresolved,r.candidateCount].every(count)
  || !["in_progress","enumerated_at_read_time"].includes(r.wholeHistory)
  || !count(r.excluded+r.unresolved+r.candidateCount) || r.scanned!==r.excluded+r.unresolved+r.candidateCount
  || !["complete","expired"].includes(r.state)&&r.wholeHistory!=="in_progress") fail();
 if (request.action !== "start" && (r.runId !== request.runId || previous && (r.asOf !== previous.asOf || r.expiresAt !== previous.expiresAt || r.version < previous.version))) fail();
 if (r.state !== "complete") {
  if (r.best !== null || r.bestStatus !== (["expired","invalidated"].includes(r.state) ? "unavailable" : "pending")) fail();
 } else {
  const b = r.best;
  if (!b) return fail();
  if (r.wholeHistory !== "enumerated_at_read_time" || b.anchorActivityId !== request.anchorActivityId || !/^[a-f0-9]{64}$/.test(b.anchorInputRevision)
   || ![b.groups,b.rows,b.eligibleGroups,b.excludedGroups,b.ambiguousGroups,b.unavailableGroups,b.tieCount].every(count)
   || b.rows!==r.candidateCount || b.groups>b.rows || b.tieCount>b.eligibleGroups
   || !count(b.eligibleGroups+b.excludedGroups+b.ambiguousGroups+b.unavailableGroups)
   || b.groups !== b.eligibleGroups + b.excludedGroups + b.ambiguousGroups + b.unavailableGroups || !object(b.states)
   || !["verified","missing","unsupported","changed"].every(k=>count(b.states[k as keyof typeof b.states]))
   || !count(Object.values(b.states).reduce((a,c)=>a+c,0))
   || Object.values(b.states).reduce((a,c)=>a+c,0) !== b.rows || !Array.isArray(b.bestActivityIds) || b.bestActivityIds.length > 20
   || !b.bestActivityIds.every(id) || new Set(b.bestActivityIds).size !== b.bestActivityIds.length || b.tieCount < b.bestActivityIds.length
   || b.tiesTruncated !== (b.tieCount > b.bestActivityIds.length)) fail();
  if (b.bestElapsedSec === null) { if (b.bestActivityIds.length || b.tieCount || r.bestStatus !== "unavailable") fail(); }
  else if (!Number.isFinite(b.bestElapsedSec) || b.bestElapsedSec <= 0 || !Number.isSafeInteger(Math.round(b.bestElapsedSec*10)) || !b.bestActivityIds.length || r.bestStatus !== (r.unresolved || b.ambiguousGroups || b.unavailableGroups ? "observed_best_with_gaps" : "verified_recorded_best")) fail();
 }
 if (previous && [r.scanned < previous.scanned,r.candidateCount < previous.candidateCount].some(Boolean)) fail();
 return r;
}
export async function loadRouteHistorySnapshot(services: FirebaseServices, uid: string, request: RouteHistorySnapshotRequest, previous?: RouteHistorySnapshotResponse) {
 const {auth,functions}=services, app=auth.app, viewer=auth.currentUser;
 const current=()=>!!viewer&&!viewer.isAnonymous&&viewer.uid===uid&&services.auth===auth&&auth.app===app&&auth.currentUser===viewer&&services.functions===functions&&functions.app===app;
 if(!current())throw Error("account_changed");
 if(!observedRouteAvailable() || (localTrainingEmulatorAvailable()?!matchesLocalTrainingEmulator(services):functions.customDomain!=="https://asia-northeast3-orider-dev.cloudfunctions.net"))throw Error("route_history_unsupported");
 if(!id(request.anchorActivityId)||!["bike","run"].includes(request.discipline))throw Error("invalid_route_history_request");
 await services.ensureAppCheckReady();if(!current())throw Error("account_changed");
 const result=await httpsCallable<RouteHistorySnapshotRequest,unknown>(functions,"progressActivityRouteHistorySnapshot",{timeout:30000})(request);
 if(!current())throw Error("account_changed");return validateRouteHistorySnapshot(result.data,request,previous);
}
