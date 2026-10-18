import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "./runtimeConfig";

const mocks = vi.hoisted(() => ({
  config: {} as RuntimeConfig,
  normal: { app: { name: "shared-auth-app" } }, canonical: { kind: "canonical" },
  getFunctions: vi.fn(), callable: vi.fn(),
}));
vi.mock("firebase/functions", () => ({ getFunctions: mocks.getFunctions, httpsCallable: mocks.callable }));
vi.mock("./runtimeConfig", async importOriginal => ({
  ...await importOriginal<typeof import("./runtimeConfig")>(), getRuntimeConfig: () => mocks.config,
}));
import { stravaConnectionCallable } from "./stravaConnectionCallables";

const stage: RuntimeConfig = {
  appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com",
  firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878",
  firebaseMessagingSenderId: "289663940841", firebaseFunctionsRegion: "asia-northeast3",
  firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net",
};
const names = ["stravaExchangeToken", "stravaQueueEnqueue", "stravaQueueCancel", "stravaDisconnect"] as const;

beforeEach(() => {
  mocks.config = { appEnvironment: "production" };
  mocks.getFunctions.mockReset().mockReturnValue(mocks.canonical);
  mocks.callable.mockReset();
  vi.stubGlobal("location", { hostname: "orider-dev.web.app", origin: "https://orider-dev.web.app" });
});
afterEach(() => vi.unstubAllGlobals());

describe("canonical Strava connection callable routing", () => {
  it.each(["production", "stage"])("preserves default %s Functions when the opt-in is unset", appEnvironment => {
    mocks.config = { ...stage, appEnvironment };
    for (const name of names) {
      stravaConnectionCallable(mocks.normal as never, name);
      expect(mocks.callable).toHaveBeenLastCalledWith(mocks.normal, name);
    }
    expect(mocks.getFunctions).not.toHaveBeenCalled();
  });

  it("routes only reviewed Strava connection names on the same FirebaseApp and leaves analysis Functions untouched", () => {
    mocks.config = { ...stage, stravaConnectionFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" };
    for (const name of names) {
      stravaConnectionCallable(mocks.normal as never, name);
      expect(mocks.callable).toHaveBeenLastCalledWith(mocks.canonical, name);
    }
    expect(mocks.getFunctions).toHaveBeenCalledWith(mocks.normal.app, mocks.config.stravaConnectionFunctionsBase);
    expect(mocks.normal.app.name).toBe("shared-auth-app");
    for (const name of ["getActivityOverview", "stravaGetActivityStreams", "stravaDeleteUserData", "stravaMigrationVerify", "stravaMigrationFix"]) {
      expect(() => stravaConnectionCallable(mocks.normal as never, name as never)).toThrow("strava/unsupported-connection-callable");
    }
    expect(mocks.callable).toHaveBeenCalledTimes(names.length);
  });

  it("rejects unreviewed endpoints before creating a callable", () => {
    mocks.config = { ...stage, stravaConnectionFunctionsBase: "https://evil.example" };
    expect(() => stravaConnectionCallable(mocks.normal as never, "stravaExchangeToken")).toThrow("stage/strava-connection-endpoint-mismatch");
    expect(mocks.getFunctions).not.toHaveBeenCalled();
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});
