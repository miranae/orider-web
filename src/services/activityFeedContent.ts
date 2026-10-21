import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { toMillis } from "../utils/timeAgo";
import type { Activity } from "@shared/types";
import type { ActivityFeedContent, ActivityFeedContentProjection } from "@shared/types/activity-feed-content";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";

export function activityFeedSourceRevision(activity: Activity): string {
  const revision = activity as Activity & { activityRevision?: string | number; stravaSegmentEnrichmentRevision?: string | number };
  return JSON.stringify([activity.id, activity.userId, revision.activityRevision ?? null, activity.contentRevision ?? null,
    activity.contentSelectedRevision ?? null, revision.stravaSegmentEnrichmentRevision ?? null]);
}

const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
export function localActivityFeedContentUrl(dev: boolean, hostname: string, configured?: string): string | null {
  return dev && loopback.has(hostname) && configured === "/api/local/activity-feed-content" ? configured : null;
}
export const activityFeedContentPreviewUrl = () => localActivityFeedContentUrl(import.meta.env.DEV,
  typeof window === "undefined" ? "" : window.location.hostname, import.meta.env.VITE_ACTIVITY_FEED_CONTENT_PREVIEW_URL);

/** Reject incomplete projections rather than deriving photo paths or treating a title as a memo. */
export function boundedFeedContent(value: unknown): ActivityFeedContentProjection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as ActivityFeedContentProjection;
  if (data.version !== 1 || typeof data.revision !== "string" || typeof data.sourceRevision !== "string"
    || !Array.isArray(data.photos) || !Number.isFinite(data.totalPhotoCount)) return null;
  return {
    version: 1, revision: data.revision, sourceRevision: data.sourceRevision,
    memo: typeof data.memo === "string" ? data.memo.slice(0, 32768) : null,
    memoTruncated: data.memoTruncated === true || (typeof data.memo === "string" && data.memo.length > 32768),
    photos: data.photos.filter(photo => photo && typeof photo.id === "string" && typeof photo.url === "string"
      && /^https:\/\//i.test(photo.url)).slice(0, 5).map(photo => ({ id: photo.id, url: photo.url, caption: typeof photo.caption === "string" ? photo.caption : null })),
    totalPhotoCount: Math.max(0, Math.floor(data.totalPhotoCount)),
  };
}

/** Local review only. Production reads the optional published Activity projection without a new request. */
export async function loadLocalActivityFeedContent(services: FirebaseServices, activityId: string, signal: AbortSignal): Promise<ActivityFeedContent | null> {
  const url = activityFeedContentPreviewUrl();
  if (!url) return null;
  const uid = services.auth.currentUser?.uid ?? null;
  const token = await services.auth.currentUser?.getIdToken();
  const response = await fetch(url, { method: "POST", signal, headers: {
    "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify({ activityId }) });
  if (services.auth.currentUser?.uid !== (uid ?? undefined)) throw new Error("account_changed");
  if (!response.ok) throw new Error(`feed_content_${response.status}`);
  const data = await response.json() as ActivityFeedContent;
  if (data.activityId !== activityId || data.status !== "ready") return null;
  const projection = boundedFeedContent(data);
  if (!projection) throw new Error("invalid_feed_content");
  return { ...projection, activityId, status: "ready", comments: Array.isArray(data.comments) ? data.comments.filter(comment =>
    comment && typeof comment.id === "string" && typeof comment.userId === "string" && typeof comment.nickname === "string"
    && typeof comment.text === "string" && Number.isFinite(comment.createdAt)).slice(0, 3) : [] };
}

/** Same protected comment collection as activity detail, bounded to nine candidates and three visible rows. */
export async function loadActivityFeedComments(services: FirebaseServices, uid: string, activityId: string, signal: AbortSignal): Promise<ActivityFeedContent["comments"]> {
  const viewer = services.auth.currentUser;
  if (!viewer || viewer.uid !== uid || viewer.isAnonymous || signal.aborted) return [];
  const snapshot = await getDocs(query(collection(services.firestore, "activities", activityId, "comments"),
    where("deletedAt", "==", null), orderBy("createdAt", "asc"), limit(9)));
  if (signal.aborted || services.auth.currentUser !== viewer) throw new Error("account_changed");
  return snapshot.docs.flatMap(document => {
    const data = document.data();
    const createdAt = toMillis(data.createdAt);
    if (data.hiddenByOwner === true || data.deletedAt != null || typeof data.userId !== "string"
      || typeof data.nickname !== "string" || typeof data.text !== "string" || !Number.isFinite(new Date(createdAt).getTime())) return [];
    return [{ id: document.id, userId: data.userId, nickname: data.nickname,
      profileImage: typeof data.profileImage === "string" ? data.profileImage : null, text: data.text, createdAt }];
  }).slice(0, 3);
}
