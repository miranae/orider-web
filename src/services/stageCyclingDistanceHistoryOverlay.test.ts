import { webcrypto } from "node:crypto";
import { beforeEach, vi, expect, it } from "vitest";
import { overlayRequest, overlayResponse } from "./stageCyclingDistanceHistoryOverlay.fixture";
import { safeCyclingHistoryOverlayTiming, validateCyclingHistoryOverlayResponse } from "./stageCyclingDistanceHistoryOverlay";
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
 ["read_times_future", (r: Awaited<ReturnType<typeof overlayResponse>>, now:number) => {r.readTimes.sourceFinal={seconds:Math.floor(now/1000)+1,nanoseconds:0};}],
 ["read_times_source_binding", (r: Awaited<ReturnType<typeof overlayResponse>>) => {r.readTimes.sourceInitial={...r.readTimes.sourceInitial,seconds:r.readTimes.sourceInitial.seconds-1};}],
 ["read_times_stage_binding", (r: Awaited<ReturnType<typeof overlayResponse>>) => {r.readTimes.stageInitial={...r.readTimes.stageInitial,seconds:r.readTimes.stageInitial.seconds-1};}],
 ["read_times_order", (r: Awaited<ReturnType<typeof overlayResponse>>) => {r.readTimes.sourceFinal={...r.readTimes.sourceInitial};}],
] as const)("distinguishes %s while rejecting exactly the same invalid read times",async(reason,mutate)=>{
 const now=200000,request=overlayRequest(1,now),response=await overlayResponse(request);mutate(response,now);const error=await validateCyclingHistoryOverlayResponse(response,request,"owner",now).catch(error=>error);expect(error).toMatchObject({message:"invalid_cycling_history_overlay_response",overlayReason:reason});
 if(reason==="read_times_shape") expect(error.overlayTiming).toBeUndefined();else {expect(safeCyclingHistoryOverlayTiming(error.overlayTiming)).toBe(true);expect(Object.keys(error.overlayTiming).sort()).toEqual(["clientObservedAtMillis","maxAheadMillis","readTimes"]);expect(error.overlayTiming.clientObservedAtMillis).toBe(now);}
 if(reason==="read_times_future") expect(error.overlayTiming.maxAheadMillis).toBe(1000);
});
it("timing diagnostics reject private extras, invalid stamps and fabricated lead values",async()=>{
 const now=200000,request=overlayRequest(1,now),response=await overlayResponse(request);response.readTimes.sourceFinal={seconds:201,nanoseconds:0};const error=await validateCyclingHistoryOverlayResponse(response,request,"owner",now).catch(error=>error),timing=error.overlayTiming;
 expect(safeCyclingHistoryOverlayTiming(timing)).toBe(true);expect(safeCyclingHistoryOverlayTiming({...timing,token:"private"})).toBe(false);expect(safeCyclingHistoryOverlayTiming({...timing,maxAheadMillis:0})).toBe(false);expect(safeCyclingHistoryOverlayTiming({...timing,readTimes:{...timing.readTimes,sourceFinal:{...timing.readTimes.sourceFinal,path:"private"}}})).toBe(false);
});
