import { describe, expect, it } from "vitest";
import { assertIsolatedStageRuntime, type RuntimeConfig } from "./runtimeConfig";
const stage: RuntimeConfig = {
  appEnvironment: "stage", firebaseProjectId: "orider-dev", firebaseAuthDomain: "orider-dev.firebaseapp.com",
  firebaseStorageBucket: "orider-dev.firebasestorage.app", firebaseAppId: "1:818364001341:web:57f361a334532e0ee64e54",
  firebaseMessagingSenderId: "818364001341", firebaseFunctionsRegion: "asia-northeast3",
};
describe("isolated stage Firebase identity", () => {
  it("accepts its own project and Storage", () => expect(() => assertIsolatedStageRuntime(stage, "orider-dev.web.app")).not.toThrow());
  it.each([
    { firebaseProjectId: "miranae-orider-g1" }, { appEnvironment: "production" }, { firebaseAuthDomain: "auth.orider.co.kr" },
    { firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app" }, { firebaseAppId: "another-app" }, { useEmulators: true },
  ])("blocks wrong Firebase identity before SDK initialization %j", overrides => {
    expect(() => assertIsolatedStageRuntime({ ...stage, ...overrides }, "orider-dev.web.app")).toThrow("stage/firebase-identity-mismatch");
  });
  it.each(["aiApiBase", "personalApiBase", "segmentTilesBase", "heatmapBase", "stravaRedirectUri"] as const)("blocks production service %s", key => {
    expect(() => assertIsolatedStageRuntime({ ...stage, [key]: "https://orider.co.kr/api" })).toThrow("stage/service-origin-mismatch");
  });
  it("preserves production behavior", () => expect(() => assertIsolatedStageRuntime({ firebaseProjectId: "miranae-orider-g1" }, "orider.co.kr")).not.toThrow());
});
