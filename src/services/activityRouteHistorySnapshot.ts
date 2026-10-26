import { httpsCallable } from "firebase/functions";
import type { RouteHistorySnapshotRequest, RouteHistorySnapshotResponse, RouteHistorySavedRequest, RouteHistorySavedResponse } from "@shared/activity-route-history-snapshot";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { observedRouteAvailable } from "./activityRouteEvidence";
import { matchesAnalysisCapability } from "./analysisCapability";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const timestamp=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0&&v<=8640000000000000;
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(v);
export function validateRouteHistorySnapshot(value: unknown, request: RouteHistorySnapshotRequest, previous?: RouteHistorySnapshotResponse): RouteHistorySnapshotResponse {
 const fail = (): never => { throw Error("invalid_route_history_response"); };
 if (!object(value)) fail();
 const r = value as unknown as RouteHistorySnapshotResponse;
 if (!/^[a-f0-9-]{36}$/.test(r.runId) || !count(r.version) || !["scanning","identity","reducing","complete","invalidated","expired"].includes(r.state)
  || !timestamp(r.asOf) || !timestamp(r.expiresAt)
  || r.retention !== "saved_result" && (r.expiresAt < r.asOf || Math.abs(r.expiresAt-r.asOf-50*60000)>1)
  || r.scope !== "recorded_observations_at_snapshot" || r.physicalRideCompleteness !== "unknown"
  || ![r.scanned,r.excluded,r.unresolved,r.candidateCount].every(count)
  || !["in_progress","enumerated_at_read_time"].includes(r.wholeHistory)
  || !count(r.excluded+r.unresolved+r.candidateCount) || r.scanned!==r.excluded+r.unresolved+r.candidateCount
  || !["complete","expired"].includes(r.state)&&r.wholeHistory!=="in_progress") fail();
 if (r.retention !== undefined && !["saved_result","temporary_checkpoint"].includes(r.retention)
  || r.retention === "saved_result" && (r.state !== "complete" || r.resultFreshness !== "historical_as_of" || typeof r.currentSourceChanged !== "boolean")
  || r.resultFreshness !== undefined && r.resultFreshness !== "historical_as_of"
  || r.currentSourceChanged !== undefined && typeof r.currentSourceChanged !== "boolean") fail();
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
 if(!observedRouteAvailable() || !matchesAnalysisCapability(services, "routes"))throw Error("route_history_unsupported");
 if(!id(request.anchorActivityId)||!["bike","run"].includes(request.discipline))throw Error("invalid_route_history_request");
 await services.ensureAppCheckReady();
  if (!matchesAnalysisCapability(services, "routes")) throw new Error("route_not_supported");if(!current())throw Error("account_changed");
 const result=await httpsCallable<RouteHistorySnapshotRequest,unknown>(functions,"progressActivityRouteHistorySnapshot",{timeout:30000})(request);
 if(!current())throw Error("account_changed");if (!matchesAnalysisCapability(services, "routes")) throw new Error("route_not_supported");
  return validateRouteHistorySnapshot(result.data,request,previous);
}

export function validateRouteHistorySaved(value:unknown):RouteHistorySavedResponse {
 if(!object(value)||!Array.isArray(value.items)||value.items.length>20||!(value.nextCursor===null||typeof value.nextCursor==="string"&&value.nextCursor.length>0&&value.nextCursor.length<=256))throw Error("invalid_route_history_response");
 const ids=new Set<string>();
 for(const row of value.items){
  if(!object(row)||typeof row.runId!=="string"||!/^[a-f0-9-]{36}$/.test(row.runId)||ids.has(row.runId)||!timestamp(row.asOf)||!count(row.scanned)||!count(row.candidateCount)||row.candidateCount>row.scanned)throw Error("invalid_route_history_response");
  ids.add(row.runId);
 }
 return value as unknown as RouteHistorySavedResponse;
}
export async function loadRouteHistorySaved(services:FirebaseServices,uid:string,request:RouteHistorySavedRequest){
 const {auth,functions}=services,app=auth.app,viewer=auth.currentUser;
 const current=()=>!!viewer&&!viewer.isAnonymous&&viewer.uid===uid&&services.auth===auth&&auth.app===app&&auth.currentUser===viewer&&services.functions===functions&&functions.app===app;
 if(!current())throw Error("account_changed");
 if(!observedRouteAvailable()||!matchesAnalysisCapability(services,"routes"))throw Error("route_history_unsupported");
 if(!id(request.anchorActivityId)||!["bike","run"].includes(request.discipline)||request.cursor!==undefined&&(!request.cursor.length||request.cursor.length>256))throw Error("invalid_route_history_request");
 await services.ensureAppCheckReady();
 if(!current())throw Error("account_changed");
 if(!matchesAnalysisCapability(services,"routes"))throw Error("route_not_supported");
 const result=await httpsCallable<RouteHistorySavedRequest,unknown>(functions,"getActivityRouteHistorySaved",{timeout:30000})(request);
 if(!current())throw Error("account_changed");
 if(!matchesAnalysisCapability(services,"routes"))throw Error("route_not_supported");
 return validateRouteHistorySaved(result.data);
}
