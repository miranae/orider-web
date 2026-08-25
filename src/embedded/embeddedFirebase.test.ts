import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { name: "orider-embedded" },
  auth: { kind: "auth" },
  firestore: { kind: "firestore" },
  functions: { kind: "functions" },
  appCheck: { kind: "app-check" },
  inMemoryPersistence: { kind: "memory-persistence" },
  memoryCache: { kind: "memory-cache" },
  initializeApp: vi.fn(),
  initializeAuth: vi.fn(),
  initializeFirestore: vi.fn(),
  memoryLocalCache: vi.fn(),
  getFunctions: vi.fn(),
  initializeAppCheck: vi.fn(),
  getToken: vi.fn(),
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
  runtimeConfig: {} as Record<string, unknown>,
}));

vi.mock("firebase/app", () => ({ initializeApp: mocks.initializeApp }));
vi.mock("firebase/auth", () => ({
  initializeAuth: mocks.initializeAuth,
  inMemoryPersistence: mocks.inMemoryPersistence,
  connectAuthEmulator: mocks.connectAuthEmulator,
}));
vi.mock("firebase/firestore", () => ({
  initializeFirestore: mocks.initializeFirestore,
  memoryLocalCache: mocks.memoryLocalCache,
  connectFirestoreEmulator: mocks.connectFirestoreEmulator,
}));
vi.mock("firebase/functions", () => ({
  getFunctions: mocks.getFunctions,
  connectFunctionsEmulator: mocks.connectFunctionsEmulator,
}));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  getToken: mocks.getToken,
  ReCaptchaEnterpriseProvider: class {
    constructor(readonly siteKey: string) {}
  },
}));
vi.mock("../services/runtimeConfig", () => ({
  getRuntimeConfig: () => mocks.runtimeConfig,
}));

async function loadEmbeddedFirebase() {
  const embeddedFirebase = await import("./embeddedFirebase");
  const services = embeddedFirebase.initEmbeddedFirebase();
  return { embeddedFirebase, services };
}

describe("embeddedFirebase", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.runtimeConfig = {
      firebaseApiKey: "api-key",
      firebaseAuthDomain: "test.example.com",
      firebaseProjectId: "test-project",
      firebaseStorageBucket: "test-bucket",
      firebaseMessagingSenderId: "sender-id",
      firebaseAppId: "test-app",
      firebaseFunctionsRegion: "asia-northeast3",
      appCheckRecaptchaSiteKey: "site-key",
      useEmulators: false,
    };
    mocks.initializeApp.mockReturnValue(mocks.app);
    mocks.initializeAuth.mockReturnValue(mocks.auth);
    mocks.memoryLocalCache.mockReturnValue(mocks.memoryCache);
    mocks.initializeFirestore.mockReturnValue(mocks.firestore);
    mocks.getFunctions.mockReturnValue(mocks.functions);
    mocks.initializeAppCheck.mockReturnValue(mocks.appCheck);
    mocks.getToken.mockResolvedValue({ token: "app-check-token" });
  });

  it("creates a named app with memory-only Auth and Firestore", async () => {
    const { services } = await loadEmbeddedFirebase();

    expect(mocks.initializeApp).toHaveBeenCalledWith({
      apiKey: "api-key",
      authDomain: "test.example.com",
      projectId: "test-project",
      storageBucket: "test-bucket",
      messagingSenderId: "sender-id",
      appId: "test-app",
    }, "orider-embedded");
    expect(mocks.initializeAuth).toHaveBeenCalledWith(mocks.app, {
      persistence: mocks.inMemoryPersistence,
    });
    expect(mocks.memoryLocalCache).toHaveBeenCalledTimes(1);
    expect(mocks.initializeFirestore).toHaveBeenCalledWith(mocks.app, {
      localCache: mocks.memoryCache,
    });
    expect(mocks.getFunctions).toHaveBeenCalledWith(mocks.app, "asia-northeast3");
    expect(services).toEqual({
      app: mocks.app,
      auth: mocks.auth,
      firestore: mocks.firestore,
      functions: mocks.functions,
    });
  });

  it("initializes reCAPTCHA Enterprise App Check on the named app", async () => {
    const { embeddedFirebase } = await loadEmbeddedFirebase();

    expect(mocks.initializeAppCheck).toHaveBeenCalledWith(mocks.app, {
      provider: expect.objectContaining({ siteKey: "site-key" }),
      isTokenAutoRefreshEnabled: true,
    });
    await expect(embeddedFirebase.ensureEmbeddedAppCheckReady()).resolves.toBeUndefined();
    expect(mocks.getToken).toHaveBeenCalledWith(mocks.appCheck, false);
  });

  it("connects only the named services to emulators when configured", async () => {
    mocks.runtimeConfig.useEmulators = true;
    await loadEmbeddedFirebase();

    expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(
      mocks.auth,
      "http://localhost:9099",
      { disableWarnings: true },
    );
    expect(mocks.connectFirestoreEmulator).toHaveBeenCalledWith(mocks.firestore, "localhost", 8080);
    expect(mocks.connectFunctionsEmulator).toHaveBeenCalledWith(mocks.functions, "localhost", 5001);
    expect(mocks.initializeAppCheck).not.toHaveBeenCalled();
  });

  it("fails closed before initialization when the App Check site key is missing", async () => {
    delete mocks.runtimeConfig.appCheckRecaptchaSiteKey;
    const embeddedFirebase = await import("./embeddedFirebase");

    expect(() => embeddedFirebase.initEmbeddedFirebase())
      .toThrow("embedded-app-check/missing-site-key");
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });

  it("does not import the general web Firebase provider", () => {
    const source = readFileSync(join(process.cwd(), "src/embedded/embeddedFirebase.ts"), "utf8");
    expect(source).not.toMatch(/services\/firebase/);
    expect(source).toContain("../services/runtimeConfig");
  });
});
