import {beforeEach,expect,it,vi} from 'vitest';
import type {ActivityDiscoveryItem} from '@shared/activity-discovery';
import { BUNDLED_FUNCTIONS_BASES, BUNDLED_AI_BASES, type RuntimeConfig } from './runtimeConfig';
import type {FirebaseServices} from '../contexts/FirebaseServicesContext';
import {loadActivityDiscovery,mapDiscoveryActivity} from './activityDiscovery';
import {activityFeedSourceRevision,resolveActivityMemo} from './activityFeedContent';
import * as errorLogger from './errorLogger';
const mocks=vi.hoisted(()=>({call:vi.fn(),ready:vi.fn(),getFunctions:vi.fn(()=>({kind:'regional'})),callable:vi.fn(),config:{appEnvironment:'stage'} as RuntimeConfig}));
vi.mock('firebase/functions',()=>({getFunctions:mocks.getFunctions,httpsCallable:(...args:unknown[])=>{mocks.callable(...args);return mocks.call;},connectFunctionsEmulator:vi.fn()}));
vi.mock('./runtimeConfig',async importOriginal=>{const actual=await importOriginal<typeof import('./runtimeConfig')>();return{...actual,getRuntimeConfig:()=>mocks.config,isEmulatorRuntime:()=>false,isFunctionsGatewayRuntime:()=>actual.isFunctionsGatewayRuntime(mocks.config)};});
const viewer={uid:'owner',isAnonymous:false};
const app={name:'embedded-discovery',options:{projectId:'miranae-orider-g1'}};
const services={auth:{app,currentUser:viewer},functions:{app},ensureAppCheckReady:mocks.ready} as unknown as FirebaseServices;
function item():ActivityDiscoveryItem{return{viewerHasKudos:false,presentationRevision:'a'.repeat(64),activity:{id:'ride',userId:'owner',nickname:'Synthetic',profileImage:null,type:'Ride',discipline:'bike',source:'orider',startTime:1,endTime:600001,createdAt:1,description:'Ride',visibility:'everyone',photoCount:0,kudosCount:1,commentCount:0,externalId:null,summary:{distance:99999,ridingTimeMillis:600000,averageSpeed:12,elevationGain:99},summarySource:'recorded',effectiveFacts:{source:'activity_metrics',status:'ready',inputRevision:'a',computedAt:1,coverage:'partial_terminal',thresholdBasis:null,powerSource:null,metrics:{distanceKm:6,durationSec:600,movingTimeSec:500,elevationGainM:null,avgSpeedKph:36}}},content:{status:'ready',memo:'memo',memoTruncated:false,photos:[],totalPhotoCount:0,totalPhotoCountExact:true},mapPreview:{imageUrl:null,encodedPolyline:null}};}
function page(){return{items:[item()],nextCursor:null,exhausted:true,scannedCount:1,totalCount:null,expiresAt:Date.now()+600000,order:'startTime_desc',includesUndated:false,consistency:'current_authorized_seek_pages'};}
beforeEach(()=>{vi.clearAllMocks();mocks.config={appEnvironment:'stage'};(services.auth as {app:unknown}).app=app;(services.auth as {currentUser:unknown}).currentUser=viewer;mocks.ready.mockResolvedValue(undefined);mocks.call.mockResolvedValue({data:page()});});
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
 const pending=loadActivityDiscovery(services,{scope:'all'}),rejected=expect(pending).rejects.toThrow('request_timeout');
 await vi.advanceTimersByTimeAsync(15000);await rejected;ready();await Promise.resolve();expect(mocks.call).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
it('rejects same-uid session replacement while awaiting AppCheck before dispatch',async()=>{
 mocks.ready.mockImplementation(async()=>{(services.auth as {currentUser:unknown}).currentUser={...viewer};});
 await expect(loadActivityDiscovery(services,{scope:'all'})).rejects.toThrow('account_changed');expect(mocks.call).not.toHaveBeenCalled();
});

