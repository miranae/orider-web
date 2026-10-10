import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
vi.mock("firebase/storage", () => ({ getStorage: vi.fn(() => ({})) }));
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
  isEmulatorRuntime: () => false,
}));

async function loadFirebase() {
  const firebase = await import("./firebase");
  await firebase.initFirebase();
  return firebase;
}

describe("ensureAppCheckReady", () => {
  beforeEach(() => {
    vi.resetModules();
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

  it("fails closed when the production runtime site key is missing", async () => {
    delete mocks.runtimeConfig.appCheckRecaptchaSiteKey;
    const firebase = await loadFirebase();

    await expect(firebase.ensureAppCheckReady()).rejects.toThrow("app-check/missing-site-key");
    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});
