// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { localTrainingEmulatorAvailable, matchesLocalTrainingEmulator } from "./localTrainingEmulator";
import { resetRuntimeConfigForTests } from "./runtimeConfig";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
const local = { useEmulators: true, trainingAnalysisPeriodsEnabled: true, firebaseProjectId: "demo-local", firebaseFunctionsBase: "http://127.0.0.1:5019/demo-local/asia-northeast3" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetRuntimeConfigForTests({}); });
describe("local training transport fence", () => {
  it("requires dev bundle, loopback host, explicit demo project and exact local endpoint", () => {
    vi.stubGlobal("location", { hostname: "localhost" }); resetRuntimeConfigForTests(local);
    expect(localTrainingEmulatorAvailable()).toBe(true);
    for (const patch of [{ useEmulators: false }, { trainingAnalysisPeriodsEnabled: false }, { firebaseProjectId: "miranae-orider-g1" },
      { firebaseFunctionsBase: "https://127.0.0.1:5019/demo-local/asia-northeast3" },
      { firebaseFunctionsBase: "http://remote.example:5019/demo-local/asia-northeast3" },
      { firebaseFunctionsBase: "http://127.0.0.1:5019/demo-other/asia-northeast3" },
      { firebaseFunctionsBase: local.firebaseFunctionsBase + "?target=prod" }]) {
      resetRuntimeConfigForTests({ ...local, ...patch }); expect(localTrainingEmulatorAvailable()).toBe(false);
    }
    resetRuntimeConfigForTests(local); vi.stubGlobal("location", { hostname: "orider.co.kr" }); expect(localTrainingEmulatorAvailable()).toBe(false);
    vi.stubGlobal("location", { hostname: "localhost" }); vi.stubEnv("DEV", false); expect(localTrainingEmulatorAvailable()).toBe(false);
  });
  it("rejects foreign Firebase app or transport even under a local config", () => {
    vi.stubGlobal("location", { hostname: "localhost" }); resetRuntimeConfigForTests(local);
    const app = { options: { projectId: "demo-local" } };
    const services = { auth: { app }, functions: { app, customDomain: local.firebaseFunctionsBase } } as unknown as FirebaseServices;
    expect(matchesLocalTrainingEmulator(services)).toBe(true);
    expect(matchesLocalTrainingEmulator({ ...services, functions: Object.assign({}, services.functions, { emulatorOrigin: "http://localhost:5001" }) })).toBe(false);
    expect(matchesLocalTrainingEmulator({ ...services, functions: { ...services.functions, customDomain: "https://prod.example" } })).toBe(false);
    expect(matchesLocalTrainingEmulator({ ...services, functions: { ...services.functions, app: { ...services.functions.app } } })).toBe(false);
  });
});