it('does not let a late login supply the credentials for an approved guest continuation', async () => {
 bundled('development');
 const auth = { app, currentUser: null as FirebaseServices['auth']['currentUser'] };
 const embedded = { ...services, scope: 'embedded' as const, auth: auth as FirebaseServices['auth'],
  getAppCheckToken: vi.fn().mockResolvedValue('embedded-check'), isSessionApproved: () => auth.currentUser === null };
 const unapproved = { uid: 'late-viewer', getIdToken: vi.fn() };
 const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
  auth.currentUser = unapproved as never;
  return Response.json({ result: page() });
 });
 try {
  await expect(loadActivityDiscovery(embedded, { scope: 'athlete', targetUid: 'owner', cursor: 'ad1.next' })).rejects.toThrow('account_changed');
  expect(request).toHaveBeenCalledWith(`${BUNDLED_FUNCTIONS_BASES.development}/getActivityDiscovery`, expect.objectContaining({
   credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': 'embedded-check' },
   body: expect.stringContaining('ad1.next'),
  }));
  expect(unapproved.getIdToken).not.toHaveBeenCalled();
  expect(mocks.call).not.toHaveBeenCalled();
 } finally { request.mockRestore(); }
});

it('records transport failures and preserves permission errors from non-JSON gateway responses', async () => {
 bundled('development');
 const embedded = { ...services, scope: 'embedded' as const,
  auth: { ...services.auth, currentUser: null }, isSessionApproved: () => true,
  getAppCheckToken: vi.fn().mockResolvedValue('embedded-check') };
 const request = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('network failed'))
  .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
  .mockResolvedValueOnce(Response.json({ error: { status: 'UNAUTHENTICATED' } }, { status: 401 }))
  .mockResolvedValueOnce(Response.json({ error: { status: ['PERMISSION_DENIED'] } }, { status: 403 }))
  .mockResolvedValueOnce(Response.json({ result: {} }));
 const report = vi.spyOn(errorLogger, 'logClientError').mockImplementation(() => undefined);
 try {
  await expect(loadActivityDiscovery(embedded, { scope: 'athlete', targetUid: 'owner' })).rejects.toThrow('network failed');
  await expect(loadActivityDiscovery(embedded, { scope: 'athlete', targetUid: 'owner' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
  await expect(loadActivityDiscovery(embedded, { scope: 'athlete', targetUid: 'owner' })).rejects.toMatchObject({ code: 'functions/unauthenticated' });
  await expect(loadActivityDiscovery(embedded, { scope: 'athlete', targetUid: 'owner' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
  await expect(loadActivityDiscovery(embedded, { scope: 'athlete', targetUid: 'owner' })).rejects.toThrow('invalid_activity_discovery');
  expect(report.mock.calls.map(([, , context]) => context)).toEqual([
   { route: 'getActivityDiscovery', phase: 'transport', status: undefined },
   { route: 'getActivityDiscovery', phase: 'body', status: 403 },
   { route: 'getActivityDiscovery', phase: 'http', status: 401 },
   { route: 'getActivityDiscovery', phase: 'http', status: 403 },
   { route: 'getActivityDiscovery', phase: 'contract', status: undefined },
  ]);
  expect(report.mock.calls.map(call => call[5])).toEqual([
   'getActivityDiscovery:transport:', 'getActivityDiscovery:body:403', 'getActivityDiscovery:http:401',
   'getActivityDiscovery:http:403', 'getActivityDiscovery:contract:',
  ]);
 } finally { request.mockRestore(); report.mockRestore(); }
});

it('records embedded App Check rejection and separately records token readiness timeouts', async () => {
 bundled('development');
 const check = vi.fn().mockRejectedValueOnce(new Error('mock-check-failed'));
 const embedded = { ...services, scope: 'embedded' as const,
  auth: { ...services.auth, currentUser: null }, isSessionApproved: () => true, getAppCheckToken: check };
 const report = vi.spyOn(errorLogger, 'logClientError').mockImplementation(() => undefined);
 const request = vi.spyOn(globalThis, 'fetch');
 try {
  await expect(loadActivityDiscovery(embedded, { scope: 'all' })).rejects.toThrow('mock-check-failed');
  vi.useFakeTimers();
  let resolveCheck!: (token: string) => void;
  check.mockImplementationOnce(() => new Promise<string>(resolve => { resolveCheck = resolve; }));
  const timedOut = expect(loadActivityDiscovery(embedded, { scope: 'all' })).rejects.toThrow('request_timeout');
  await vi.advanceTimersByTimeAsync(15000);
  await timedOut;
  resolveCheck('late-check');
  await Promise.resolve();
  expect(request).not.toHaveBeenCalled();
  expect(report.mock.calls.map(([, , context]) => context)).toEqual([
   { route: 'getActivityDiscovery', phase: 'app-check', status: undefined },
   { route: 'getActivityDiscovery', phase: 'timeout', status: undefined },
  ]);
 } finally { vi.useRealTimers(); report.mockRestore(); request.mockRestore(); }
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

it('preserves exact current viewer membership independently from avatar previews',async()=>{
 const p=page();p.items[0]!.viewerHasKudos=true;mocks.call.mockResolvedValue({data:p});
 expect((await loadActivityDiscovery(services,{scope:'all'})).items[0]!.viewerHasKudos).toBe(true);
 p.items[0]!.viewerHasKudos=false;mocks.call.mockResolvedValue({data:p});
 expect((await loadActivityDiscovery(services,{scope:'all'})).items[0]!.viewerHasKudos).toBe(false);
});

function bundled(environment:'development'|'production') {
 const base=BUNDLED_FUNCTIONS_BASES[environment];
 mocks.config={appEnvironment:'production',deploymentProfile:`bundled-${environment}`,firebaseProjectId:'miranae-orider-g1',firebaseFunctionsRegion:'asia-northeast3',firebaseFunctionsBase:base,socialAuthFunctionsBase:base,personalApiBase:base,publicClubApiUrl:`${base}/publicClubs`,aiApiBase:BUNDLED_AI_BASES[environment]};
}
it.each(['development','production'] as const)('keeps embedded athlete first and continuation pages on the injected %s gateway',async environment=>{
 bundled(environment);
 const first={...page(),nextCursor:'ad1.continuation',exhausted:false};
 mocks.call.mockResolvedValueOnce({data:first}).mockResolvedValueOnce({data:page()});
 const result=await loadActivityDiscovery(services,{scope:'athlete',targetUid:'athlete',limit:20});
 await loadActivityDiscovery(services,{scope:'athlete',targetUid:'athlete',limit:20,cursor:result.nextCursor!});
 expect(mocks.getFunctions).not.toHaveBeenCalled();
 expect(mocks.callable.mock.calls).toEqual([[services.functions,'getActivityDiscovery',{timeout:10000}],[services.functions,'getActivityDiscovery',{timeout:10000}]]);
 expect(mocks.call.mock.calls[1]![0]).toMatchObject({scope:'athlete',targetUid:'athlete',cursor:'ad1.continuation'});
});
it.each([['development','account'],['development','app'],['production','account'],['production','app']] as const)('rejects late bundled %s continuation after %s replacement',async(environment,replacement)=>{
 bundled(environment);
 mocks.call.mockResolvedValueOnce({data:{...page(),nextCursor:'ad1.next',exhausted:false}});
 const first=await loadActivityDiscovery(services,{scope:'athlete',targetUid:'athlete'});
 let finish!:(response:{data:ReturnType<typeof page>})=>void;
 mocks.call.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=loadActivityDiscovery(services,{scope:'athlete',targetUid:'athlete',cursor:first.nextCursor!});
 const rejected=expect(pending).rejects.toThrow('account_changed');
 await vi.waitFor(()=>expect(mocks.call).toHaveBeenCalledTimes(2));
 if(replacement==='account')(services.auth as {currentUser:unknown}).currentUser={...viewer};
 else(services.auth as {app:unknown}).app={name:'replacement-app'};
 finish({data:page()});await rejected;
 expect(mocks.getFunctions).not.toHaveBeenCalled();
 expect(mocks.callable).toHaveBeenLastCalledWith(services.functions,'getActivityDiscovery',{timeout:10000});
});
