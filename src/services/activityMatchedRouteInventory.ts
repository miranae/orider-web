import { httpsCallable } from 'firebase/functions';
import type { ActivityMatchedRouteGroupRequest, ActivityMatchedRouteGroupResponse } from '@shared/activity-matched-route-groups';
import type { FirebaseServices } from '../contexts/FirebaseServicesContext';
import { observedRouteAvailable, validCanonicalAverage } from './activityRouteEvidence';
import { matchesAnalysisCapability } from "./analysisCapability";
export type ActivityMatchedRouteInventoryRequest = Omit<ActivityMatchedRouteGroupRequest, 'mode' | 'cursor'> & { mode: 'matched_route_inventory_page' };
export type ActivityMatchedRouteInventoryResponse = ActivityMatchedRouteGroupResponse & { mode: 'matched_route_inventory_page'; inventory: NonNullable<ActivityMatchedRouteGroupResponse['inventory']> };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v,k));
const count = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(v);
const cursor = (v: unknown): v is string => typeof v === 'string' && v.length <= 2800 && /^mrgi1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(v);
export function validActivityMatchedRouteInventoryRequest(v: unknown): v is ActivityMatchedRouteInventoryRequest {
 return object(v) && exact(v,['mode','anchorActivityId','discipline',...('geometryPolicy' in v?['geometryPolicy']:[]),...('year' in v?['year']:[]),...('inventoryCursor' in v?['inventoryCursor']:[])])
  && v.mode==='matched_route_inventory_page' && id(v.anchorActivityId) && ['bike','run'].includes(String(v.discipline))
  && (!('geometryPolicy' in v)||['complete','observed_native'].includes(String(v.geometryPolicy)))
  && (!('year' in v)||count(v.year,9999)&&v.year>=1970)
  && (!('inventoryCursor' in v)||cursor(v.inventoryCursor));
}
export function validateActivityMatchedRouteInventoryResponse(value: unknown, request: ActivityMatchedRouteInventoryRequest, now=Date.now()): ActivityMatchedRouteInventoryResponse {
 const invalid=():never=>{throw new Error('invalid_matched_route_inventory_response');};
 if (!validActivityMatchedRouteInventoryRequest(request)||!exact(value,['mode','anchorActivityId','discipline','state','readTime','expiresAt','groupToken','nextCursor','scope','coverage','inventory','omittedCounts','members','summary','io',...(object(value)&&'ownerHistoryReadiness' in value?['ownerHistoryReadiness']:[])])) invalid();
 const r=value as ActivityMatchedRouteInventoryResponse;
 if ('ownerHistoryReadiness' in r) {
  const h=r.ownerHistoryReadiness;
  if(!exact(h,['state','asOf','scanned','indexed','missing','unknown','consistency','personalBest'])
   || !['scanning','traversed','invalidated'].includes(String(h.state)) || !count(h.asOf,now)
   || ![h.scanned,h.indexed,h.missing,h.unknown].every(v=>count(v,Number.MAX_SAFE_INTEGER))
   || Number(h.indexed)+Number(h.missing)!==h.scanned || Number(h.unknown)>Number(h.scanned)
   || h.consistency!=='current_owner_seek_pages' || h.personalBest!=='unavailable') invalid();
 }
 if(r.mode!==request.mode||r.anchorActivityId!==request.anchorActivityId||r.discipline!==request.discipline||!['available','index_missing','anchor_unsupported','changed_input','expired','budget_partial'].includes(r.state)
  || !exact(r.readTime,['seconds','nanoseconds'])||!count(r.readTime.seconds,253402300799)||!count(r.readTime.nanoseconds,999999999)||r.readTime.nanoseconds%1000!==0
  || r.readTime.seconds*1000+r.readTime.nanoseconds/1e6>now||r.expiresAt!==r.readTime.seconds*1000+Math.floor(r.readTime.nanoseconds/1e6)+1800000
  ||r.groupToken!==null||r.nextCursor!==null||r.summary!==null) invalid();
 if(r.state!=='expired'&&now>=r.expiresAt)throw new Error('matched_route_inventory_expired');
 if(!exact(r.scope,['kind','indexQueryPolicy','groupPolicy','descriptorLimit','validatedLimit'])||r.scope.kind!=='bounded_owner_stored_index_inventory'||r.scope.indexQueryPolicy!=='document_id_continuation_v1'||r.scope.groupPolicy!=='anchor-pair-observation-v1'||r.scope.descriptorLimit!==5||r.scope.validatedLimit!==6
  ||!exact(r.inventory,['nextCursor','exhausted','scannedCount','year','matchingBasis'])||r.inventory.matchingBasis!=='anchor_pairwise'||r.inventory.year!==(request.year??null)||typeof r.inventory.exhausted!=='boolean'||!count(r.inventory.scannedCount,5)
  ||r.inventory.nextCursor!==null&&(!cursor(r.inventory.nextCursor)||r.inventory.nextCursor===request.inventoryCursor||r.inventory.scannedCount===0)
  ||r.inventory.exhausted&&r.inventory.nextCursor!==null||r.state==='available'&&r.inventory.exhausted!==(r.inventory.nextCursor===null))invalid();
 if(!exact(r.coverage,['indexCohort','sourceValidation','wholeHistory','geometry','gpsAccuracy','deduplication'])||r.coverage.wholeHistory!=='unknown'||r.coverage.gpsAccuracy!=='unknown'||r.coverage.deduplication!=='unknown'
  ||!['exhausted','descriptor_capped','not_inspected'].includes(r.coverage.indexCohort)||!['complete_in_cohort','validation_capped','omitted','not_inspected'].includes(r.coverage.sourceValidation)
  ||!['unavailable',request.geometryPolicy==='observed_native'?'observed_gap_free_coverage_unproven':'observed_complete_gap_free'].includes(r.coverage.geometry)
  ||!exact(r.omittedCounts,['unsupportedDescriptor','partialGeometry','gapGeometry','changedSource','validationCap','nonAnchorCluster'])||!Object.values(r.omittedCounts).every(v=>count(v,20))
  ||!exact(r.io,['logicalDocuments','metadataRequests','descriptorComparisons','rawDownloads','writes'])||!count(r.io.logicalDocuments,200)||!count(r.io.metadataRequests,40)||!count(r.io.descriptorComparisons,5)||r.io.rawDownloads!==0||r.io.writes!==0)invalid();
 if(!Array.isArray(r.members)||r.members.length>5||r.members.length>r.inventory.scannedCount||new Set(r.members.map(m=>m?.activityId)).size!==r.members.length)invalid();
 for(const m of r.members){
  if(!exact(m,['activityId','startTime','year','isAnchor','canonicalAverage','rankingEligible','rankingExclusionReason'])||!id(m.activityId)||m.activityId===request.anchorActivityId||m.isAnchor!==false||m.rankingEligible!==false||m.rankingExclusionReason!=='inventory_discovery_only'
   ||!count(m.startTime,now)||m.startTime<=0||!count(m.year,9999)||m.year!==new Date(m.startTime+32400000).getUTCFullYear()||request.year!==undefined&&m.year!==request.year
   ||!validCanonicalAverage(m.canonicalAverage,{includeCanonicalAverage:true,startTime:m.startTime,discipline:request.discipline}))invalid();
 }
 if(r.state!=='available'&&(r.members.length||r.inventory.nextCursor)||new TextEncoder().encode(JSON.stringify(value)).byteLength>65536)invalid();
 return r;
}
export function validateMatchedRouteInventoryAppend(pages: readonly ActivityMatchedRouteInventoryResponse[], response: ActivityMatchedRouteInventoryResponse) {
 const first=pages[0],last=pages[pages.length-1],invalid=()=>{throw new Error('matched_route_inventory_continuity');};
 if(first&&(!last?.inventory.nextCursor||['anchorActivityId','discipline','mode','readTime','expiresAt','scope'].some(k=>JSON.stringify(first[k as keyof typeof first])!==JSON.stringify(response[k as keyof typeof response]))||first.inventory.year!==response.inventory.year))invalid();
 const ids=pages.flatMap(p=>p.members.map(m=>m.activityId)).concat(response.members.map(m=>m.activityId));
 if(new Set(ids).size!==ids.length||response.inventory.nextCursor&&pages.some(p=>p.inventory.nextCursor===response.inventory.nextCursor))invalid();
}
export async function loadActivityMatchedRouteInventory(services: FirebaseServices,uid:string,request:ActivityMatchedRouteInventoryRequest){
 const auth=services.auth,app=auth.app,viewer=auth.currentUser,functions=services.functions;
 const current=()=>!!uid&&!!viewer&&!viewer.isAnonymous&&viewer.uid===uid&&services.auth===auth&&auth.app===app
  &&auth.currentUser===viewer&&services.functions===functions&&functions.app===app;
 if(!current())throw new Error('account_changed');
 if(!observedRouteAvailable() || !matchesAnalysisCapability(services, "routes"))throw new Error('matched_route_inventory_unsupported');
 if(!validActivityMatchedRouteInventoryRequest(request))throw new Error('invalid_matched_route_inventory_request');
 await services.ensureAppCheckReady();
  if (!current()) throw new Error("account_changed");
  if (!matchesAnalysisCapability(services, "routes")) throw new Error("route_not_supported");
 const response=await httpsCallable<ActivityMatchedRouteInventoryRequest,unknown>(services.functions,'getActivityStreams')(request);
 if(!current())throw new Error('account_changed');if (!matchesAnalysisCapability(services, "routes")) throw new Error("route_not_supported");
  return validateActivityMatchedRouteInventoryResponse(response.data,request);
}
