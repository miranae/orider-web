import { lazyWithRetry as lazy } from "../utils/lazyWithRetry";
import { startJourneyMeasurement, type JourneyOutcome } from "../services/journeyMeasurement";
import { NotificationCommentTarget } from "../components/notifications/NotificationCommentTarget";
import { Suspense, useEffect, useMemo, useState } from "react";
import { collection, documentId, getDocs, limit, query, where } from "firebase/firestore";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { logClientError } from "../services/errorLogger";
import { useAuth } from "../contexts/AuthContext";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { createPublicActivityClient, isPublicActivityAccessError, type PublicActivityDetail } from "../services/publicActivityDetail";
import EmbeddedSurfaceState from "../embedded/surfaces/EmbeddedSurfaceState";
import ActivityDetailLoading from "../features/activity/detail/ActivityDetailLoading";

const loadActivityPage = () => import("./ActivityPage");
const OwnerActivityPage = lazy(loadActivityPage);
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
  const client = useMemo(() => createPublicActivityClient(services), [services, user, services.auth.currentUser]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ owner: typeof user; client: typeof client; key: string; detail?: PublicActivityDetail; verifiedAt?: number; failed?: boolean; ownerFallback?: boolean; accessDenied?: boolean; finish: (outcome: JourneyOutcome) => void } | null>(null);
  useEffect(() => {
    if (!activityId || authLoading) return;
    // Start access resolution and the heavy map/chart module together. The
    // route shell must not download the full detail page before calling the API.
    void loadActivityPage().catch(error => logClientError("ActivityDetailRoute.preload", error, { stage: "detail_chunk" }, services));
    let active = true;
    const finish = startJourneyMeasurement("activity_detail_ready", "web_public_activity", "detail");
    const hidden = () => { if (document.visibilityState === "hidden") finish("cancelled"); };
    document.addEventListener("visibilitychange", hidden); hidden();
    setState(null);
    void client.load(activityId).then(detail => { if (active) setState({ owner: user, client, key, detail, verifiedAt: Date.now(), finish }); })
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
              setState({ owner: user, client, key, ownerFallback: true, finish }); return;
            }
          } catch { /* Fail closed for missing, denied, or unavailable owner reads. */ }
        }
        if (active) { setState({ owner: user, client, key, failed: true, accessDenied: isPublicActivityAccessError(error), finish }); finish(isPublicActivityAccessError(error) ? "access_denied" : "error"); }
      });
    return () => { active = false; finish("cancelled"); document.removeEventListener("visibilitychange", hidden); };
  }, [activityId, authLoading, client, key, attempt, uid, user, services]);
  const current = !authLoading && state?.key === key && state.owner === user && state.client === client ? state : null;
  if (current?.ownerFallback) return <Suspense fallback={<ActivityDetailLoading />}><OwnerActivityPage key={key} detailMeasurement={current.finish} detailRetry={() => setAttempt(value => value + 1)} /></Suspense>;
  if (activityId && !current?.failed && !current?.detail) return <ActivityDetailLoading />;
  if (!activityId || !current?.detail) return <EmbeddedSurfaceState title={t("publicDetail.title")} loading={!!activityId && !current?.failed} message={current?.accessDenied ? t("publicDetail.accessDenied") : undefined} onRetry={() => setAttempt(value => value + 1)} />;
  if (uid && !user?.isAnonymous && current.detail.activity.userId === uid) return <Suspense fallback={<ActivityDetailLoading activity={current.detail.activity} verifiedAt={current.verifiedAt} />}><OwnerActivityPage key={key} initialOwnerActivity={current.detail.activity} initialOwnerActivityVerifiedAt={current.verifiedAt} detailMeasurement={current.finish} detailRetry={() => setAttempt(value => value + 1)} /></Suspense>;
  return <Suspense fallback={<ActivityDetailLoading />}><OwnerActivityPage key={key} publicAccess={{ activityId, retryKey: 0, initialDetail: current.detail, initialDetailVerifiedAt: current.verifiedAt, detailMeasurement: current.finish, onDetailRetry: () => setAttempt(value => value + 1), onReady: ignore, onError: ignore }} /></Suspense>;
}
