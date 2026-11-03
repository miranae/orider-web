import type { FirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
// 일반 웹 호출의 기본값이며 임베드는 주입한 서비스를 사용한다.
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed
import { auth, functions, getAppCheckToken } from "../../../services/firebase";
import { isEmulatorRuntime } from "../../../services/runtimeConfig";

export async function cancelEventRegistration(eventId: string, services?: Pick<FirebaseServices, "auth" | "functions" | "getAppCheckToken">): Promise<void> {
  const provider = services ?? { auth, functions, getAppCheckToken };
  const { auth: sessionAuth, functions: sessionFunctions, getAppCheckToken: sessionToken } = provider;
  const requestUid = sessionAuth.currentUser?.uid;
  if (!requestUid) throw new Error("SIGN_IN_REQUIRED");
  let initialAuthObserved = false;
  let authGeneration = 0;
  const unsubscribe = onAuthStateChanged(sessionAuth, (user) => {
    if (initialAuthObserved || user?.uid !== requestUid) authGeneration += 1;
    initialAuthObserved = true;
  });
  try {
    const token = await sessionToken();
    if (!token && !isEmulatorRuntime()) throw new Error("app-check/empty-token");
    if (authGeneration !== 0 || sessionAuth.currentUser?.uid !== requestUid) throw new Error("AUTH_CONTEXT_CHANGED");
    const fn = httpsCallable<{ eventId: string }, { success: true }>(sessionFunctions, "cancelRegistration");
    const { data } = await fn({ eventId });
    if (data.success !== true) throw new Error("cancel-registration-failed");
  } finally {
    unsubscribe();
  }
}
