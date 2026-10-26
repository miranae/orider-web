import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import { loadTrainingAnalysisPeriods } from "./trainingAnalysisPeriods";
import { periodFixture, request } from "./trainingAnalysisPeriods.fixture";
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: mocks.callable }));
const local = { useEmulators: true, trainingAnalysisPeriodsEnabled: true, firebaseProjectId: "demo-local", firebaseFunctionsBase: "http://127.0.0.1:5019/demo-local/asia-northeast3" };
function services() {
  const app = { options: { projectId: local.firebaseProjectId } };
  return { auth: { app, currentUser: { uid: "owner", isAnonymous: false } }, functions: { app, customDomain: local.firebaseFunctionsBase }, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined) } as unknown as FirebaseServices;
}
beforeEach(() => {
  vi.stubGlobal("location", { hostname: "localhost" }); vi.stubEnv("DEV", true);
  resetRuntimeConfigForTests(local);
  mocks.call.mockReset().mockResolvedValue({ data: periodFixture() }); mocks.callable.mockReset().mockReturnValue(mocks.call);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetRuntimeConfigForTests({}); });
describe("local training loader boundary", () => {
  it("uses the matched local service once and validates its ordinary bike response", async () => {
    const sdk = services();
    expect(await loadTrainingAnalysisPeriods(sdk, "owner", request)).toEqual(periodFixture());
    expect(sdk.ensureAppCheckReady).toHaveBeenCalledOnce();
    expect(mocks.callable).toHaveBeenCalledExactlyOnceWith(sdk.functions, "getTrainingAnalysisPeriods");
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith(request);
  });
  it.each(["foreign-app", "hosted-domain", "real-project", "emulator-override"])("rejects %s before preparing credentials or calling functions", async kind => {
    const sdk = services();
    if (kind === "foreign-app") Object.assign(sdk.functions, { app: {} });
    if (kind === "hosted-domain") Object.assign(sdk.functions, { customDomain: "https://asia-northeast3-orider-dev.cloudfunctions.net" });
    if (kind === "emulator-override") Object.assign(sdk.functions, { emulatorOrigin: "http://localhost:5001", region: "us-central1" });
    if (kind === "real-project") Object.assign(sdk.auth.app.options, { projectId: "miranae-orider-g1" });
    await expect(loadTrainingAnalysisPeriods(sdk, "owner", request)).rejects.toThrow(kind === "foreign-app" ? "account_changed" : "stage/callable-context-mismatch");
    expect(sdk.ensureAppCheckReady).not.toHaveBeenCalled(); expect(mocks.callable).not.toHaveBeenCalled();
  });
  it.each([{ ...request, discipline: "run" as const }, { ...request, includeStageRunEffortPreferences: true as const }])("excludes unsupported local analysis before network", async input => {
    const sdk = services();
    await expect(loadTrainingAnalysisPeriods(sdk, "owner", input)).rejects.toThrow("local/unsupported-analysis");
    expect(sdk.ensureAppCheckReady).not.toHaveBeenCalled(); expect(mocks.callable).not.toHaveBeenCalled();
  });
  it("does not dispatch a prepared request after the account changes", async () => {
    const sdk = services();
    vi.mocked(sdk.ensureAppCheckReady).mockImplementation(async () => { Object.assign(sdk.auth, { currentUser: { uid: "another", isAnonymous: false } }); });
    await expect(loadTrainingAnalysisPeriods(sdk, "owner", request)).rejects.toThrow("account_changed");
    expect(mocks.callable).not.toHaveBeenCalled();
  });
  it("rejects production bundles and disabled local config before touching services", async () => {
    vi.stubEnv("DEV", false);
    await expect(loadTrainingAnalysisPeriods({} as FirebaseServices, "owner", request)).rejects.toThrow("api_unavailable");
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});
