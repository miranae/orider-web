import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { createPublicActivityClient, type PublicActivityDetail } from "../../../services/publicActivityDetail";
import { logClientError } from "../../../services/errorLogger";

export function isTransientActivityReadError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return ["unavailable", "deadline-exceeded", "firestore/unavailable", "firestore/deadline-exceeded"].includes(code);
}
/** Recovery reads only. Existing public-access presentation supplies its own current ACL lifecycle. */
export function OwnerDetailReadFallback({ activityId, error, fallback, children }: {
  activityId: string; error: unknown; fallback: ReactNode; children: (detail: PublicActivityDetail) => ReactNode;
}) {
  const services = useFirebaseServices();
  const { user } = useAuth();
  const sdkUser = services.auth.currentUser;
  const scope = useMemo(() => ({ activityId, user, sdkUser, services, error }), [activityId, user, sdkUser, services, error]);
  const [result, setResult] = useState<{ scope: typeof scope; detail: PublicActivityDetail } | null>(null);
  useEffect(() => {
    if (!isTransientActivityReadError(error) || !user || user.isAnonymous || sdkUser !== user) return;
    const controller = new AbortController();
    const client = createPublicActivityClient(services, { timeoutMs: 3000, signal: controller.signal });
    void client.load(activityId).then(detail => {
      if (!controller.signal.aborted && services.auth.currentUser === sdkUser && detail.activity.userId === sdkUser.uid) setResult({ scope, detail });
    }).catch(fallbackError => {
      // Preserve the original error and explicit retry; never bypass an ACL denial. Keep the failure observable.
      if (controller.signal.aborted) return;
      logClientError("OwnerDetailReadFallback.load", fallbackError, {
        activityId,
        originalCode: error && typeof error === "object" && "code" in error ? String(error.code) : null,
      }, services);
    });
    return () => controller.abort();
  }, [scope, activityId, error, user, sdkUser, services]);
  return result?.scope === scope && services.auth.currentUser === sdkUser ? children(result.detail) : fallback;
}
