import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions, getAppCheckToken } from "../../../services/firebase";
import { isEmulatorRuntime } from "../../../services/runtimeConfig";

export async function cancelEventRegistration(eventId: string): Promise<void> {
  const requestUid = auth.currentUser?.uid;
  if (!requestUid) throw new Error("SIGN_IN_REQUIRED");
  let initialAuthObserved = false;
  let authGeneration = 0;
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (initialAuthObserved || user?.uid !== requestUid) authGeneration += 1;
    initialAuthObserved = true;
  });
  try {
    const token = await getAppCheckToken();
    if (!token && !isEmulatorRuntime()) throw new Error("app-check/empty-token");
    if (authGeneration !== 0 || auth.currentUser?.uid !== requestUid) throw new Error("AUTH_CONTEXT_CHANGED");
    const fn = httpsCallable<{ eventId: string }, { success: true }>(functions, "cancelRegistration");
    const { data } = await fn({ eventId });
    if (data.success !== true) throw new Error("cancel-registration-failed");
  } finally {
    unsubscribe();
  }
}
