import {beforeEach,expect,it,vi} from 'vitest';
import type {ActivityDiscoveryItem} from '@shared/activity-discovery';
import type {FirebaseServices} from '../contexts/FirebaseServicesContext';
import {loadActivityDiscovery,mapDiscoveryActivity} from './activityDiscovery';
import {activityFeedSourceRevision,resolveActivityMemo} from './activityFeedContent';
const mocks=vi.hoisted(()=>({call:vi.fn(),ready:vi.fn()}));
vi.mock('firebase/functions',()=>({getFunctions:()=>({}),httpsCallable:()=>mocks.call,connectFunctionsEmulator:vi.fn()}));
vi.mock('./runtimeConfig',()=>({getRuntimeConfig:()=>({appEnvironment:'stage'}),isEmulatorRuntime:()=>false}));
const viewer={uid:'owner',isAnonymous:false};
const services={auth:{currentUser:viewer},functions:{app:{}},ensureAppCheckReady:mocks.ready} as unknown as FirebaseServices;
function item():ActivityDiscoveryItem{return{presentationRevision:'a'.repeat(64),activity:{id:'ride',userId:'owner',nickname:'Synthetic',profileImage:null,type:'Ride',discipline:'bike',source:'orider',startTime:1,endTime:600001,createdAt:1,description:'Ride',visibility:'everyone',photoCount:0,kudosCount:1,commentCount:0,externalId:null,summary:{distance:99999,ridingTimeMillis:600000,averageSpeed:12,elevationGain:99},summarySource:'recorded',effectiveFacts:{source:'activity_metrics',status:'ready',inputRevision:'a',computedAt:1,coverage:'partial_terminal',thresholdBasis:null,powerSource:null,metrics:{distanceKm:6,durationSec:600,movingTimeSec:500,elevationGainM:null,avgSpeedKph:36}}},content:{status:'ready',memo:'memo',memoTruncated:false,photos:[],totalPhotoCount:0,totalPhotoCountExact:true},mapPreview:{imageUrl:null,encodedPolyline:null}};}
function page(){return{items:[item()],nextCursor:null,exhausted:true,scannedCount:1,totalCount:null,expiresAt:Date.now()+600000,order:'startTime_desc',includesUndated:false,consistency:'current_authorized_seek_pages'};}
beforeEach(()=>{vi.clearAllMocks();(services.auth as {currentUser:unknown}).currentUser=viewer;mocks.ready.mockResolvedValue(undefined);mocks.call.mockResolvedValue({data:page()});});
it('maps canonical units and preserves unknowns without raw fallback or private training inference',()=>{
 const result=mapDiscoveryActivity(item());expect(result.summary.distance).toBe(6000);expect(result.summary.ridingTimeMillis).toBe(600000);expect(result.summary.movingTimeSec).toBe(500);expect(result.summary.elevationGain).toBeNaN();expect(result.summary.tss).toBeNull();expect(result.summary.averageHeartRate).toBeNull();expect(result.feedContentV1?.sourceRevision).toBe(activityFeedSourceRevision(result));
 const next=item();next.presentationRevision='b'.repeat(64);expect(activityFeedSourceRevision(mapDiscoveryActivity(next))).not.toBe(activityFeedSourceRevision(result));
});
it('uses recorded public facts only when canonical metrics are absent',()=>{const v=item();v.activity.effectiveFacts.metrics=null;expect(mapDiscoveryActivity(v).summary.distance).toBe(99999);});
it('calls the real named transport and permits empty pages with continuation',async()=>{const p=page();p.items=[];p.nextCursor='ad1.signed' as never;p.exhausted=false;p.scannedCount=50;mocks.call.mockResolvedValue({data:p});const result=await loadActivityDiscovery(services,{scope:'groupRide',rideId:'ride',limit:20});expect(result.items).toEqual([]);expect(result.nextCursor).toBe('ad1.signed');expect(mocks.call).toHaveBeenCalledWith({scope:'groupRide',rideId:'ride',limit:20});});
it('discards a late response when the SDK session changes even to the same uid',async()=>{mocks.call.mockImplementation(async()=>{(services.auth as {currentUser:unknown}).currentUser={...viewer};return{data:page()};});await expect(loadActivityDiscovery(services,{scope:'all'})).rejects.toThrow('account_changed');});
it('rejects duplicate items or private context in a malformed response',async()=>{const p=page();p.items.push(item());mocks.call.mockResolvedValue({data:p});await expect(loadActivityDiscovery(services,{scope:'all'})).rejects.toThrow('invalid_activity_discovery');const q=page();q.items[0]!.activity.effectiveFacts.thresholdBasis={ftp:300} as never;mocks.call.mockResolvedValue({data:q});await expect(loadActivityDiscovery(services,{scope:'all'})).rejects.toThrow('invalid_activity_discovery');});

