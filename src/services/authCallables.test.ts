import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "./runtimeConfig";

const mocks = vi.hoisted(() => ({
  config: {} as RuntimeConfig,
  normal: { app: { name: "shared-auth-app" } }, canonical: { kind: "canonical" },
  getFunctions: vi.fn(), callable: vi.fn(),
}));
vi.mock("./firebase", () => ({ functions: mocks.normal }));
vi.mock("firebase/functions", () => ({ getFunctions: mocks.getFunctions, httpsCallable: mocks.callable }));
vi.mock("./runtimeConfig", async importOriginal => ({
  ...await importOriginal<typeof import("./runtimeConfig")>(), getRuntimeConfig: () => mocks.config,
}));
import { authCallable } from "./authCallables";
import { functions } from "./firebase";

const stage: RuntimeConfig = {
  appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com",
  firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878",
  firebaseMessagingSenderId: "289663940841", firebaseFunctionsRegion: "asia-northeast3",
  firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net",
};
const names = ["socialAuthStart", "socialAuthComplete", "socialAuthListLinks", "socialAuthUnlink", "connectExistingGoogleAccount", "unlinkGoogleLogin", "ensureUserProfile"] as const;

beforeEach(() => {
  mocks.config = { appEnvironment: "production" };
  mocks.getFunctions.mockReset().mockReturnValue(mocks.canonical);
  mocks.callable.mockReset();
  vi.stubGlobal("location", { hostname: "orider-dev.web.app", origin: "https://orider-dev.web.app" });
});
afterEach(() => vi.unstubAllGlobals());

describe("canonical Auth callable routing", () => {
  it.each(["production", "stage"])("preserves default %s Functions when the opt-in is unset", appEnvironment => {
    mocks.config = { ...stage, appEnvironment };
    for (const name of names) {
      authCallable(name);
      expect(mocks.callable).toHaveBeenLastCalledWith(mocks.normal, name);
    }
    expect(mocks.getFunctions).not.toHaveBeenCalled();
  });

  it("routes only reviewed Auth/profile names on the same FirebaseApp and leaves analysis Functions untouched", () => {
    mocks.config = { ...stage, socialAuthFunctionsBase: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net" };
    for (const name of names) {
      authCallable(name);
      expect(mocks.callable).toHaveBeenLastCalledWith(mocks.canonical, name);
    }
    expect(mocks.getFunctions).toHaveBeenCalledWith(mocks.normal.app, mocks.config.socialAuthFunctionsBase);
    expect(functions).toBe(mocks.normal);
    expect(() => authCallable("getActivityOverview" as never)).toThrow("auth/unsupported-callable");
    expect(mocks.callable).toHaveBeenCalledTimes(names.length);
  });

  it("rejects unreviewed endpoints before creating a callable", () => {
    mocks.config = { ...stage, socialAuthFunctionsBase: "https://evil.example" };
    expect(() => authCallable("socialAuthStart")).toThrow("stage/social-auth-endpoint-mismatch");
    expect(mocks.getFunctions).not.toHaveBeenCalled();
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});
