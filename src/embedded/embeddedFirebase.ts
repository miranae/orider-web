import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  inMemoryPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  memoryLruGarbageCollector,
  terminate,
  type Firestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from "firebase/functions";
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { assertIsolatedStageRuntime, getRuntimeConfig } from "../services/runtimeConfig";
import { clearActivityDerivedDocumentCache } from "../features/fitness/activityDerivedDocumentCache";

const EMBEDDED_APP_NAME = "orider-embedded";
const APP_CHECK_TOKEN_TIMEOUT_MS = 12_000;
// 임베드 Firestore 메모리 캐시 상한. 피트니스 표면의 활동·파생 문서 수백 건을 담고도 남는 크기로,
// WebView 메모리를 무한정 쓰지 않도록 이 값을 넘으면 오래된 문서부터 정리된다.
const EMBEDDED_FIRESTORE_CACHE_SIZE_BYTES = 40 * 1024 * 1024;

let embeddedApp: FirebaseApp | undefined;
export let embeddedAuth: Auth;
export let embeddedFirestore: Firestore;
export let embeddedFunctions: Functions;
let embeddedAppCheck: AppCheck | undefined;
let appCheckPromise: Promise<void> | null = null;
let appCheckRefreshPromise: Promise<void> | null = null;
let emulatorRuntime = false;
// 현재 Firestore 인스턴스 캐시에 데이터가 들어갔을 수 있는 계정. null 이면 어떤 계정도 쓰지 않은 새 인스턴스다.
let firestoreOwnerUid: string | null = null;
let accountTransition: Promise<void> | null = null;
// terminate 는 끝났지만 새 인스턴스를 만들지 못한 상태. embeddedFirestore 는 terminate 된 인스턴스라
// 표면을 열면 안 되고, 다음 격리 시도가 새 인스턴스 생성부터 다시 한다.
let firestoreNeedsRecreate = false;

export interface EmbeddedFirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
}

function createEmbeddedFirestore(app: FirebaseApp): Firestore {
  // 기본 메모리 캐시(EAGER GC)는 리스너가 닫히는 즉시 문서를 버린다. 임베드 표면은 host 의 표면
  // 선택·포그라운드 복귀마다 재마운트되어, 그때마다 모든 리스너가 서버에서 전체를 다시 읽었다.
  // LRU GC 로 바꾸면 같은 WebView 안의 재마운트가 캐시된 문서와 resume token 을 재사용해 변경분만
  // 받는다. 디스크 영속 저장은 여전히 하지 않는다(메모리 전용 — WebView 가 끝나면 사라진다).
  // 리스너가 닫혀도 문서가 남으므로, 계정이 바뀌면 isolateEmbeddedAccount 가 인스턴스를 새로 만든다.
  const firestore = initializeFirestore(app, {
    localCache: memoryLocalCache({
      garbageCollector: memoryLruGarbageCollector({
        cacheSizeBytes: EMBEDDED_FIRESTORE_CACHE_SIZE_BYTES,
      }),
    }),
  });
  if (emulatorRuntime) connectFirestoreEmulator(firestore, "localhost", 8080);
  return firestore;
}

/**
 * 임베드 계정 격리의 단일 지점. 다음 계정(로그아웃이면 null)이 이전 계정과 다르면
 * 계정 단위 메모리 캐시(활동 파생 문서)를 비우고, 이전 계정이 쓴 Firestore 인스턴스를
 * terminate 한 뒤 같은 설정으로 새로 만든다 — LRU 캐시에 남은 이전 계정 문서가 다음 계정에
 * 보이지 않게 한다. 호출 전에 이전 계정의 표면(리스너)이 내려가 있어야 한다.
 */
export function isolateEmbeddedAccount(nextUid: string | null): Promise<void> {
  const run = async () => {
    if (firestoreNeedsRecreate) {
      // 앞선 전환이 terminate 까지 마쳤으므로 남은 계정 데이터는 없다. 새 인스턴스만 다시 만든다.
      if (firestoreOwnerUid !== nextUid) clearActivityDerivedDocumentCache();
      recreateEmbeddedFirestore();
      firestoreOwnerUid = nextUid;
      return;
    }
    if (firestoreOwnerUid === nextUid) return;
    const previousUid = firestoreOwnerUid;
    firestoreOwnerUid = nextUid;
    clearActivityDerivedDocumentCache();
    // 아무 계정도 쓰지 않은 인스턴스에는 남은 데이터가 없다.
    if (previousUid === null || !embeddedApp) return;
    try {
      await terminate(embeddedFirestore);
    } catch (error) {
      // 격리에 실패하면 이전 계정 소유로 되돌려, 다음 계정은 재시도 전까지 표면을 열지 않는다.
      firestoreOwnerUid = previousUid;
      throw error;
    }
    // 여기서 실패하면 terminate 된 인스턴스가 남는다 — 재생성 대기로 표시해 ready 를 막고 다음 시도에서 다시 만든다.
    firestoreNeedsRecreate = true;
    recreateEmbeddedFirestore();
  };
  // 전환은 순서대로 한 번에 하나씩. 앞선 전환의 실패가 다음 전환을 막지 않는다.
  const transition = (accountTransition ?? Promise.resolve()).catch(() => undefined).then(run);
  accountTransition = transition;
  void transition.finally(() => {
    if (accountTransition === transition) accountTransition = null;
  }).catch(() => undefined);
  return transition;
}

