import { beforeEach, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { createActivityReanalysisClient } from "./activityReanalysis";
const mocks=vi.hoisted(()=>({call:vi.fn()}));
vi.mock("firebase/functions",()=>({httpsCallable:()=>mocks.call}));
const hash="a".repeat(64);
const data=()=>({activityId:"a",metricsRevision:hash,calculatorVersion:1,latestCalculatorVersion:2,canReanalyze:true,pending:false,lastRequest:null});
const sdk=()=>{const app={};return {auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app},ensureAppCheckReady:vi.fn().mockResolvedValue(undefined)} as unknown as FirebaseServices;};
beforeEach(()=>{vi.useRealTimers();mocks.call.mockReset().mockResolvedValue({data:data()});});
it("only reads state until an explicit revision-bound request is made",async()=>{
 const s=sdk(),c=createActivityReanalysisClient(s);await c.load("a");
 expect(mocks.call).toHaveBeenCalledTimes(1);
 mocks.call.mockResolvedValue({data:{activityId:"a",requestId:"request",status:"queued",previousRevision:hash}});
 await expect(c.request("a","request",hash)).resolves.toMatchObject({status:"queued"});
 expect(mocks.call).toHaveBeenLastCalledWith({activityId:"a",requestId:"request",expectedMetricsRevision:hash});
});
it("rejects a same-UID replacement during AppCheck before dispatch",async()=>{
 const s=sdk();s.ensureAppCheckReady=async()=>{s.auth.currentUser={...s.auth.currentUser!};};
 await expect(createActivityReanalysisClient(s).load("a")).rejects.toThrow("account_changed");expect(mocks.call).not.toHaveBeenCalled();
});
it("rejects a late response after an account change",async()=>{
 const s=sdk();mocks.call.mockImplementation(async()=>{s.auth.currentUser={...s.auth.currentUser!};return {data:data()};});
 await expect(createActivityReanalysisClient(s).load("a")).rejects.toThrow("account_changed");
});
it("times out hung preparation and never sends a delayed write",async()=>{
 vi.useFakeTimers();const s=sdk();let done!:()=>void;s.ensureAppCheckReady=()=>new Promise<void>(r=>{done=r;});
 const promise=createActivityReanalysisClient(s).request("a","request",hash);const rejected=expect(promise).rejects.toThrow("reanalysis_timeout");
 await vi.advanceTimersByTimeAsync(10001);await rejected;done();await Promise.resolve();expect(mocks.call).not.toHaveBeenCalled();vi.useRealTimers();
});
it("does not accept an unrelated historical revision",async()=>{
 mocks.call.mockResolvedValue({data:{items:[],nextCursor:null,selected:{revisionId:"b".repeat(64),metrics:{np:200}}}});
 await expect(createActivityReanalysisClient(sdk()).history("a",hash)).rejects.toThrow("invalid_analysis_history");
});
it("returns saved numeric results unchanged",async()=>{
 const selected={revisionId:hash,metrics:{version:1,np:186.835,contextSnapshot:{ftp:207}}};
 mocks.call.mockResolvedValue({data:{items:[],nextCursor:null,selected}});
 expect((await createActivityReanalysisClient(sdk()).history("a",hash)).selected).toEqual(selected);
});

it.each(["complete", "partial_terminal"])("retains saved %s coverage without relabeling the calculation", async savedInputCoverage => {
 mocks.call.mockResolvedValue({data:{items:[],nextCursor:null,selected:{revisionId:hash,metrics:{version:1,inputPending:true,inputCoverage:"pending",savedInputCoverage,np:186.835,contextSnapshot:{ftp:207}}}}});
 const result=await createActivityReanalysisClient(sdk()).history("a",hash);
 expect(result.selected?.metrics).toMatchObject({version:1,inputPending:false,inputCoverage:savedInputCoverage,np:186.835,contextSnapshot:{ftp:207}});
});
it("unwraps a final V3 saved result and rejects an unfinished revision", async()=>{
 const metrics={version:1,np:186.835,contextSnapshot:{ftp:207}};
 mocks.call.mockResolvedValue({data:{items:[],nextCursor:null,selected:{revisionId:hash,metrics:{schemaVersion:3,status:"final",metrics}}}});
 expect((await createActivityReanalysisClient(sdk()).history("a",hash)).selected?.metrics).toEqual(metrics);
 mocks.call.mockResolvedValue({data:{items:[],nextCursor:null,selected:{revisionId:hash,metrics:{schemaVersion:3,status:"pending",metrics}}}});
 await expect(createActivityReanalysisClient(sdk()).history("a",hash)).rejects.toThrow();
});
