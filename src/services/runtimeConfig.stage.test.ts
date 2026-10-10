import { describe, expect, it } from "vitest";
import { assertIsolatedStageRuntime, type RuntimeConfig } from "./runtimeConfig";
const stage: RuntimeConfig = {
  appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com",
  firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878",
  firebaseMessagingSenderId: "289663940841", firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net",
};
describe("isolated stage Firebase identity", () => {
  it("accepts shared production data with stage callable compute", () => expect(() => assertIsolatedStageRuntime(stage, "orider-dev.web.app")).not.toThrow());
  it.each([
    { firebaseProjectId: "orider-dev" }, { appEnvironment: "production" }, { firebaseAuthDomain: "auth.orider.co.kr" },
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
