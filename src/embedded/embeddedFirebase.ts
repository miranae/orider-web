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
import { getRuntimeConfig } from "../services/runtimeConfig";

const EMBEDDED_APP_NAME = "orider-embedded";
const APP_CHECK_TOKEN_TIMEOUT_MS = 12_000;

let embeddedApp: FirebaseApp | undefined;
export let embeddedAuth: Auth;
export let embeddedFirestore: Firestore;
export let embeddedFunctions: Functions;
let embeddedAppCheck: AppCheck | undefined;
let appCheckPromise: Promise<void> | null = null;
let appCheckRefreshPromise: Promise<void> | null = null;
let emulatorRuntime = false;

export interface EmbeddedFirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
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
  embeddedFirestore = initializeFirestore(embeddedApp, { localCache: memoryLocalCache() });
  embeddedFunctions = getFunctions(
    embeddedApp,
    runtimeConfig.firebaseFunctionsRegion || "us-central1",
  );

  if (emulatorRuntime) {
    connectAuthEmulator(embeddedAuth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(embeddedFirestore, "localhost", 8080);
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
