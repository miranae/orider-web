import { webcrypto } from "node:crypto";
import { beforeEach, vi, expect, it } from "vitest";
import { overlayRequest, overlayResponse } from "./stageCyclingDistanceHistoryOverlay.fixture";
import { CYCLING_HISTORY_OVERLAY_SERVER_READ_LEAD_MS, safeCyclingHistoryOverlayTiming, validCyclingHistoryOverlayRequest, validateCyclingHistoryOverlayResponse } from "./stageCyclingDistanceHistoryOverlay";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
it("accepts20 original dense rows with exact owner/session/subset bindings and332 logical docs", async () => { const request = overlayRequest(20); const response = await overlayResponse(request); expect((await validateCyclingHistoryOverlayResponse(response, request, "owner")).evidence).toHaveLength(20); });
it.each(["path", "generation", "crc", "token", "witness", "vectors"])("rejects private nested %s fields rather than stripping them", async key => { const request = overlayRequest(); const response = await overlayResponse(request); Object.assign(response.evidence[0]!.row.representativeInput, { [key]: "private" }); await expect(validateCyclingHistoryOverlayResponse(response, request, "owner")).rejects.toThrow(); });
it("rejects response/private/session extras, cross-owner, projected twins and changed revisions", async () => { for (const mutate of [(r: Awaited<ReturnType<typeof overlayResponse>>) => Object.assign(r, { privatePath: "users/private" }), (r: Awaited<ReturnType<typeof overlayResponse>>) => Object.assign(r.session, { token: "private" }), (r: Awaited<ReturnType<typeof overlayResponse>>) => { r.evidence[0]!.activityRevision = "101:0"; }, (r: Awaited<ReturnType<typeof overlayResponse>>) => { r.evidence[0]!.row.efforts[0]!.canonicalActivityId = "twin"; }]) { const request = overlayRequest(); const response = await overlayResponse(request); mutate(response); await expect(validateCyclingHistoryOverlayResponse(response, request, "owner")).rejects.toThrow(); } const request = overlayRequest(); await expect(validateCyclingHistoryOverlayResponse(await overlayResponse(request), request, "other")).rejects.toThrow(); });
it("rejects session ABA, expiry, count overflow, changed ordered subset and nanos-order", async () => { const request = overlayRequest(); for (const mutate of [(r: Awaited<ReturnType<typeof overlayResponse>>) => { r.subsetBinding = "f".repeat(64); }, (r: Awaited<ReturnType<typeof overlayResponse>>) => { r.io.sourceDocs++; }, (r: Awaited<ReturnType<typeof overlayResponse>>) => { r.readTimes.sourceFinal = { ...r.readTimes.stageFinal, nanoseconds: 0 }; r.readTimes.stageFinal.nanoseconds = 1000; }]) { const response = await overlayResponse(request); mutate(response); await expect(validateCyclingHistoryOverlayResponse(response, request, "owner")).rejects.toThrow(); } const response = await overlayResponse(request); await expect(validateCyclingHistoryOverlayResponse(response, request, "owner", response.session.expiresAt)).rejects.toThrow(); await expect(validateCyclingHistoryOverlayResponse(response, { ...request, session: { ...response.session, ownerBinding: "f".repeat(64) } }, "owner")).rejects.toThrow(); });

