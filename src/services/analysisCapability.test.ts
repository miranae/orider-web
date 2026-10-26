import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { analysisCapabilityAvailable, matchesAnalysisCapability } from "./analysisCapability";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
const production = { appEnvironment: "production", firebaseProjectId: "miranae-orider-g1", firebaseFunctionsRegion: "asia-northeast3", activityAnalysisExpansionEnabled: true, trainingAnalysisPeriodsEnabled: true };
const endpoint = "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net";
function sdk() {
 const app = { options: { projectId: production.firebaseProjectId } };
 return { auth: { app }, functions: { app, region: production.firebaseFunctionsRegion, customDomain: null } } as unknown as FirebaseServices;
}
beforeEach(() => resetRuntimeConfigForTests(production));
afterEach(() => { resetRuntimeConfigForTests({}); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("uses existing flags and the standard authenticated Firebase endpoint in a production bundle", () => {
 vi.stubEnv("DEV",false);
 for (const capability of ["routes","bikePeriods"] as const) {
  expect(analysisCapabilityAvailable(capability)).toBe(true);
  expect(matchesAnalysisCapability(sdk(),capability)).toBe(true);
 }
 resetRuntimeConfigForTests({...production, activityAnalysisExpansionEnabled:false});
 expect(analysisCapabilityAvailable("routes")).toBe(false); expect(analysisCapabilityAvailable("bikePeriods")).toBe(true);
 resetRuntimeConfigForTests({...production, trainingAnalysisPeriodsEnabled:false});
 expect(analysisCapabilityAvailable("bikePeriods")).toBe(false); expect(analysisCapabilityAvailable("routes")).toBe(true);
});
it("rejects arbitrary runtime identities, endpoint overrides, emulator precedence and foreign SDK apps", () => {
 for (const patch of [{firebaseProjectId:"other"},{firebaseFunctionsRegion:"us-central1"},{useEmulators:true},{firebaseFunctionsBase:"https://untrusted.example"},{firebaseFunctionsBase:endpoint+"/"},{firebaseFunctionsBase:endpoint+"?x=1"},{appEnvironment:"unknown"}]) {
  resetRuntimeConfigForTests({...production,...patch}); expect(analysisCapabilityAvailable("routes")).toBe(false); expect(matchesAnalysisCapability(sdk(),"bikePeriods")).toBe(false);
 }
 resetRuntimeConfigForTests({...production,firebaseFunctionsBase:endpoint});
 const s=sdk();s.functions.customDomain=endpoint;
 expect(matchesAnalysisCapability(s,"routes")).toBe(true);
 for (const patch of [{emulatorOrigin:"http://localhost:5001"},{customDomain:"https://untrusted.example"},{region:"us-central1"},{app:{options:{projectId:production.firebaseProjectId}}}])
  expect(matchesAnalysisCapability({...s,functions:{...s.functions,...patch}} as FirebaseServices,"routes")).toBe(false);
});
it("preserves the existing Stage custom endpoint without accepting it as production", () => {
 const base="https://asia-northeast3-orider-dev.cloudfunctions.net";
 resetRuntimeConfigForTests({...production,appEnvironment:"stage",firebaseFunctionsBase:base});
 const s=sdk();s.functions.customDomain=base;
 expect(matchesAnalysisCapability(s,"routes")).toBe(true);expect(matchesAnalysisCapability(s,"bikePeriods")).toBe(true);
 s.functions.customDomain=null;expect(matchesAnalysisCapability(s,"routes")).toBe(false);
 resetRuntimeConfigForTests({...production,firebaseFunctionsBase:base});expect(analysisCapabilityAvailable("routes")).toBe(false);
});
