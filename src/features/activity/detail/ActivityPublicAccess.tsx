import { withActivityPresentation } from "@shared/analysis/activityPresentation";
import PublicActivitySafety from "../../../embedded/surfaces/PublicActivitySafety";
import { useMemo, useRef, type ReactNode } from "react";
import type { Activity, ActivitySummary } from "@shared/types";
import { ACTIVITY_METRICS_VERSION } from "@shared/types/activity-metrics";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../contexts/AuthContext";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { usePublicActivitySession, type PublicActivitySessionOptions } from "../../../hooks/usePublicActivitySession";
import type { PublicActivityModelInput } from "../../../hooks/useActivityAnalysisModel";
import type { ActivityMetricsDoc, UseActivityMetricsState } from "../../../hooks/useActivityMetrics";
import EmbeddedSurfaceState from "../../../embedded/surfaces/EmbeddedSurfaceState";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Text } from "../../../theme/components";
import { activityFeedSourceRevision } from "../../../services/activityFeedContent";
export type ActivityPublicAccessState = { session: ReturnType<typeof usePublicActivitySession>; model: PublicActivityModelInput };
function metricsState(raw: Record<string, unknown> | null | undefined): UseActivityMetricsState {
 if (!raw) return { status: "missing", metrics: null };
 const envelope = "schemaVersion" in raw || "status" in raw;
 if (envelope && (raw.status !== "final" || !raw.metrics || typeof raw.metrics !== "object")) return { status: raw.status === "pending" ? "loading" : "missing", metrics: null };
 const metrics = (envelope ? raw.metrics : raw) as ActivityMetricsDoc;
 return { status: raw.stale === true || (metrics.version ?? 0) < ACTIVITY_METRICS_VERSION ? "stale" : "ready", metrics };
}
export function ActivityPublicAccess(props: PublicActivitySessionOptions & { children: (access: ActivityPublicAccessState) => ReactNode }) {
 const { user } = useAuth(), services = useFirebaseServices();
 const identity = useMemo(() => ({ user, sdkUser: services.auth.currentUser, services, activityId: props.activityId }), [user, services.auth.currentUser, services, props.activityId]);
 const key = useRef({ identity, generation: 0 });
 if (key.current.identity !== identity) key.current = { identity, generation: key.current.generation + 1 };
 return <ActivityPublicAccessSession key={key.current.generation} {...props} />;
}
function ActivityPublicAccessSession({ children, ...options }: PublicActivitySessionOptions & { children: (access: ActivityPublicAccessState) => ReactNode }) {
 const session = usePublicActivitySession(options);
 const { t } = useTranslation("activity");
 const { detail, mapFresh, verifiedMap, client } = session;
 const model = useMemo<PublicActivityModelInput>(() => {
   if (!detail) return { activity: null, metrics: { status: "missing", metrics: null } };
   const a = detail.activity;
   const map = mapFresh && verifiedMap?.client === client ? verifiedMap.value : null;
   const activity = { ...a, summary: a.summary as unknown as ActivitySummary,
     thumbnailTrack: map?.encodedPolyline ?? "", mapImageUrl: map?.imageUrl ?? null,
     photoCount: detail.content.totalPhotoCount ?? detail.content.photos?.length ?? 0,
   } as unknown as Activity;
   if (detail.content.status === "ready") activity.feedContentV1 = { version: 1, sourceRevision: activityFeedSourceRevision(activity), revision: a.activityRevision ?? "current-access",
     memo: detail.content.memo ?? null, memoTruncated: detail.content.memoTruncated === true, photos: detail.content.photos ?? [], totalPhotoCount: activity.photoCount ?? 0, totalPhotoCountExact: detail.content.totalPhotoCountExact };
   return { activity: withActivityPresentation(activity), metrics: metricsState(detail.metrics), accessRevision: JSON.stringify([a.id, a.activityRevision, detail.metrics?.revisionId, detail.metrics?.etag]), onAccessRevoked: session.revokeAccess };
 }, [detail, mapFresh, verifiedMap, client]);
 if (session.removed?.scope === session.safetyScope) return <div className="site-shell"><Text role="status" tabIndex={-1} ref={node => node?.focus()}>{t(`publicSafety.${session.removed.action}Done`)}</Text><LocalizedLink to="/">{t("publicSafety.home")}</LocalizedLink></div>;
 if (session.loading || session.failed || !detail) return <EmbeddedSurfaceState title={t("publicDetail.title")} loading={session.loading} message={session.accessDenied ? t("publicDetail.accessDenied") : undefined} onRetry={session.retry} />;
 return <><div hidden={!session.mapFresh}>{children({ session, model })}{session.user && !session.user.isAnonymous && session.user.uid !== detail.activity.userId && <section className="site-shell" aria-label={t("publicSafety.actions")}><PublicActivitySafety activityId={detail.activity.id} authorId={detail.activity.userId} client={session.client} onRemoved={session.remove} onAccessRevoked={session.revokeAccess} /></section>}</div>{!session.mapFresh && <EmbeddedSurfaceState title={t("publicDetail.title")} message={t("publicDetail.mapLoading")} onRetry={session.retry} />}</>;
}
