import { resetRuntimeConfigForTests } from "./runtimeConfig";
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type { FirebaseServices } from '../contexts/FirebaseServicesContext';
import {routeInventoryPage,inventoryNow} from '../__tests__/fixtures/routeInventory';
import {validActivityMatchedRouteInventoryRequest,validateActivityMatchedRouteInventoryResponse,validateMatchedRouteInventoryAppend,loadActivityMatchedRouteInventory} from './activityMatchedRouteInventory';
const transport=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('firebase/functions',()=>({httpsCallable:()=>transport.call}));
vi.mock('./activityRouteEvidence',async original=>({...await original<typeof import('./activityRouteEvidence')>(),observedRouteAvailable:()=>true}));
vi.mock('./localTrainingEmulator',()=>({localTrainingEmulatorAvailable:()=>false,matchesLocalTrainingEmulator:()=>false}));
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(inventoryNow);transport.call.mockReset().mockResolvedValue({data:routeInventoryPage()});});
afterEach(()=>vi.restoreAllMocks());
function source(){const app={name:'stage',options:{projectId:'miranae-orider-g1'}};return {auth:{app,currentUser:{uid:'owner',isAnonymous:false}},functions:{region:'asia-northeast3',app,customDomain:'https://asia-northeast3-orider-dev.cloudfunctions.net'},ensureAppCheckReady:vi.fn().mockResolvedValue(undefined)} as unknown as FirebaseServices;}
const request={mode:'matched_route_inventory_page' as const,anchorActivityId:'anchor',discipline:'bike' as const,geometryPolicy:'observed_native' as const};
it('accepts observational history counts without upgrading personal best coverage',()=>{
 const page=routeInventoryPage();
 page.ownerHistoryReadiness={state:'traversed',asOf:inventoryNow,scanned:12,indexed:9,missing:3,unknown:12,consistency:'current_owner_seek_pages',personalBest:'unavailable'};
 expect(validateActivityMatchedRouteInventoryResponse(page,request,inventoryNow)).toBe(page);
 expect(page.coverage.wholeHistory).toBe('unknown');
 for(const patch of [{personalBest:'available'},{scanned:11},{unknown:13},{indexed:-1},{asOf:inventoryNow+1},{extra:'untrusted'},{state:'complete'}]) {
  expect(()=>validateActivityMatchedRouteInventoryResponse({...page,ownerHistoryReadiness:{...page.ownerHistoryReadiness,...patch}},request,inventoryNow)).toThrow('invalid_matched_route_inventory_response');
 }
});
it('accepts empty discovered pages with continuation without implying exhaustive history',()=>{
 const page=routeInventoryPage({more:true,ids:[]});
 expect(validateActivityMatchedRouteInventoryResponse(page,request,inventoryNow)).toBe(page);
 expect(page.coverage.wholeHistory).toBe('unknown');
});
it.each([{cursor:'mrgg1.'+'a'.repeat(40)},{inventoryCursor:'mrgg1.'+'a'.repeat(40)},{year:2026.5},{year:1969}])('rejects mixed cursor contracts and invalid year %j',patch=>{
 expect(validActivityMatchedRouteInventoryRequest({...request,...patch})).toBe(false);
});
it('rejects ranking escalation, wrong year, raw IO and forged totals',()=>{
 for(const mutate of [(p:ReturnType<typeof routeInventoryPage>)=>{p.members[0]!.rankingEligible=true;},(p:ReturnType<typeof routeInventoryPage>)=>{p.members[0]!.year=2025;},(p:ReturnType<typeof routeInventoryPage>)=>{p.io.rawDownloads=1 as 0;},(p:ReturnType<typeof routeInventoryPage>)=>{p.summary={} as never;}]){
  const page=routeInventoryPage();mutate(page);expect(()=>validateActivityMatchedRouteInventoryResponse(page,request,inventoryNow)).toThrow('invalid_matched_route_inventory_response');
 }
 const page=routeInventoryPage({year:2025});expect(()=>validateActivityMatchedRouteInventoryResponse(page,{...request,year:2025},inventoryNow)).toThrow();
});
it('binds continuation to fixed snapshot, year and unique rows',()=>{
 const first=routeInventoryPage({more:true}),next=routeInventoryPage({ids:['ride-b']});
 expect(()=>validateMatchedRouteInventoryAppend([first],next)).not.toThrow();
 expect(()=>validateMatchedRouteInventoryAppend([first],routeInventoryPage())).toThrow('continuity');
 next.readTime.seconds++;expect(()=>validateMatchedRouteInventoryAppend([first],next)).toThrow('continuity');
});
it('expires rows rather than accepting a stale snapshot',()=>{
 expect(()=>validateActivityMatchedRouteInventoryResponse(routeInventoryPage(),request,inventoryNow+1800001)).toThrow('matched_route_inventory_expired');
});

it.each(['same-uid','different-uid','app'])('does not dispatch when %s changes during AppCheck readiness',async kind=>{
 const services=source();let release!:()=>void;
 services.ensureAppCheckReady=()=>new Promise<void>(resolve=>{release=resolve;});
 const pending=loadActivityMatchedRouteInventory(services,'owner',request);
 if(kind==='app')Object.assign(services.auth,{app:{name:'stage'}});
 else Object.assign(services.auth,{currentUser:{uid:kind==='same-uid'?'owner':'other',isAnonymous:false}});
 release();await expect(pending).rejects.toThrow('account_changed');expect(transport.call).not.toHaveBeenCalled();
});
it('rejects an in-flight response after replacement by a new SDK user with the same UID',async()=>{
 const services=source();let resolve!:(v:unknown)=>void;
 transport.call.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const pending=loadActivityMatchedRouteInventory(services,'owner',request);
 await Promise.resolve();
 Object.assign(services.auth,{currentUser:{uid:'owner',isAnonymous:false}});
 resolve({data:routeInventoryPage()});await expect(pending).rejects.toThrow('account_changed');
});
it('still returns the validated page for an unchanged SDK session',async()=>{
 await expect(loadActivityMatchedRouteInventory(source(),'owner',request)).resolves.toMatchObject({mode:'matched_route_inventory_page'});
 expect(transport.call).toHaveBeenCalledOnce();
});

beforeEach(() => resetRuntimeConfigForTests({ appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1", firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net" }));
