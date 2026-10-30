import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { loadActivityRouteEvidence } from "./activityRouteEvidence";
import { loadActivityRouteIndexPage } from "./activityRouteIndexPage";
import { loadActivityMatchedRouteGroups } from "./activityMatchedRouteGroups";
import { loadActivityMatchedRouteInventory } from "./activityMatchedRouteInventory";
import { loadRouteHistorySnapshot } from "./activityRouteHistorySnapshot";
import { loadBikeSnapshot } from "./bikePeriodSnapshot";
import { loadTrainingAnalysisPeriods, trainingAnalysisPeriodsAvailable } from "./trainingAnalysisPeriods";
const spies=vi.hoisted(()=>({call:vi.fn(),factory:vi.fn()}));
vi.mock("firebase/functions",()=>({httpsCallable:spies.factory}));
const production={appEnvironment:"production",firebaseProjectId:"miranae-orider-g1",firebaseFunctionsRegion:"asia-northeast3",activityAnalysisExpansionEnabled:true,trainingAnalysisPeriodsEnabled:true};
function sdk(){const app={options:{projectId:production.firebaseProjectId}};return{auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app,region:"asia-northeast3",customDomain:null},ensureAppCheckReady:vi.fn().mockResolvedValue(undefined)} as unknown as FirebaseServices;}
const period={fromInclusive:1700000000000,toExclusive:1700086400000};
const cases=[
 ["route", "getActivityStreams", (s:FirebaseServices)=>loadActivityRouteEvidence(s,"owner","anchor")],
 ["index", "getActivityStreams", (s:FirebaseServices)=>loadActivityRouteIndexPage(s,"owner",{mode:"route_index_page",anchorActivityId:"anchor",discipline:"bike"})],
 ["groups", "getActivityStreams", (s:FirebaseServices)=>loadActivityMatchedRouteGroups(s,"owner",{mode:"matched_route_group_page",anchorActivityId:"anchor",discipline:"bike"})],
 ["inventory", "getActivityStreams", (s:FirebaseServices)=>loadActivityMatchedRouteInventory(s,"owner",{mode:"matched_route_inventory_page",anchorActivityId:"anchor",discipline:"bike"})],
 ["history", "progressActivityRouteHistorySnapshot", (s:FirebaseServices)=>loadRouteHistorySnapshot(s,"owner",{action:"start",anchorActivityId:"anchor",discipline:"bike"})],
 ["bikeSnapshot", "progressBikeAnalysisPeriodSnapshot", (s:FirebaseServices)=>loadBikeSnapshot(s,"owner",{action:"start",period})],
 ["bikePeriod", "getTrainingAnalysisPeriods", (s:FirebaseServices)=>loadTrainingAnalysisPeriods(s,"owner",{discipline:"bike",periods:[period]})],
] as const;
beforeEach(()=>{resetRuntimeConfigForTests(production);spies.call.mockReset().mockRejectedValue(Error("server-not-ready"));spies.factory.mockReset().mockReturnValue(spies.call);});
afterEach(()=>resetRuntimeConfigForTests({}));
it.each(cases)("connects %s to the existing SDK callable and preserves backend-not-ready failure",async(_label,name,load)=>{
 const s=sdk();await expect(load(s)).rejects.toThrow("server-not-ready");expect(s.ensureAppCheckReady).toHaveBeenCalledOnce();expect(spies.factory.mock.calls[0]?.[1]).toBe(name);expect(spies.call).toHaveBeenCalledOnce();
});
it.each(cases)("prevents %s dispatch if actual SDK transport changes during AppCheck",async(_label,_name,load)=>{
 const s=sdk();s.ensureAppCheckReady=vi.fn(async()=>{Object.assign(s.functions,{emulatorOrigin:"http://localhost:5001"});});await expect(load(s)).rejects.toThrow();expect(spies.call).not.toHaveBeenCalled();
});
it.each(cases)("prevents %s dispatch after same-UID SDK-user replacement",async(_label,_name,load)=>{
 const s=sdk();s.ensureAppCheckReady=vi.fn(async()=>{Object.assign(s.auth,{currentUser:{uid:"owner",isAnonymous:false}});});await expect(load(s)).rejects.toThrow("account_changed");expect(spies.call).not.toHaveBeenCalled();
});
it("does not enable Stage run overlays through the production bike capability",async()=>{
 expect(trainingAnalysisPeriodsAvailable("bike")).toBe(true); expect(trainingAnalysisPeriodsAvailable("run")).toBe(false); expect(trainingAnalysisPeriodsAvailable("swim")).toBe(false);
 for(const request of [{discipline:"run",periods:[period]}, {discipline:"bike",periods:[period],includeStageRunTimeCorrections:true}]) await expect(loadTrainingAnalysisPeriods(sdk(),"owner",request as never)).rejects.toThrow("local/unsupported-analysis");
 expect(spies.call).not.toHaveBeenCalled();
});

it.each(cases)("rejects late %s responses when the approved transport changes",async(_label,_name,load)=>{
 const s=sdk();spies.call.mockImplementationOnce(async()=>{Object.assign(s.functions,{emulatorOrigin:"http://localhost:5001"});return {data:{}};});
 await expect(load(s)).rejects.toThrow(/unsupported|not_supported|unavailable|context-mismatch/);expect(spies.call).toHaveBeenCalledOnce();
});