it('preserves validated generated summary metadata while authored memo stays first',()=>{
 const v=item();v.generatedSummary={text:{ko:'자동 요약',en:'Generated summary'},formatterVersion:'v1',inputDigest:'c'.repeat(64)};
 const authored=mapDiscoveryActivity(v);expect(resolveActivityMemo(authored,'ko')?.memo).toBe('memo');
 v.content={status:'ready',memo:null,memoTruncated:false,photos:[],totalPhotoCount:0,totalPhotoCountExact:true};
 const generated=mapDiscoveryActivity(v);expect(resolveActivityMemo(generated,'ko')?.memo).toBe('자동 요약');expect(generated.defaultSummaryV1?.inputDigest).toBe('c'.repeat(64));
});
it('requires server anchor admission for co-rider discovery',async()=>{
 await expect(loadActivityDiscovery(services,{scope:'groupRide',rideId:'r',anchorActivityId:'anchor'})).rejects.toThrow('invalid_activity_discovery');
 const p=page();p.items[0]!.anchorBoundCoRider=true;mocks.call.mockResolvedValue({data:p});await expect(loadActivityDiscovery(services,{scope:'groupRide',rideId:'r',anchorActivityId:'anchor'})).resolves.toMatchObject({items:[{id:'ride'}]});
});
it('accepts an id inventory with a date window excluding undated rows',async()=>{
 const p={...page(),order:'id_asc',includesUndated:false};mocks.call.mockResolvedValue({data:p});await expect(loadActivityDiscovery(services,{scope:'athlete',targetUid:'owner',order:'id_asc',fromInclusive:1})).resolves.toMatchObject({includesUndated:false});
});
it('never dispatches after readiness resolves for an aborted request',async()=>{
 let ready!:()=>void;mocks.ready.mockImplementation(()=>new Promise<void>(done=>{ready=done;}));
 const controller=new AbortController(),pending=loadActivityDiscovery(services,{scope:'all'},controller.signal);
 const rejected=expect(pending).rejects.toThrow('request_aborted');controller.abort();await rejected;ready();await Promise.resolve();expect(mocks.call).not.toHaveBeenCalled();
});
it('bounds readiness and rejects late dispatch at the total deadline',async()=>{
 vi.useFakeTimers();try{let ready!:()=>void;mocks.ready.mockImplementation(()=>new Promise<void>(done=>{ready=done;}));
 const pending=loadActivityDiscovery(services,{scope:'all'}),rejected=expect(pending).rejects.toThrow('request_aborted');
 await vi.advanceTimersByTimeAsync(15000);await rejected;ready();await Promise.resolve();expect(mocks.call).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
it('rejects same-uid session replacement while awaiting AppCheck before dispatch',async()=>{
 mocks.ready.mockImplementation(async()=>{(services.auth as {currentUser:unknown}).currentUser={...viewer};});
 await expect(loadActivityDiscovery(services,{scope:'all'})).rejects.toThrow('account_changed');expect(mocks.call).not.toHaveBeenCalled();
});

it('keeps an unrecorded TCX distance unknown before and after metrics, while preserving recorded zero',()=>{
 const v=item();v.activity.summary.distance=null;v.activity.effectiveFacts.metrics=null;
 expect(mapDiscoveryActivity(v).summary.distance).toBeNaN();
 v.activity.effectiveFacts.metrics={distanceKm:null,durationSec:600};
 expect(mapDiscoveryActivity(v).summary.distance).toBeNaN();
 v.activity.summary.distance=0;
 expect(mapDiscoveryActivity(v).summary.distance).toBeNaN();
 v.activity.effectiveFacts.metrics=null;
 expect(mapDiscoveryActivity(v).summary.distance).toBe(0);
 v.activity.effectiveFacts.metrics={distanceKm:0,durationSec:600};
 expect(mapDiscoveryActivity(v).summary.distance).toBe(0);
});
