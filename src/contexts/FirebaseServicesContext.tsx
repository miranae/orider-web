import { createContext, useContext, type ReactNode } from "react";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";

// 이 파일이
// **기본값 자체를 정의**한다. 임베드는 Provider 로 임베드 전용 인스턴스를 덮어쓴다.
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed
import {
  auth,
  ensureAppCheckReady,
  firestore,
  functions,
} from "../services/firebase";

export interface FirebaseServices {
  auth: Auth;
  firestore: Firestore;
  functions: Functions;
  ensureAppCheckReady: (forceRefresh?: boolean) => Promise<void>;
}

// 주입이 없으면 `null` — 기본값을 **모듈 평가 시점에 객체로 만들지 않는다**.
// `services/firebase` 의 auth/firestore/functions 는 initFirebase() 에서야 채워지는
// live binding 이라, 여기서 객체 리터럴로 복사하면 import 시점의 undefined 가 그대로
// 굳는다(main.tsx 는 모든 import 평가가 끝난 뒤에 initFirebase 를 부른다).
// 2026-08-28 사고 — 로그인 이후 표면 전역이 `collection()` 에서 던져 무한 재마운트.
const FirebaseServicesContext = createContext<FirebaseServices | null>(null);

let singletonServices: FirebaseServices | null = null;

/**
 * 호출 시점에 live binding 을 읽어 싱글턴 묶음을 만든다. 같은 인스턴스 조합이면 같은
 * 객체를 돌려줘 참조가 안정적이다(소비처가 services 객체를 의존성에 쓰는 경우 대비).
 */
function liveSingletonServices(): FirebaseServices {
  if (
    !singletonServices
    || singletonServices.auth !== auth
    || singletonServices.firestore !== firestore
    || singletonServices.functions !== functions
  ) {
    singletonServices = { auth, firestore, functions, ensureAppCheckReady };
  }
  return singletonServices;
}

export function FirebaseServicesProvider({
  children,
  services,
}: {
  children: ReactNode;
  services: FirebaseServices;
}) {
  return (
    <FirebaseServicesContext.Provider value={services}>
      {children}
    </FirebaseServicesContext.Provider>
  );
}

/** Normal web consumers keep the existing singleton services by default. */
export function useFirebaseServices(): FirebaseServices {
  return useContext(FirebaseServicesContext) ?? liveSingletonServices();
}
