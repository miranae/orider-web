import { expect, it, vi } from "vitest";
import { setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { loadLegendProgress, validateLegendProgress } from "./segmentLocalLegendProgress";
vi.mock("./localTrainingEmulator",()=>({matchesLocalTrainingEmulator:()=>true}));
const at=Date.now()-10000;
const request={segmentId:"s",action:"start" as const};
const response={runId:"12345678-1234-1234-1234-123456789012",version:1,state:"complete",censusAsOf:at,finalAsOf:at+1,windowEndMs:at,expiresAt:at+3000000,preparationOnly:true,steps:12,limits:{candidates:2000,documentReads:30000,inputBytes:33554432,milliseconds:90000},validation:{documentReads:7000,inputBytes:200000,elapsedMs:1000},reason:null,result:{windowStartMs:(Math.floor((at+9*3600000)/86400000)-((Math.floor((at+9*3600000)/86400000)+3)%7+7)%7)*86400000-9*3600000-12*7*86400000,windowEndMs:at,windowWeeks:13,population:"authorized_native_outdoor_bike",coverage:"complete",scannedCount:1001,scanLimit:2000,riderCount:1,totalEfforts:1001,leader:{userId:"u",nickname:"",effortCount:1001},minimumEfforts:3,globalRankAvailable:false}};
const services=()=>{const app={options:{projectId:"demo-test"}};return {auth:{app,currentUser:{uid:"viewer",isAnonymous:false}},functions:{app},ensureAppCheckReady:vi.fn().mockResolvedValue(undefined)} as unknown as FirebaseServices;};
it("accepts a 1001-record result and rejects provisional or inconsistent leaders",()=>{
 expect(validateLegendProgress(response,request).result?.totalEfforts).toBe(1001);
 for(const bad of [{...response,state:"census"},{...response,finalAsOf:null},{...response,result:{...response.result,totalEfforts:1002}},{...response,result:{...response.result,coverage:"partial"}},{...response,result:{...response.result,leader:{...response.result.leader,effortCount:1002}}}])expect(()=>validateLegendProgress(bad,request)).toThrow("invalid_legend_progress");
});
it("rejects changed run metadata during checkpoint recovery",()=>{
 const prior=validateLegendProgress(response,request);
 expect(()=>validateLegendProgress({...response,censusAsOf:at-1},{segmentId:"s",action:"status",runId:response.runId},prior)).toThrow();
});
it("discards a same-UID replacement after dispatch",async()=>{
 const s=services();setCallableImplementation("progressSegmentLocalLegend",()=>{Object.assign(s.auth,{currentUser:{uid:"viewer",isAnonymous:false}});return {data:response};});
 await expect(loadLegendProgress(s,"viewer",request)).rejects.toThrow("account_changed");
});
it("does not dispatch after a same-UID replacement during AppCheck",async()=>{
 const s=services();const called=vi.fn(()=>({data:response}));setCallableImplementation("progressSegmentLocalLegend",called);
 vi.mocked(s.ensureAppCheckReady).mockImplementation(async()=>{Object.assign(s.auth,{currentUser:{uid:"viewer",isAnonymous:false}});});
 await expect(loadLegendProgress(s,"viewer",request)).rejects.toThrow("account_changed");expect(called).not.toHaveBeenCalled();
});
it("uses the real owner-bound callable for valid responses",async()=>{
 setCallableResult("progressSegmentLocalLegend",{data:response});await expect(loadLegendProgress(services(),"viewer",request)).resolves.toMatchObject({state:"complete"});
});

it("rejects expired final snapshots, invalid windows and validation budget overflow",()=>{
 for(const bad of [{...response,windowEndMs:0},{...response,expiresAt:response.expiresAt+1},{...response,finalAsOf:response.expiresAt},{...response,result:{...response.result,windowStartMs:response.result.windowStartMs+1}},{...response,validation:{...response.validation,documentReads:30001}}])expect(()=>validateLegendProgress(bad,request)).toThrow();
});
it("bounds hung readiness and prevents a late timed-out dispatch",async()=>{
 vi.useFakeTimers();try{const s=services();let ready!:()=>void;vi.mocked(s.ensureAppCheckReady).mockImplementation(()=>new Promise<void>(r=>{ready=r;}));const called=vi.fn();setCallableImplementation("progressSegmentLocalLegend",called);const pending=expect(loadLegendProgress(s,"viewer",request)).rejects.toThrow("legend_progress_timeout");await vi.advanceTimersByTimeAsync(130000);await pending;ready();await Promise.resolve();await Promise.resolve();expect(called).not.toHaveBeenCalled();}finally{vi.useRealTimers();}
});
