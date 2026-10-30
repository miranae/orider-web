import { describe, expect, it, vi } from "vitest";
import { assertIsolatedStageRuntime, getRuntimeConfig, resetRuntimeConfigForTests, type RuntimeConfig } from "./runtimeConfig";
const stage: RuntimeConfig = {
  appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com",
  firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878",
  firebaseMessagingSenderId: "289663940841", firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net",
};
const productionData: RuntimeConfig = { ...stage, appEnvironment: "production", firebaseFunctionsBase: undefined,
  personalApiBase: "https://orider.co.kr", aiApiBase: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app" };
it("uses the production data profile on development Hosting without allowing arbitrary identity or backend changes", () => {
  expect(() => assertIsolatedStageRuntime(productionData, "orider-dev.web.app", "https://orider-dev.web.app")).not.toThrow();
  for (const patch of [{ firebaseProjectId: "other" }, { firebaseFunctionsBase: stage.firebaseFunctionsBase }, { aiApiBase: "https://other.example" }, { personalApiBase: "https://orider-dev.web.app" }, { useEmulators: true }, { socialAuthFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" }]) {
    expect(() => assertIsolatedStageRuntime({ ...productionData, ...patch }, "orider-dev.web.app", "https://orider-dev.web.app")).toThrow("development/production-data-profile-mismatch");
  }
  expect(() => assertIsolatedStageRuntime(productionData, "orider-dev.web.app", "http://orider-dev.web.app")).toThrow();
});
describe("isolated stage Firebase identity", () => {
  it("requires the served runtime opt-in instead of retaining a compiled fallback after disable", () => {
    vi.stubEnv("VITE_SOCIAL_AUTH_FUNCTIONS_BASE", "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net");
    try {
      resetRuntimeConfigForTests();
      expect(getRuntimeConfig().socialAuthFunctionsBase).toBeUndefined();
    } finally { vi.unstubAllEnvs(); resetRuntimeConfigForTests(); }
  });
  it("allows explicit canonical Auth routing only on the reviewed Stage origin without changing analysis compute", () => {
    const config = { ...stage, socialAuthFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" };
    expect(() => assertIsolatedStageRuntime(config, "orider-dev.web.app", "https://orider-dev.web.app")).not.toThrow();
    expect(config.firebaseFunctionsBase).toBe(stage.firebaseFunctionsBase);
    for (const origin of ["https://orider.co.kr", "https://orider-dev.firebaseapp.com", "http://orider-dev.web.app", "https://evil.example"]) {
      expect(() => assertIsolatedStageRuntime(config, new URL(origin).hostname, origin)).toThrow("stage/social-auth-endpoint-mismatch");
    }
  });
  it.each([
    "https://asia-northeast3-orider-dev.cloudfunctions.net",
    "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net.evil.example",
    "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net:8443",
    "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net/other",
  ])("rejects a noncanonical Auth endpoint %s", socialAuthFunctionsBase => {
    expect(() => assertIsolatedStageRuntime({ ...stage, socialAuthFunctionsBase }, "orider-dev.web.app", "https://orider-dev.web.app")).toThrow("stage/social-auth-endpoint-mismatch");
  });
  it("does not enable the optional Stage Auth route in production", () => {
    expect(() => assertIsolatedStageRuntime({ ...stage, appEnvironment: "production", socialAuthFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" }, "orider.co.kr", "https://orider.co.kr")).toThrow("stage/social-auth-endpoint-mismatch");
  });
  it("accepts shared production data with stage callable compute", () => expect(() => assertIsolatedStageRuntime(stage, "orider-dev.web.app")).not.toThrow());
  it.each([
    { firebaseProjectId: "orider-dev" }, { firebaseAuthDomain: "auth.orider.co.kr" },
    { firebaseStorageBucket: "orider-dev.firebasestorage.app" }, { firebaseAppId: "another-app" }, { useEmulators: true },
  ])("blocks wrong Firebase identity before SDK initialization %j", overrides => {
    expect(() => assertIsolatedStageRuntime({ ...stage, ...overrides }, "orider-dev.web.app")).toThrow("stage/firebase-identity-mismatch");
  });
  it.each(["aiApiBase", "personalApiBase", "segmentTilesBase", "heatmapBase", "stravaRedirectUri"] as const)("blocks production service %s", key => {
    expect(() => assertIsolatedStageRuntime({ ...stage, [key]: "https://orider.co.kr/api" })).toThrow("stage/service-origin-mismatch");
  });
  it.each([undefined, "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net"])("rejects absent or production callable endpoint %s", firebaseFunctionsBase => {
    expect(() => assertIsolatedStageRuntime({ ...stage, firebaseFunctionsBase })).toThrow("stage/callable-endpoint-mismatch");
  });
  it("preserves production behavior", () => expect(() => assertIsolatedStageRuntime({ firebaseProjectId: "miranae-orider-g1" }, "orider.co.kr")).not.toThrow());
});


it("allows only the exact reviewed personal API host for its own config key", () => {
  const uri = "https://qapersonalapi-ldfyfyx5da-du.a.run.app";
  expect(() => assertIsolatedStageRuntime({ ...stage, personalApiBase: uri })).not.toThrow();
  expect(() => assertIsolatedStageRuntime({ ...stage, aiApiBase: uri })).toThrow("stage/service-origin-mismatch");
  expect(() => assertIsolatedStageRuntime({ ...stage, personalApiBase: "https://unreviewed-ldfyfyx5da-du.a.run.app" })).toThrow("stage/service-origin-mismatch");
  expect(() => assertIsolatedStageRuntime({ ...stage, personalApiBase: uri + ".evil.example" })).toThrow("stage/service-origin-mismatch");
  expect(() => assertIsolatedStageRuntime({ ...stage, personalApiBase: uri + ":8443" })).toThrow("stage/service-origin-mismatch");
});


it("allows only the exact reviewed AI API origin for its own config key", () => {
  const uri = "https://orider-ai-api-qa-firstpass-ldfyfyx5da-du.a.run.app";
  expect(() => assertIsolatedStageRuntime({ ...stage, aiApiBase: uri })).not.toThrow();
  for (const key of ["personalApiBase", "segmentTilesBase", "heatmapBase", "stravaRedirectUri"] as const) {
    expect(() => assertIsolatedStageRuntime({ ...stage, [key]: uri })).toThrow("stage/service-origin-mismatch");
  }
  for (const aiApiBase of [
    "https://orider-ai-api-h5zqzw3n4a-du.a.run.app",
    "https://unreviewed-ldfyfyx5da-du.a.run.app",
    uri + ".evil.example",
    uri + ":8443",
    uri.replace("https:", "http:"),
    uri.replace("https://", "https://user:pass@"),
  ]) {
    expect(() => assertIsolatedStageRuntime({ ...stage, aiApiBase })).toThrow("stage/service-origin-mismatch");
  }
});
