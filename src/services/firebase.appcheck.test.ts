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
vi.mock("./runtimeConfig", () => ({
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