function recreateEmbeddedFirestore(): void {
  if (!embeddedApp) return;
  try {
    embeddedFirestore = createEmbeddedFirestore(embeddedApp);
  } catch (error) {
    // 호출부(EmbeddedBootstrapRoot)가 격리 실패를 기록한다 — 원인 구분을 위해 메시지를 고정한다.
    throw Object.assign(new Error("embedded-firestore/recreate-failed"), { cause: error });
  }
  firestoreNeedsRecreate = false;
}

/** 진행 중인 계정 전환이 없고 Firestore 가 이미 이 계정 소유(또는 새 인스턴스)면 기다릴 필요가 없다. */
export function embeddedAccountReady(uid: string): boolean {
  return accountTransition === null
    && !firestoreNeedsRecreate
    && (firestoreOwnerUid === uid || firestoreOwnerUid === null);
}

/** 현재 Firestore 인스턴스를 쓴 계정(null 이면 아무도 쓰지 않은 새 인스턴스). 로그 구분용. */
export function embeddedFirestoreOwnerUid(): string | null {
  return firestoreOwnerUid;
}

export function getEmbeddedFirestore(): Firestore {
  return embeddedFirestore;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error("embedded-app-check/token-timeout"));
    }, APP_CHECK_TOKEN_TIMEOUT_MS);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function initEmbeddedFirebase(): EmbeddedFirebaseServices {
  if (embeddedApp) {
    return {
      app: embeddedApp,
      auth: embeddedAuth,
      firestore: embeddedFirestore,
      functions: embeddedFunctions,
    };
  }

  const runtimeConfig = getRuntimeConfig();
  assertIsolatedStageRuntime(runtimeConfig);
  const config = {
    apiKey: runtimeConfig.firebaseApiKey,
    authDomain: runtimeConfig.firebaseAuthDomain,
    projectId: runtimeConfig.firebaseProjectId,
    storageBucket: runtimeConfig.firebaseStorageBucket,
    messagingSenderId: runtimeConfig.firebaseMessagingSenderId,
    appId: runtimeConfig.firebaseAppId,
  };
  const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;
  const missing = requiredKeys.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Embedded Firebase config missing: ${missing.join(", ")}`);
  }
  emulatorRuntime = runtimeConfig.useEmulators === true;
  const siteKey = runtimeConfig.appCheckRecaptchaSiteKey;
  if (!emulatorRuntime && !siteKey) {
    throw new Error("embedded-app-check/missing-site-key");
  }

  embeddedApp = initializeApp(config, EMBEDDED_APP_NAME);
  embeddedAuth = initializeAuth(embeddedApp, { persistence: inMemoryPersistence });
  embeddedFirestore = createEmbeddedFirestore(embeddedApp);
  embeddedFunctions = getFunctions(
    embeddedApp,
    runtimeConfig.appEnvironment === "stage" ? runtimeConfig.firebaseFunctionsBase : runtimeConfig.firebaseFunctionsRegion || "us-central1",
  );

  if (emulatorRuntime) {
    connectAuthEmulator(embeddedAuth, "http://localhost:9099", { disableWarnings: true });
    connectFunctionsEmulator(embeddedFunctions, "localhost", 5001);
  } else {
    if (!siteKey) throw new Error("embedded-app-check/missing-site-key");
    // 로컬 개발 전용 App Check 디버그 토큰. reCAPTCHA Enterprise 는 등록된 도메인에서만
    // 동작해 localhost(특히 앱 WebView 안)에서는 토큰을 못 받고, 그러면 인계 redeem 이
    // 막혀 임베드를 한 번도 확인할 수 없다. **import.meta.env.DEV 에서만** 켜지므로
    // 프로덕션 번들에는 이 경로가 남지 않는다(빌드 시 제거).
    if (import.meta.env.DEV) {
      const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
      if (debugToken) {
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean })
          .FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
      }
    }
    embeddedAppCheck = initializeAppCheck(embeddedApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  return {
    app: embeddedApp,
    auth: embeddedAuth,
    firestore: embeddedFirestore,
    functions: embeddedFunctions,
  };
}

export function ensureEmbeddedAppCheckReady(forceRefresh = false): Promise<void> {
  if (emulatorRuntime) return Promise.resolve();
  if (!embeddedAppCheck) return Promise.reject(new Error("embedded-app-check/not-initialized"));
  if (forceRefresh && appCheckRefreshPromise) return appCheckRefreshPromise;
  if (!forceRefresh && appCheckPromise) return appCheckPromise;

  const readiness = withTimeout(getToken(embeddedAppCheck, forceRefresh))
    .then((tokenResult) => {
      if (!tokenResult.token) throw new Error("embedded-app-check/empty-token");
    })
    .catch((error) => {
      if (forceRefresh) appCheckRefreshPromise = null;
      else appCheckPromise = null;
      throw error;
    });

  if (forceRefresh) {
    appCheckRefreshPromise = readiness.finally(() => {
      appCheckRefreshPromise = null;
    });
    return appCheckRefreshPromise;
  }
  appCheckPromise = readiness;
  return appCheckPromise;
}
