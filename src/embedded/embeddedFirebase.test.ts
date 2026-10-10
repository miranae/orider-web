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
  lruGarbageCollector: { kind: "lru-gc" },
  initializeApp: vi.fn(),
  initializeAuth: vi.fn(),
  initializeFirestore: vi.fn(),
  memoryLocalCache: vi.fn(),
  memoryLruGarbageCollector: vi.fn(),
  terminate: vi.fn(),
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
  memoryLruGarbageCollector: mocks.memoryLruGarbageCollector,
  terminate: mocks.terminate,
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
vi.mock("../services/runtimeConfig", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/runtimeConfig")>(),
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
    mocks.memoryLruGarbageCollector.mockReturnValue(mocks.lruGarbageCollector);
    mocks.initializeFirestore.mockReturnValue(mocks.firestore);
    mocks.getFunctions.mockReturnValue(mocks.functions);
    mocks.initializeAppCheck.mockReturnValue(mocks.appCheck);
    mocks.getToken.mockResolvedValue({ token: "app-check-token" });
    mocks.terminate.mockResolvedValue(undefined);
  });

  it("keeps embedded production Auth/data app with exact stage callable transport", async () => {
    mocks.runtimeConfig = {
      firebaseApiKey: "public-api-key", appEnvironment: "stage", firebaseProjectId: "miranae-orider-g1",
      firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com", firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app",
      firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878", firebaseMessagingSenderId: "289663940841",
      firebaseFunctionsRegion: "asia-northeast3", firebaseFunctionsBase: "https://asia-northeast3-orider-dev.cloudfunctions.net",
      appCheckRecaptchaSiteKey: "site-key",
    };
    await loadEmbeddedFirebase();
    expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ projectId: "miranae-orider-g1" }), expect.any(String));
    expect(mocks.getFunctions).toHaveBeenCalledWith(mocks.app, "https://asia-northeast3-orider-dev.cloudfunctions.net");
  });

  it("rejects a fixture Firebase identity in shared-data stage before SDK initialization", async () => {
    mocks.runtimeConfig.appEnvironment = "stage";
    mocks.runtimeConfig.firebaseProjectId = "orider-dev";
    const embeddedFirebase = await import("./embeddedFirebase");
    expect(() => embeddedFirebase.initEmbeddedFirebase()).toThrow("stage/firebase-identity-mismatch");
    expect(mocks.initializeApp).not.toHaveBeenCalled();
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
    // 재마운트 시 전체 재조회를 막기 위해 EAGER 대신 LRU GC 를 쓴다(메모리 전용 유지).
    expect(mocks.memoryLruGarbageCollector).toHaveBeenCalledWith({ cacheSizeBytes: 40 * 1024 * 1024 });
    expect(mocks.memoryLocalCache).toHaveBeenCalledWith({ garbageCollector: mocks.lruGarbageCollector });
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

  describe("계정 격리", () => {
    async function loadWithDerivedCache() {
      const loaded = await loadEmbeddedFirebase();
      const derivedCache = await import("../features/fitness/activityDerivedDocumentCache");
      return { ...loaded, derivedCache };
    }

    it("아무 계정도 쓰지 않은 첫 인스턴스는 terminate 없이 그대로 쓴다", async () => {
      const { embeddedFirebase } = await loadEmbeddedFirebase();
      expect(embeddedFirebase.embeddedAccountReady("user-a")).toBe(true);
      await embeddedFirebase.isolateEmbeddedAccount("user-a");
      await embeddedFirebase.isolateEmbeddedAccount("user-a");
      expect(mocks.terminate).not.toHaveBeenCalled();
      expect(embeddedFirebase.getEmbeddedFirestore()).toBe(mocks.firestore);
      expect(embeddedFirebase.embeddedAccountReady("user-a")).toBe(true);
      expect(embeddedFirebase.embeddedAccountReady("user-b")).toBe(false);
    });

    it("로그아웃하면 이전 계정 인스턴스를 한 번 terminate 하고 같은 설정으로 새로 만든다", async () => {
      const { embeddedFirebase, derivedCache } = await loadWithDerivedCache();
      const recreated = { kind: "firestore-2" };
      mocks.initializeFirestore.mockReturnValueOnce(recreated);
      await embeddedFirebase.isolateEmbeddedAccount("user-a");
      derivedCache.setCachedActivityDerivedDocument(
        "user-a", "metrics", "a1", "r1", { tss: 1 } as never,
      );
      expect(derivedCache.activityDerivedDocumentCacheTestApi.size()).toBe(0);
      derivedCache.prepareActivityDerivedDocumentCacheOwner("user-a");
      derivedCache.setCachedActivityDerivedDocument(
        "user-a", "metrics", "a1", "r1", { tss: 1 } as never,
      );
      expect(derivedCache.activityDerivedDocumentCacheTestApi.size()).toBe(1);

      await embeddedFirebase.isolateEmbeddedAccount(null);

      expect(mocks.terminate).toHaveBeenCalledTimes(1);
      expect(mocks.terminate).toHaveBeenCalledWith(mocks.firestore);
      expect(mocks.initializeFirestore).toHaveBeenCalledTimes(2);
      expect(mocks.initializeFirestore).toHaveBeenLastCalledWith(mocks.app, {
        localCache: mocks.memoryCache,
      });
      expect(embeddedFirebase.getEmbeddedFirestore()).toBe(recreated);
      expect(derivedCache.activityDerivedDocumentCacheTestApi.size()).toBe(0);

      // 새 인스턴스는 다음 계정이 그대로 쓴다 — 추가 terminate 없음.
      expect(embeddedFirebase.embeddedAccountReady("user-b")).toBe(true);
      await embeddedFirebase.isolateEmbeddedAccount("user-b");
      expect(mocks.terminate).toHaveBeenCalledTimes(1);
      expect(embeddedFirebase.getEmbeddedFirestore()).toBe(recreated);
    });

    it("로그아웃 없이 다른 계정으로 바뀌어도 terminate 후 새 인스턴스를 쓰고 에뮬레이터 연결을 다시 건다", async () => {
      mocks.runtimeConfig.useEmulators = true;
      const { embeddedFirebase } = await loadEmbeddedFirebase();
      const recreated = { kind: "firestore-2" };
      mocks.initializeFirestore.mockReturnValueOnce(recreated);
      await embeddedFirebase.isolateEmbeddedAccount("user-a");

      const switching = embeddedFirebase.isolateEmbeddedAccount("user-b");
      expect(embeddedFirebase.embeddedAccountReady("user-b")).toBe(false);
      await switching;

      expect(mocks.terminate).toHaveBeenCalledTimes(1);
      expect(mocks.terminate).toHaveBeenCalledWith(mocks.firestore);
      expect(embeddedFirebase.getEmbeddedFirestore()).toBe(recreated);
      expect(mocks.connectFirestoreEmulator).toHaveBeenLastCalledWith(recreated, "localhost", 8080);
      expect(embeddedFirebase.embeddedAccountReady("user-b")).toBe(true);
    });

    it("terminate 가 실패하면 이전 계정 소유로 남아 다음 계정이 기다리게 한다", async () => {
      const { embeddedFirebase } = await loadEmbeddedFirebase();
      await embeddedFirebase.isolateEmbeddedAccount("user-a");
      mocks.terminate.mockRejectedValueOnce(new Error("terminate failed"));

      await expect(embeddedFirebase.isolateEmbeddedAccount("user-b")).rejects.toThrow("terminate failed");
      expect(embeddedFirebase.getEmbeddedFirestore()).toBe(mocks.firestore);
      expect(embeddedFirebase.embeddedAccountReady("user-b")).toBe(false);

      await embeddedFirebase.isolateEmbeddedAccount("user-b");
      expect(mocks.terminate).toHaveBeenCalledTimes(2);
      expect(embeddedFirebase.embeddedAccountReady("user-b")).toBe(true);
    });

    it("terminate 뒤 새 인스턴스 생성이 실패하면 ready 를 막고 다음 시도에서 terminate 없이 다시 만든다", async () => {
      const { embeddedFirebase } = await loadEmbeddedFirebase();
      await embeddedFirebase.isolateEmbeddedAccount("user-a");
      mocks.initializeFirestore.mockImplementationOnce(() => {
        throw new Error("initialize failed");
      });

      await expect(embeddedFirebase.isolateEmbeddedAccount("user-b"))
        .rejects.toThrow("embedded-firestore/recreate-failed");
      expect(mocks.terminate).toHaveBeenCalledTimes(1);
      // terminate 된 인스턴스가 남아 있으므로 어떤 계정도 바로 열면 안 된다.
      expect(embeddedFirebase.getEmbeddedFirestore()).toBe(mocks.firestore);
      expect(embeddedFirebase.embeddedAccountReady("user-b")).toBe(false);
      expect(embeddedFirebase.embeddedAccountReady("user-a")).toBe(false);

      const recreated = { kind: "firestore-2" };
      mocks.initializeFirestore.mockReturnValueOnce(recreated);
      await embeddedFirebase.isolateEmbeddedAccount("user-b");

      expect(mocks.terminate).toHaveBeenCalledTimes(1);
      expect(embeddedFirebase.getEmbeddedFirestore()).toBe(recreated);
      expect(embeddedFirebase.embeddedAccountReady("user-b")).toBe(true);
      expect(embeddedFirebase.embeddedFirestoreOwnerUid()).toBe("user-b");
    });

    it("재생성 실패 뒤 같은 계정으로 다시 시도해도 새 인스턴스를 만든다", async () => {
      const { embeddedFirebase } = await loadEmbeddedFirebase();
      await embeddedFirebase.isolateEmbeddedAccount("user-a");
      mocks.initializeFirestore.mockImplementationOnce(() => {
        throw new Error("initialize failed");
      });
      await expect(embeddedFirebase.isolateEmbeddedAccount(null)).rejects.toThrow();
      expect(embeddedFirebase.embeddedAccountReady("user-a")).toBe(false);

      const recreated = { kind: "firestore-2" };
      mocks.initializeFirestore.mockReturnValueOnce(recreated);
      await embeddedFirebase.isolateEmbeddedAccount(null);
      expect(embeddedFirebase.getEmbeddedFirestore()).toBe(recreated);
      expect(embeddedFirebase.embeddedAccountReady("user-a")).toBe(true);
    });
  });
});
