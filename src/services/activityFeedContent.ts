import { isNativePhotoReference, isLegacyActivityPhotoUrl } from "./nativeActivityPhoto";
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

/** 저장된 현재 활동의 본문만 선택한다. 열람으로 요약 생성·저장을 요청하지 않는다. */
export function resolveActivityMemo(activity: Activity, lang: "ko" | "en", content: unknown = activity.feedContentV1): {
  memo: string; authored: boolean; truncated: boolean;
} | null {
  const sourceRevision = activityFeedSourceRevision(activity);
  const authored = boundedFeedContent(content);
  if (authored?.sourceRevision === sourceRevision && authored.memo?.trim())
    return { memo: authored.memo, authored: true, truncated: authored.memoTruncated };
  if (activity.source !== "orider" && activity.source !== "strava") return null;
  const summary = activity.defaultSummaryV1;
  if (!summary || summary.version !== 1 || summary.state !== "ready" || summary.sourceRevision !== sourceRevision
    || typeof summary.formatterVersion !== "string" || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(summary.formatterVersion)
    || typeof summary.inputDigest !== "string" || !/^[a-f0-9]{64}$/i.test(summary.inputDigest)) return null;
  const memo = summary.text?.[lang];
  return typeof memo === "string" && memo.trim() && memo.length <= 3500
    ? { memo, authored: false, truncated: false } : null;
}

const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
export function localActivityFeedContentUrl(dev: boolean, hostname: string, configured?: string): string | null {
  return dev && loopback.has(hostname) && configured === "/api/local/activity-feed-content" ? configured : null;
}
export const activityFeedContentPreviewUrl = () => localActivityFeedContentUrl(import.meta.env.DEV,
  typeof window === "undefined" ? "" : window.location.hostname, import.meta.env.VITE_ACTIVITY_FEED_CONTENT_PREVIEW_URL);

function safeVideoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? value : null;
  } catch { return null; }
}

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
    photos: data.photos.filter(photo => photo && typeof photo.id === "string" && (isNativePhotoReference(photo.nativePhoto) || (typeof photo.url === "string"
      && /^https:\/\//i.test(photo.url) && !isLegacyActivityPhotoUrl(photo.url)))).slice(0, 5).map(photo => {
      const videoUrl = safeVideoUrl(photo.videoUrl);
      return { id: photo.id, url: photo.nativePhoto ? "" : photo.url, ...(isNativePhotoReference(photo.nativePhoto) ? { nativePhoto: photo.nativePhoto } : {}), caption: typeof photo.caption === "string" ? photo.caption : null,
        ...(photo.kind === "video" && videoUrl ? {
          kind: "video" as const, videoUrl,
          ...(typeof photo.durationSeconds === "number" && Number.isFinite(photo.durationSeconds) && photo.durationSeconds >= 0 ? { durationSeconds: photo.durationSeconds } : {}),
        } : {}),
      };
    }),
    totalPhotoCount: Math.max(0, Math.floor(data.totalPhotoCount)),
    ...(data.totalPhotoCountExact === false ? { totalPhotoCountExact: false } : {}),
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
