// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { observedRouteAvailable, loadActivityRouteEvidence } from "./activityRouteEvidence";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { routeResponse } from "./activityRouteEvidence.fixture";
const call=vi.hoisted(()=>vi.fn());
vi.mock("firebase/functions",()=>({httpsCallable:()=>call}));
const config={useEmulators:true,trainingAnalysisPeriodsEnabled:true,firebaseProjectId:"demo-route",firebaseFunctionsBase:"http://localhost:5029/demo-route/asia-northeast3"};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();resetRuntimeConfigForTests();call.mockReset();});
it("allows only explicit local demo with the actual SDK endpoint and owner",async()=>{
 vi.stubGlobal("location",{hostname:"localhost"});resetRuntimeConfigForTests(config);
 const app={options:{projectId:"demo-route"}},services={auth:{app,currentUser:{uid:"owner",isAnonymous:false}},functions:{app,region:"asia-northeast3",emulatorOrigin:"http://localhost:5029"},ensureAppCheckReady:vi.fn()} as any;
 call.mockResolvedValue({data:routeResponse()});expect(observedRouteAvailable()).toBe(true);await loadActivityRouteEvidence(services,"owner","first");expect(call).toHaveBeenCalledOnce();
 services.functions.emulatorOrigin="https://remote.example";await expect(loadActivityRouteEvidence(services,"owner","first")).rejects.toThrow("route_not_supported");expect(call).toHaveBeenCalledOnce();
});
it("does not enable hosted, production builds, real projects or missing opt-in",()=>{
 vi.stubGlobal("location",{hostname:"localhost"});
 for(const patch of [{useEmulators:false},{trainingAnalysisPeriodsEnabled:false},{firebaseProjectId:"miranae-orider-g1"},{firebaseFunctionsBase:"https://remote.example"}]){resetRuntimeConfigForTests({...config,...patch});expect(observedRouteAvailable()).toBe(false);}
 resetRuntimeConfigForTests(config);vi.stubGlobal("location",{hostname:"orider.co.kr"});expect(observedRouteAvailable()).toBe(false);vi.stubGlobal("location",{hostname:"localhost"});vi.stubEnv("DEV",false);expect(observedRouteAvailable()).toBe(false);
});
