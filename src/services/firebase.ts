import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator, signInWithEmailAndPassword, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

let app: FirebaseApp;
let _auth: Auth;
let _firestore: Firestore;
let _storage: FirebaseStorage;
let _functions: Functions;

/** main.tsx에서 렌더링 전 호출. .env 기반 config 사용 (호스팅과 백엔드가 다른 프로젝트이므로 init.json 미사용) */
export async function initFirebase() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  // env 누락 시 SDK 의 모호한 "auth/invalid-api-key" 대신 명확한 에러로 즉시 실패.
  // 2026-05-13 사고 — env 없이 빌드된 번들이 프로덕션 배포되어 화이트스크린.
  // 빌드 단계 (web/scripts/check-env.mjs) 가 1차 방어, 이건 런타임 fail-fast 의 보강.
  const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;
  const missing = requiredKeys.filter((k) => !config[k]);
  if (missing.length > 0) {
    throw new Error(
      `Firebase config 누락: ${missing.join(", ")}. ` +
        `VITE_FIREBASE_* 환경 변수가 빌드 시점에 주입되었는지 확인하세요.`,
    );
  }

  app = initializeApp(config);
  const appCheckSiteKey = import.meta.env.VITE_APPCHECK_RECAPTCHA_SITE_KEY;
  if (appCheckSiteKey && import.meta.env.VITE_USE_EMULATORS !== 'true') {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  _auth = getAuth(app);
  _firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  _storage = getStorage(app);
  _functions = getFunctions(app, import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1");

  // Analytics(gtag.js ~421kB)는 더 이상 init 경로에서 로드하지 않는다 — 콜드 첫 로드 대역을
  // LCP/폰트 등 임계 리소스에 양보하기 위해 main.tsx 가 idle 시점에 initAnalytics() 로 지연
  // 초기화한다. init 전 발생한 이벤트는 analytics.ts 의 큐가 보관 → init 시 flush(드롭 0).

  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
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

