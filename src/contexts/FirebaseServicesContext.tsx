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

const defaultServices: FirebaseServices = {
  auth,
  firestore,
  functions,
  ensureAppCheckReady,
};

const FirebaseServicesContext = createContext<FirebaseServices>(defaultServices);

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
  return useContext(FirebaseServicesContext);
}
