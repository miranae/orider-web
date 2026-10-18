import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  qaRequested: false,
  emulatorRuntime: false,
  qaValidate: vi.fn(),
  qaInitialRefresh: vi.fn(),
  qaProvider: { kind: "qa" },
  getToken: vi.fn(),
  initializeAppCheck: vi.fn(() => ({ app: "check" })),
  runtimeConfig: {
    firebaseApiKey: "api-key",
    firebaseAuthDomain: "test.example.com",
    firebaseProjectId: "test-project",
    firebaseAppId: "test-app",
    appCheckRecaptchaSiteKey: "site-key",
  } as Record<string, unknown>,
}));

vi.unmock("./firebase");
vi.mock("./stageQaAppCheck", () => ({
  hasStageQaAppCheckGrant: () => mocks.qaRequested,
  getStageQaAppCheckSession: () => ({ validate: mocks.qaValidate, forceInitialRefresh: mocks.qaInitialRefresh, provider: mocks.qaProvider }),
}));
vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({ name: "app" })) }));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: class {},
  connectAuthEmulator: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  connectFirestoreEmulator: vi.fn(),
}));
vi.mock("firebase/storage", () => ({ getStorage: vi.fn(() => ({})), connectStorageEmulator: vi.fn() }));
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  connectFunctionsEmulator: vi.fn(),
}));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  getToken: mocks.getToken,
  ReCaptchaEnterpriseProvider: class {
    constructor(readonly siteKey: string) {}
  },
}));
vi.mock("./runtimeConfig", async (importOriginal) => ({
  ...await importOriginal<typeof import("./runtimeConfig")>(),
  getRuntimeConfig: () => mocks.runtimeConfig,
  isEmulatorRuntime: () => mocks.emulatorRuntime,
}));

async function loadFirebase() {
  const firebase = await import("./firebase");
  await firebase.initFirebase();
  return firebase;
}

