import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator, signInWithEmailAndPassword, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";

let app: FirebaseApp;
let _auth: Auth;
let _firestore: Firestore;
let _storage: FirebaseStorage;
let _functions: Functions;
let appCheckPromise: Promise<void> | null = null;

/** main.tsx에서 렌더링 전 호출. Hosting site별 runtime-config.json 기반 config 사용. */
export async function initFirebase() {
  const runtimeConfig = getRuntimeConfig();
  const config = {
    apiKey: runtimeConfig.firebaseApiKey,
    authDomain: runtimeConfig.firebaseAuthDomain,
    projectId: runtimeConfig.firebaseProjectId,
    storageBucket: runtimeConfig.firebaseStorageBucket,
    messagingSenderId: runtimeConfig.firebaseMessagingSenderId,
    appId: runtimeConfig.firebaseAppId,
  };

  // env 누락 시 SDK 의 모호한 "auth/invalid-api-key" 대신 명확한 에러로 즉시 실패.
  // 2026-05-13 사고 — env 없이 빌드된 번들이 프로덕션 배포되어 화이트스크린.
  // 빌드 단계 (web/scripts/check-env.mjs) 가 1차 방어, 이건 런타임 fail-fast 의 보강.
  const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;
  const missing = requiredKeys.filter((k) => !config[k]);
  if (missing.length > 0) {
    throw new Error(
      `Firebase config 누락: ${missing.join(", ")}. ` +
        `runtime-config.json 또는 VITE_FIREBASE_* fallback 주입을 확인하세요.`,
    );
  }

  app = initializeApp(config);
  _auth = getAuth(app);
  _firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  _storage = getStorage(app);
  _functions = getFunctions(app, runtimeConfig.firebaseFunctionsRegion || "us-central1");

  // Analytics(gtag.js ~421kB)는 더 이상 init 경로에서 로드하지 않는다 — 콜드 첫 로드 대역을
  // LCP/폰트 등 임계 리소스에 양보하기 위해 main.tsx 가 idle 시점에 initAnalytics() 로 지연
  // 초기화한다. init 전 발생한 이벤트는 analytics.ts 의 큐가 보관 → init 시 flush(드롭 0).

  if (isEmulatorRuntime()) {
    connectAuthEmulator(_auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(_firestore, 'localhost', 8080);
    connectFunctionsEmulator(_functions, 'localhost', 5001);
    // Expose login helper for E2E tests
    (window as any).__e2eSignIn = (email: string, pw: string) =>
      signInWithEmailAndPassword(_auth, email, pw);
  }
}

export { _auth as auth, _firestore as firestore, _storage as storage, _functions as functions };
export const googleProvider = new GoogleAuthProvider();

/** 초기화된 FirebaseApp 반환 (initFirebase 전이면 undefined). analytics 지연 init 용. */
export function getFirebaseApp(): FirebaseApp | undefined {
  return app;
}

/**
 * App Check 초기화는 첫 공개 피드 로딩 이후로 분리한다.
 * Firestore 첫 read/LCP 경로에서 reCAPTCHA Enterprise + installations round-trip 이
 * 먼저 실행되면 피드 이미지 discovery 가 밀린다. Callable Functions 는 호출 전에
 * 이 promise 를 await 해서 enforceAppCheck 보안 경로를 유지한다.
 */
export function ensureAppCheckReady(): Promise<void> {
  if (appCheckPromise) return appCheckPromise;
  appCheckPromise = Promise.resolve().then(() => {
    const runtimeConfig = getRuntimeConfig();
    const appCheckSiteKey = runtimeConfig.appCheckRecaptchaSiteKey;
    if (!app || !appCheckSiteKey || isEmulatorRuntime()) return;
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }).catch((err) => {
    appCheckPromise = null;
    throw err;
  });
  return appCheckPromise;
}
