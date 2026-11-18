import { afterEach, expect, it, vi } from "vitest";
import { deleteApp, getApps, initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { inMemoryPersistence, initializeAuth } from "firebase/auth";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
vi.unmock("firebase/app");
vi.unmock("firebase/functions");
vi.unmock("firebase/auth");
vi.unmock("firebase/app-check");
import { assertIsolatedStageRuntime, bundledFunctionsBase, BUNDLED_FUNCTIONS_BASES, BUNDLED_AI_BASES, isFunctionsGatewayRuntime, resetRuntimeConfigForTests, type RuntimeConfig } from "./runtimeConfig";
import { redeemHandoffCode } from "./handoffRedeem";
import { analysisCapabilityAvailable, matchesAnalysisCapability } from "./analysisCapability";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";

function config(environment: "development" | "production"): RuntimeConfig {
  const base = BUNDLED_FUNCTIONS_BASES[environment];
  return { appEnvironment: "production", deploymentProfile: `bundled-${environment}`, firebaseFunctionsBase: base,
    socialAuthFunctionsBase: base, personalApiBase: base, publicClubApiUrl: `${base}/publicClubs`, aiApiBase: BUNDLED_AI_BASES[environment],
    firebaseProjectId: "miranae-orider-g1", firebaseFunctionsRegion: "asia-northeast3", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com",
    firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878", firebaseMessagingSenderId: "289663940841" };
}
afterEach(async () => {
  resetRuntimeConfigForTests({}); vi.unstubAllGlobals();
  await Promise.all(getApps().map(deleteApp));
});
it.each(["development", "production"] as const)("%s keeps SDK callable paths and App Check on the same reviewed gateway", async environment => {
  const runtime = config(environment), base = bundledFunctionsBase(runtime)!;
  const host = environment === "development" ? "orider-dev.web.app" : "orider.co.kr";
  expect(() => assertIsolatedStageRuntime(runtime, host, `https://${host}`)).not.toThrow();
  expect(isFunctionsGatewayRuntime(runtime)).toBe(true);
  const app = initializeApp({ projectId: "miranae-orider-g1", apiKey: "public", appId: runtime.firebaseAppId }, environment);
  initializeAppCheck(app, { provider: new CustomProvider({ getToken: async () => ({ token: "reviewed-appcheck-token", expireTimeMillis: Date.now() + 3600_000 }) }) });
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  resetRuntimeConfigForTests({ ...runtime, activityAnalysisExpansionEnabled: true, trainingAnalysisPeriodsEnabled: true });
  const services = { auth, functions: getFunctions(app, base) } as FirebaseServices;
  expect(analysisCapabilityAvailable("routes")).toBe(true);
  expect(matchesAnalysisCapability(services, "routes")).toBe(true);

  const request = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ result: { ok: true } }) });
  vi.stubGlobal("fetch", request);
  for (const name of ["getActivityOverview", "getCourse", "stravaGetTokens", "socialAuthStart"]) {
    expect((await httpsCallable(getFunctions(app, base), name)({ id: "fixture" })).data).toEqual({ ok: true });
    const [url, options] = request.mock.calls.at(-1)!;
    expect(url).toBe(`${base}/${name}`);
    expect(options.headers["X-Firebase-AppCheck"]).toBe("reviewed-appcheck-token");
    expect(JSON.parse(options.body)).toEqual({ data: { id: "fixture" } });
  }
});
it("bundled mode rejects missing or substituted endpoints instead of silently using named functions", () => {
  const reviewed = config("production");
  for (const patch of [{ firebaseFunctionsBase: undefined }, { firebaseFunctionsBase: `${reviewed.firebaseFunctionsBase}/` },
    { socialAuthFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" }, { aiApiBase: "https://unreviewed.example" },
    { personalApiBase: "https://orider.co.kr" }, { useEmulators: true }]) {
    expect(() => isFunctionsGatewayRuntime({ ...reviewed, ...patch })).toThrow("bundled/transport-profile-mismatch");
  }
  expect(() => assertIsolatedStageRuntime(config("development"), "orider.co.kr", "https://orider.co.kr")).toThrow("bundled/execution-identity-mismatch");
  expect(() => assertIsolatedStageRuntime(config("production"), "orider-dev.web.app", "https://orider-dev.web.app")).toThrow("bundled/execution-identity-mismatch");
});
it("bundled handoff uses the new gateway with an isolated SDK context and no Auth or App Check headers", async () => {
  const runtime = config("development"); resetRuntimeConfigForTests(runtime);
  const app = initializeApp({ projectId: "miranae-orider-g1", apiKey: "public", appId: runtime.firebaseAppId }, "original");
  initializeAuth(app, { persistence: inMemoryPersistence });
  initializeAppCheck(app, { provider: new CustomProvider({ getToken: () => new Promise(() => {}) }) });
  const request = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ result: { token: "custom-token" } }) });
  vi.stubGlobal("fetch", request);
  expect(await redeemHandoffCode(getFunctions(app, runtime.firebaseFunctionsBase), "A".repeat(43))).toBe("custom-token");
  const [url, options] = request.mock.calls[0]!;
  expect(url).toBe(`${runtime.firebaseFunctionsBase}/webHandoffRedeem`);
  expect(options.headers).toEqual({ "Content-Type": "application/json" });
});