describe("ensureAppCheckReady", () => {
  afterEach(() => {
    delete (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_APPCHECK_DEBUG_TOKEN", undefined);
    vi.stubEnv("VITE_FIRESTORE_FORCE_LONG_POLLING", undefined);
    vi.stubGlobal("location", { hostname: "127.0.0.1" });
    mocks.qaRequested = false;
    mocks.emulatorRuntime = false;
    mocks.qaValidate.mockReset().mockResolvedValue(undefined);
    mocks.qaInitialRefresh.mockReset().mockReturnValueOnce(true).mockReturnValue(false);
    vi.useRealTimers();
    mocks.getToken.mockReset();
    mocks.initializeAppCheck.mockClear();
    mocks.runtimeConfig = {
      firebaseApiKey: "api-key",
      firebaseAuthDomain: "test.example.com",
      firebaseProjectId: "test-project",
      firebaseAppId: "test-app",
      appCheckRecaptchaSiteKey: "site-key",
    };
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("uses opt-in Firestore long polling on Vite loopback %s", async hostname => {
    vi.stubEnv("VITE_FIRESTORE_FORCE_LONG_POLLING", "true");
    vi.stubGlobal("location", { hostname });
    await loadFirebase();
    const { initializeFirestore } = await import("firebase/firestore");
    expect(initializeFirestore).toHaveBeenLastCalledWith(expect.anything(), {
      localCache: expect.anything(), experimentalForceLongPolling: true,
    });
  });

  it.each(["unset", "false", "production-build", "remote-origin"])("preserves Firestore transport defaults for %s", async mode => {
    if (mode !== "unset") vi.stubEnv("VITE_FIRESTORE_FORCE_LONG_POLLING", mode === "false" ? "false" : "true");
    if (mode === "production-build") vi.stubEnv("DEV", false);
    if (mode === "remote-origin") vi.stubGlobal("location", { hostname: "localhost.example.com" });
    await loadFirebase();
    const { initializeFirestore } = await import("firebase/firestore");
    expect(initializeFirestore).toHaveBeenLastCalledWith(expect.anything(), { localCache: expect.anything() });
  });

  it("uses an explicitly registered debug credential only for Vite loopback development", async () => {
    const credential = "11111111-2222-4333-8444-555555555555";
    vi.stubEnv("VITE_APPCHECK_DEBUG_TOKEN", credential);
    mocks.getToken.mockResolvedValue({ token: "attested" });
    const firebase = await loadFirebase();
    await firebase.ensureAppCheckReady();
    expect((self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(credential);
    expect(mocks.initializeAppCheck).toHaveBeenCalledOnce();
    expect(mocks.getToken).toHaveBeenCalledOnce();
  });

  it.each(["true", "false", " ", "unregistered-placeholder", "11111111-2222-1333-8444-555555555555"])("rejects invalid local debug configuration %s without automatic generation", async value => {
    vi.stubEnv("VITE_APPCHECK_DEBUG_TOKEN", value);
    const firebase = await loadFirebase();
    await expect(firebase.ensureAppCheckReady()).rejects.toThrow("app-check/invalid-local-debug-token");
    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
    expect((self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
  });

  it.each(["production-build", "remote-origin", "stage-runtime", "qa-grant"])("does not activate local debug attestation for %s", async mode => {
    vi.stubEnv("VITE_APPCHECK_DEBUG_TOKEN", "11111111-2222-4333-8444-555555555555");
    if (mode === "production-build") vi.stubEnv("DEV", false);
    if (mode === "remote-origin") vi.stubGlobal("location", { hostname: "127.0.0.1.example.com" });
    if (mode === "stage-runtime") mocks.runtimeConfig.appEnvironment = "stage";
    if (mode === "qa-grant") mocks.qaRequested = true;
    // Stage identity guard is exercised by separate tests. Here only readiness runs.
    const firebase = await import("./firebase");
    if (mode === "stage-runtime") {
      mocks.runtimeConfig.appEnvironment = undefined;
      await firebase.initFirebase();
      mocks.runtimeConfig.appEnvironment = "stage";
    } else await firebase.initFirebase();
    mocks.getToken.mockResolvedValue({ token: "attested" });
    await firebase.ensureAppCheckReady();
    expect((self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
    if (mode === "qa-grant") expect(mocks.initializeAppCheck).toHaveBeenCalledWith(expect.anything(), { provider: mocks.qaProvider, isTokenAutoRefreshEnabled: false });
  });

  it("routes Storage to the local emulator with the other Firebase services", async () => {
    mocks.emulatorRuntime = true;
    await loadFirebase();
    const { connectStorageEmulator } = await import("firebase/storage");
    expect(connectStorageEmulator).toHaveBeenLastCalledWith(expect.anything(), "localhost", 9199);
  });

  it("keeps production Auth/data app while routing callable transport to stage", async () => {
    mocks.runtimeConfig = {
      firebaseApiKey: "public-api-key", appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1",
      firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com", firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app",
      firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878", firebaseMessagingSenderId: "289663940841",
      firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net",
      appCheckRecaptchaSiteKey: "site-key",
    };
    await loadFirebase();
    const { initializeApp } = await import("firebase/app");
    const { getFunctions } = await import("firebase/functions");
    expect(vi.mocked(initializeApp)).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "miranae-orider-g1" }));
    expect(vi.mocked(getFunctions)).toHaveBeenLastCalledWith(expect.anything(), "https://asia-northeast3-orider-dev.cloudfunctions.net");
  });

  it("rejects a fixture Firebase identity in shared-data stage before SDK initialization", async () => {
    mocks.runtimeConfig.appEnvironment = "stage";
    mocks.runtimeConfig.firebaseProjectId = "orider-dev";
    const firebase = await import("./firebase");
    await expect(firebase.initFirebase()).rejects.toThrow("stage/firebase-identity-mismatch");
  });

  it("does not resolve until a token exists and shares concurrent readiness", async () => {
    let resolveToken!: (value: { token: string }) => void;
    mocks.getToken.mockReturnValue(new Promise((resolve) => { resolveToken = resolve; }));
    const firebase = await loadFirebase();

    const first = firebase.ensureAppCheckReady();
    const second = firebase.ensureAppCheckReady();
    expect(first).toBe(second);
    await Promise.resolve();
    expect(mocks.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(mocks.getToken).toHaveBeenCalledTimes(1);

    resolveToken({ token: "ready" });
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it("resets a rejected readiness flight so a later retry can recover", async () => {
    mocks.getToken
      .mockRejectedValueOnce({ code: "app-check/initial-throttle" })
      .mockResolvedValueOnce({ token: "recovered" });
    const firebase = await loadFirebase();

    await expect(firebase.ensureAppCheckReady()).rejects.toMatchObject({
      code: "app-check/initial-throttle",
    });
    await expect(firebase.ensureAppCheckReady()).resolves.toBeUndefined();
    expect(mocks.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(mocks.getToken).toHaveBeenCalledTimes(2);
  });

  it("QA forces a fresh custom token and disables background refresh", async () => {
    mocks.qaRequested = true;
    mocks.getToken.mockResolvedValue({ token: "qa-token" });
    const firebase = await loadFirebase();
    await firebase.ensureAppCheckReady();
    expect(mocks.initializeAppCheck).toHaveBeenCalledWith(expect.anything(), { provider: mocks.qaProvider, isTokenAutoRefreshEnabled: false });
    expect(mocks.getToken).toHaveBeenCalledWith(expect.anything(), true);
    expect(mocks.qaValidate).toHaveBeenCalledTimes(2);
  });

  it("QA rejects changed Auth even with an already resolved readiness cache", async () => {
    mocks.qaRequested = true;
    mocks.getToken.mockResolvedValue({ token: "qa-token" });
    const firebase = await loadFirebase();
    await firebase.ensureAppCheckReady();
    mocks.qaValidate.mockRejectedValue(new Error("stage-qa/session-denied"));
    await expect(firebase.ensureAppCheckReady()).rejects.toThrow("stage-qa/session-denied");
    expect(mocks.getToken).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the production runtime site key is missing", async () => {
    delete mocks.runtimeConfig.appCheckRecaptchaSiteKey;
    const firebase = await loadFirebase();

    await expect(firebase.ensureAppCheckReady()).rejects.toThrow("app-check/missing-site-key");
    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});