const mocks = vi.hoisted(() => ({ call: vi.fn(), ready: vi.fn(), listener: null as null | ((user: unknown) => void) }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.call }));
vi.mock("firebase/auth", () => ({ onIdTokenChanged: (_: unknown, listener: (user: unknown) => void) => { mocks.listener = listener; return () => {}; } }));
vi.mock("./stageCyclingDistanceEffortPreference", () => ({ stageCyclingPreferenceAvailable: () => true }));
it("Native AppCheck readiness rejects request/private fields and sameUID replacement before dispatch", async () => {
 const { loadCyclingHistoryOverlay } = await import("./stageCyclingDistanceHistoryOverlay"); const app = { options: { projectId: "miranae-orider-g1" } }, services = { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: mocks.ready }; const typed = services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices;
 mocks.call.mockReset(); mocks.ready.mockReset().mockResolvedValue(undefined); const request = overlayRequest(); await expect(loadCyclingHistoryOverlay(typed, { ...request, ownerUid: "foreign" } as typeof request, new AbortController().signal)).rejects.toThrow("invalid_cycling_history_overlay_request");expect(mocks.ready).not.toHaveBeenCalled();expect(mocks.call).not.toHaveBeenCalled();
 mocks.ready.mockImplementation(async () => { services.auth.currentUser = { uid: "owner", isAnonymous: false }; }); await expect(loadCyclingHistoryOverlay(typed, request, new AbortController().signal)).rejects.toThrow("account_changed");expect(mocks.call).not.toHaveBeenCalled();
});
it("Native token ABA after dispatch discards the entire response", async () => { const { loadCyclingHistoryOverlay } = await import("./stageCyclingDistanceHistoryOverlay");const app = { options: { projectId: "miranae-orider-g1" } }, original = { uid: "owner", isAnonymous: false }, services = { auth: { app, currentUser: original }, functions: { app, customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" }, ensureAppCheckReady: mocks.ready };const request=overlayRequest(); mocks.ready.mockReset().mockResolvedValue(undefined);mocks.call.mockReset().mockImplementation(async () => { mocks.listener!(original);mocks.listener!({uid:"other",isAnonymous:false});mocks.listener!(original);return {data:await overlayResponse(request)}; });await expect(loadCyclingHistoryOverlay(services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices,request,new AbortController().signal)).rejects.toThrow("account_changed");expect(mocks.call).toHaveBeenCalledOnce(); });

it.each([
 ["session_binding", (r: Awaited<ReturnType<typeof overlayResponse>>) => { r.session.ownerBinding="f".repeat(64); }],
 ["read_times_order", (r: Awaited<ReturnType<typeof overlayResponse>>) => { r.readTimes.sourceFinal={...r.readTimes.sourceInitial}; }],
 ["activity_binding", (r: Awaited<ReturnType<typeof overlayResponse>>) => { r.evidence[0]!.activityRevision="101:0"; }],
 ["original_row_schema", (r: Awaited<ReturnType<typeof overlayResponse>>) => { Object.assign(r.evidence[0]!.row,{privateToken:"not-public"}); }],
 ["budget", (r: Awaited<ReturnType<typeof overlayResponse>>) => { r.io.sourceDocs++; }],
] as const)("reports only safe enum %s for decoder failure, preserving rejection", async (reason, mutate) => {
 const request=overlayRequest(),response=await overlayResponse(request);mutate(response);await expect(validateCyclingHistoryOverlayResponse(response,request,"owner")).rejects.toMatchObject({message:"invalid_cycling_history_overlay_response",overlayReason:reason});
});
it("transport preserves the safe decoder reason and never copies private response values", async () => {
 const {loadCyclingHistoryOverlay}=await import("./stageCyclingDistanceHistoryOverlay"),app={options:{projectId:"miranae-orider-g1"}},services={auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app,customDomain:"https://asia-northeast3-orider-dev.cloudfunctions.net"},ensureAppCheckReady:mocks.ready},request=overlayRequest();
 mocks.ready.mockReset().mockResolvedValue(undefined);mocks.call.mockReset().mockResolvedValue({data:{privateToken:"do-not-copy"}});
 const error=await loadCyclingHistoryOverlay(services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices,request,new AbortController().signal).catch(error=>error);
 expect(error).toMatchObject({message:"invalid_cycling_history_overlay_response",overlayReason:"response_shape"});expect(JSON.stringify(error)).not.toContain("do-not-copy");
});

it("validation samples the clock after a deferred RPC, not at request start", async () => {
 const {loadCyclingHistoryOverlay}=await import("./stageCyclingDistanceHistoryOverlay");let current=200000;const clock=vi.spyOn(Date,"now").mockImplementation(()=>current);
 try {
  const request=overlayRequest(1,current),response=await overlayResponse(request);response.readTimes.stageFinal={seconds:240,nanoseconds:0};response.readTimes.sourceFinal={seconds:250,nanoseconds:0};
  await expect(validateCyclingHistoryOverlayResponse(response,request,"owner",current)).rejects.toMatchObject({overlayReason:"read_times_future"});
  const app={options:{projectId:"miranae-orider-g1"}},services={auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app,customDomain:"https://asia-northeast3-orider-dev.cloudfunctions.net"},ensureAppCheckReady:mocks.ready};let deliver!:(value:{data:typeof response})=>void;
  mocks.ready.mockReset().mockResolvedValue(undefined);mocks.call.mockReset().mockImplementation(()=>new Promise(done=>{deliver=done;}));
  const pending=loadCyclingHistoryOverlay(services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices,request,new AbortController().signal);await Promise.resolve();expect(mocks.call).toHaveBeenCalledOnce();
  current=300000;deliver({data:response});await expect(pending).resolves.toBe(response);
 } finally {clock.mockRestore();}
});

it.each([
 ["read_times_shape", (r: Awaited<ReturnType<typeof overlayResponse>>) => {r.readTimes.sourceFinal.nanoseconds=-1;}],
 ["read_times_quantum", (r: Awaited<ReturnType<typeof overlayResponse>>) => {r.readTimes.sourceFinal.nanoseconds=1;}],
 ["read_times_future", (r: Awaited<ReturnType<typeof overlayResponse>>, now:number) => {r.readTimes.sourceFinal={seconds:Math.floor(now/1000)+1,nanoseconds:1000};}],
 ["read_times_source_binding", (r: Awaited<ReturnType<typeof overlayResponse>>) => {r.readTimes.sourceInitial={...r.readTimes.sourceInitial,seconds:r.readTimes.sourceInitial.seconds-1};}],
 ["read_times_stage_binding", (r: Awaited<ReturnType<typeof overlayResponse>>) => {r.readTimes.stageInitial={...r.readTimes.stageInitial,seconds:r.readTimes.stageInitial.seconds-1};}],
 ["read_times_order", (r: Awaited<ReturnType<typeof overlayResponse>>) => {r.readTimes.sourceFinal={...r.readTimes.sourceInitial};}],
] as const)("distinguishes %s while rejecting exactly the same invalid read times",async(reason,mutate)=>{
 const now=200000,request=overlayRequest(1,now),response=await overlayResponse(request);mutate(response,now);const error=await validateCyclingHistoryOverlayResponse(response,request,"owner",now).catch(error=>error);expect(error).toMatchObject({message:"invalid_cycling_history_overlay_response",overlayReason:reason});
 if(reason==="read_times_shape") expect(error.overlayTiming).toBeUndefined();else {expect(safeCyclingHistoryOverlayTiming(error.overlayTiming)).toBe(true);expect(Object.keys(error.overlayTiming).sort()).toEqual(["clientObservedAtMillis","maxAheadMillis","readTimes"]);expect(error.overlayTiming.clientObservedAtMillis).toBe(now);}
 if(reason==="read_times_future") expect(error.overlayTiming.maxAheadMillis).toBe(1001);
});
it("timing diagnostics reject private extras, invalid stamps and fabricated lead values",async()=>{
 const now=200000,request=overlayRequest(1,now),response=await overlayResponse(request);response.readTimes.sourceFinal={seconds:201,nanoseconds:1000};const error=await validateCyclingHistoryOverlayResponse(response,request,"owner",now).catch(error=>error),timing=error.overlayTiming;
 expect(safeCyclingHistoryOverlayTiming(timing)).toBe(true);expect(safeCyclingHistoryOverlayTiming({...timing,token:"private"})).toBe(false);expect(safeCyclingHistoryOverlayTiming({...timing,maxAheadMillis:0})).toBe(false);expect(safeCyclingHistoryOverlayTiming({...timing,readTimes:{...timing.readTimes,sourceFinal:{...timing.readTimes.sourceFinal,path:"private"}}})).toBe(false);
});

it("accepts the confirmed 11.623ms server read lead without changing exact timestamp bindings or order",async()=>{
 const {cyclingOverlayDigest}=await import("./stageCyclingDistanceHistoryOverlay"),now=1791847428599,request=overlayRequest(1,now);request.history.sourceReadTime={seconds:1791847424,nanoseconds:543000000};
 const response=await overlayResponse(request);response.session.stageReadTime={seconds:1791847428,nanoseconds:431092000};response.session.requestBinding=await cyclingOverlayDigest(["owner",request.history,response.session.calculatorArtifactHash,response.session.observedCalculatorArtifactHash,response.session.stageReadTime,response.session.scope]);response.batchBinding=await cyclingOverlayDigest([response.session,response.pageBinding,response.subsetBinding]);
 response.readTimes={sourceInitial:request.history.sourceReadTime,sourceFinal:{seconds:1791847428,nanoseconds:610623000},stageInitial:response.session.stageReadTime,stageFinal:{seconds:1791847428,nanoseconds:586607000}};
 const effort=response.evidence[0]!.row.efforts.find(e=>e.target==="10km")!;effort.originalElapsedSec=966.4259018112487;effort.effectiveElapsedSec=966.4259018112487;
 expect(CYCLING_HISTORY_OVERLAY_SERVER_READ_LEAD_MS).toBe(1000);expect((await validateCyclingHistoryOverlayResponse(response,request,"owner",now)).evidence[0]!.row.efforts.find(e=>e.target==="10km")!.effectiveElapsedSec).toBe(966.4259018112487);
});
it.each([[999,true],[1000,true],[1000.001,false],[60000,false]] as const)("fixed server lead %sms accepts=%s",async(lead,accepted)=>{
 const now=200000,request=overlayRequest(1,now),response=await overlayResponse(request),whole=Math.floor(lead),fraction=Math.round((lead-whole)*1e6);response.readTimes.sourceFinal={seconds:Math.floor((now+whole)/1000),nanoseconds:((now+whole)%1000)*1e6+fraction};
 if(accepted) expect(await validateCyclingHistoryOverlayResponse(response,request,"owner",now)).toBe(response);else {const error=await validateCyclingHistoryOverlayResponse(response,request,"owner",now).catch(error=>error);expect(error).toMatchObject({overlayReason:"read_times_future"});expect(error.overlayTiming.maxAheadMillis).toBe(Math.ceil(lead));}
});
it("server allowance never overrides order, nanosecond shape/quantum, caller source time or expiry",async()=>{
 const now=200000,request=overlayRequest(1,now);const reversed=await overlayResponse(request);reversed.readTimes.sourceFinal={...reversed.readTimes.sourceInitial};await expect(validateCyclingHistoryOverlayResponse(reversed,request,"owner",now)).rejects.toMatchObject({overlayReason:"read_times_order"});
 for(const nano of [1,1e9,-1,1.5,NaN,"1000"]){const response=await overlayResponse(request);response.readTimes.sourceFinal.nanoseconds=nano as number;await expect(validateCyclingHistoryOverlayResponse(response,request,"owner",now)).rejects.toThrow("invalid_cycling_history_overlay_response");}
 const futureSource=overlayRequest(1,now);futureSource.history.sourceReadTime={seconds:200,nanoseconds:1000000};expect(validCyclingHistoryOverlayRequest(futureSource,now)).toBe(false);
 const response=await overlayResponse(request);await expect(validateCyclingHistoryOverlayResponse(response,request,"owner",response.session.expiresAt)).rejects.toThrow();expect(validCyclingHistoryOverlayRequest({...request,leadAllowance:60000} as typeof request,now)).toBe(false);
});
it("a validated Stage session may lead the browser by up to the same fixed bound, without extending TTL",async()=>{
 const {cyclingOverlayDigest}=await import("./stageCyclingDistanceHistoryOverlay"),now=200000,request=overlayRequest(1,now),response=await overlayResponse(request);response.session.stageReadTime={seconds:201,nanoseconds:0};response.session.requestBinding=await cyclingOverlayDigest(["owner",request.history,response.session.calculatorArtifactHash,response.session.observedCalculatorArtifactHash,response.session.stageReadTime,response.session.scope]);response.batchBinding=await cyclingOverlayDigest([response.session,response.pageBinding,response.subsetBinding]);response.readTimes.stageInitial=response.session.stageReadTime;response.readTimes.stageFinal={seconds:201,nanoseconds:0};response.readTimes.sourceFinal={seconds:201,nanoseconds:0};
 expect(await validateCyclingHistoryOverlayResponse(response,request,"owner",now)).toBe(response);expect(validCyclingHistoryOverlayRequest({...request,session:response.session},now)).toBe(true);expect(response.session.expiresAt).toBe(request.history.sourceReadTime.seconds*1000+1800_000);
 response.session.stageReadTime={seconds:201,nanoseconds:1000};expect(validCyclingHistoryOverlayRequest({...request,session:response.session},now)).toBe(false);
});
it("clock A-B-A across a deferred RPC does not reuse an earlier permissive browser timestamp",async()=>{
 const {loadCyclingHistoryOverlay}=await import("./stageCyclingDistanceHistoryOverlay");let current=200000;const clock=vi.spyOn(Date,"now").mockImplementation(()=>current);
 try{const request=overlayRequest(1,current),response=await overlayResponse(request);response.readTimes.sourceFinal={seconds:250,nanoseconds:0};response.readTimes.stageFinal={seconds:240,nanoseconds:0};const app={options:{projectId:"miranae-orider-g1"}},services={auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app,customDomain:"https://asia-northeast3-orider-dev.cloudfunctions.net"},ensureAppCheckReady:mocks.ready};let deliver!:(value:{data:typeof response})=>void;mocks.ready.mockReset().mockResolvedValue(undefined);mocks.call.mockReset().mockImplementation(()=>new Promise(done=>{deliver=done;}));
 const pending=loadCyclingHistoryOverlay(services as unknown as import("../contexts/FirebaseServicesContext").FirebaseServices,request,new AbortController().signal);await Promise.resolve();current=300000;current=200000;deliver({data:response});await expect(pending).rejects.toMatchObject({overlayReason:"read_times_future"});
 }finally{clock.mockRestore();}
});
it.each([999,1])("keeps the actual deadline when only %sms of the snapshot TTL remains",async(remaining)=>{
 const request=overlayRequest(1,200000),response=await overlayResponse(request),now=response.session.expiresAt-remaining;response.readTimes.stageFinal={seconds:Math.floor(now/1000),nanoseconds:now%1000*1e6};const finalMs=now+12;response.readTimes.sourceFinal={seconds:Math.floor(finalMs/1000),nanoseconds:finalMs%1000*1e6};
 expect(await validateCyclingHistoryOverlayResponse(response,request,"owner",now)).toBe(response);await expect(validateCyclingHistoryOverlayResponse(response,request,"owner",response.session.expiresAt)).rejects.toThrow("invalid_cycling_history_overlay_response");
});
