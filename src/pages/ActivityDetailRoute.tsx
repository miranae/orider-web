import { NotificationCommentTarget } from "../components/notifications/NotificationCommentTarget";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { collection, documentId, getDocs, limit, query, where } from "firebase/firestore";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { createPublicActivityClient, isPublicActivityAccessError, type PublicActivityDetail } from "../services/publicActivityDetail";
import PublicActivitySurface from "../embedded/surfaces/PublicActivitySurface";
import EmbeddedSurfaceState from "../embedded/surfaces/EmbeddedSurfaceState";

const OwnerActivityPage = lazy(() => import("./ActivityPage"));
const ignore = () => {};

/** Resolve access using a public projection before mounting any owner data hooks. */
export default function ActivityDetailRoute() {
  return <><NotificationCommentTarget />{!getRuntimeConfig().publicActivityDetailEnabled ? <OwnerActivityPage /> : <PublicActivityDetailRoute />}</>;
}

function PublicActivityDetailRoute() {
  const { activityId } = useParams<{ activityId: string }>();
  const { user, loading: authLoading } = useAuth();
  const services = useFirebaseServices();
  const { t } = useTranslation("activity");
  const uid = user?.uid ?? null;
  const key = JSON.stringify([activityId, uid]);
  const client = useMemo(() => createPublicActivityClient(services), [services, user]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ owner: typeof user; key: string; detail?: PublicActivityDetail; failed?: boolean; ownerFallback?: boolean; accessDenied?: boolean } | null>(null);
  useEffect(() => {
    if (!activityId || authLoading) return;
    let active = true;
    setState(null);
    void client.load(activityId).then(detail => { if (active) setState({ owner: user, key, detail }); })
      .catch(async error => {
        // During a separate backend rollout, preserve existing owner analysis only after
        // a server-filtered ownership read. Never fetch an unfiltered activity as fallback.
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        if (uid && !user?.isAnonymous && !isPublicActivityAccessError(error) && code !== "functions/unauthenticated") {
          try {
            const owned = await getDocs(query(collection(services.firestore, "activities"),
              where(documentId(), "==", activityId), where("userId", "==", uid), limit(1)));
            if (!active) return;
            if (services.auth.currentUser === user && !owned.metadata?.fromCache && !owned.metadata?.hasPendingWrites && owned.docs.some(doc => doc.id === activityId && doc.data().userId === uid)) {
              setState({ owner: user, key, ownerFallback: true }); return;
            }
          } catch { /* Fail closed for missing, denied, or unavailable owner reads. */ }
        }
        if (active) setState({ owner: user, key, failed: true, accessDenied: isPublicActivityAccessError(error) });
      });
    return () => { active = false; };
  }, [activityId, authLoading, client, key, attempt, uid, user, services]);
  const current = !authLoading && state?.key === key && state.owner === user ? state : null;
  if (current?.ownerFallback) return <Suspense fallback={<EmbeddedSurfaceState title={t("publicDetail.title")} loading />}><OwnerActivityPage key={key} /></Suspense>;
  if (!activityId || !current?.detail) return <EmbeddedSurfaceState title={t("publicDetail.title")} loading={!!activityId && !current?.failed} message={current?.accessDenied ? t("publicDetail.accessDenied") : undefined} onRetry={() => setAttempt(value => value + 1)} />;
  if (uid && !user?.isAnonymous && current.detail.activity.userId === uid) return <Suspense fallback={<EmbeddedSurfaceState title={t("publicDetail.title")} loading />}><OwnerActivityPage key={key} /></Suspense>;
  return <PublicActivitySurface key={key} activityId={activityId} retryKey={0} initialDetail={current.detail} onReady={ignore} onError={ignore} />;
}
