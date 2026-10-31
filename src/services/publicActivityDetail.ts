import { markRawPartStreams } from "./activityStreamSource";
import { validatedRunEffortFacts } from "./personalDataApi";
import { announceActivityContentChange } from "./activityContentChanged";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { ActivityFeedComment, ActivityFeedContent } from "@shared/types/activity-feed-content";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";

/** Activity ACL-authorized detail; never fall back to direct private document reads. */
export interface PublicActivityDetail {
  activity: {
    id: string; userId: string; nickname: string; profileImage: string | null;
    description: string; type: string; startTime: number; endTime?: number; createdAt?: number; visibility?: "everyone" | "friends" | "followers" | "private"; source?: "orider" | "strava" | "health_connect" | "healthkit" | "unknown"; isVirtualPower?: boolean; activityRevision?: string; kudosCount: number; commentCount: number;
    groupId?: string | null; groupRideId?: string | null; segmentEffortCount?: number;
    summary: Record<string, unknown>;
    effectiveFacts: { status: string; powerSource?: "measured" | "estimated" | "unknown" | null; metrics: Record<string, number | null> | null };
  };
  metrics?: Record<string, unknown> | null;
  viewerHasKudos: boolean;
  nativeMemoRevision?: string | null;
  nativeCoverPhotoId?: string | null;
  nativeCoverRevision?: string;
  mapPreview?: { imageUrl: string | null; encodedPolyline: string | null };
  uploadedPhotosTruncated?: boolean;
  content: Pick<ActivityFeedContent, "status" | "activityId" | "comments"> & Partial<ActivityFeedContent>;
}

export interface PublicCommentsPage {
  comments: Array<ActivityFeedComment & { parentId?: string | null }>;
  nextCursor: string | null;
  scannedCount: number;
}

const emulatorClients = new WeakSet<object>();
export function createPublicActivityClient(services: FirebaseServices, options: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  const timeoutMs = Math.min(10000, Math.max(1, options.timeoutMs ?? 10000));
  const owner = services.auth.currentUser;
  const uid = owner?.uid ?? null;
  const assertAccount = () => {
    if (services.auth.currentUser !== owner) throw new Error("account_changed");
  };
  async function call<T>(name: string, payload: object): Promise<T> {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const execute = async () => {
    if (options.signal?.aborted) throw new Error("activity_request_aborted");
    assertAccount();
    if (!["getActivityPublicDetail", "getActivityPublicComments", "getActivityPublicPhotos", "getActivityPublicStreams"].includes(name) && (!uid || services.auth.currentUser?.isAnonymous)) throw new Error("sign_in_required");
    await services.ensureAppCheckReady();
    if (expired) throw new Error("activity_request_timeout");
    assertAccount();
    const functions = getRuntimeConfig().appEnvironment === "stage" ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
    if (isEmulatorRuntime() && !emulatorClients.has(functions)) {
      connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
      emulatorClients.add(functions);
    }
    const result = await httpsCallable<object, T>(functions, name, { timeout: timeoutMs })(payload);
    assertAccount();
    if (["editActivityComment", "deleteActivityComment", "setActivityCommentHidden"].includes(name) && "activityId" in payload && typeof payload.activityId === "string") announceActivityContentChange(payload.activityId);
    if (expired) throw new Error("activity_request_timeout");
    return result.data;
    };
    try { return await Promise.race([execute(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error("activity_request_timeout")); }, timeoutMs);
      onAbort = () => { expired = true; reject(new Error("activity_request_aborted")); };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
    })]); }
    finally { clearTimeout(timer); if (onAbort) options.signal?.removeEventListener("abort", onAbort); }
  }
  return {
    async load(activityId: string) {
      const data = await call<PublicActivityDetail>("getActivityPublicDetail", { activityId });
      if (data.activity?.id !== activityId || data.content?.activityId !== activityId || typeof data.viewerHasKudos !== "boolean") throw new Error("invalid_public_activity");
      return data;
    },
    async streams(activityId: string) {
      const result = await call<{ state: string; activityId: string; streamInputRevision: string | null; sourceLayer: string | null; reason: string | null; streams: import("@shared/types").ActivityStreams | null; runningBestEffortsFacts?: import("@shared/types/running-best-efforts-facts").RunningBestEffortsFacts }>("getActivityPublicStreams", { activityId, includeRunEffortFacts: true });
      if (result.activityId !== activityId || !["available", "pending", "unavailable", "changed_input"].includes(result.state)) throw new Error("invalid_activity_streams");
      if (result.state !== "available") return result;
      if (!result.streamInputRevision || !/^[a-f0-9]{64}$/.test(result.streamInputRevision) || !["raw_parts", "api_streams"].includes(result.sourceLayer ?? "") || !result.streams || Array.isArray(result.streams)) throw new Error("invalid_activity_streams");
      const streams = result.sourceLayer === "raw_parts" ? markRawPartStreams(result.streams, result.streamInputRevision) : result.streams;
      return { ...result, streams: { ...streams, runningBestEffortsFacts: validatedRunEffortFacts(result.runningBestEffortsFacts, result.streamInputRevision) ?? undefined } };
    },
    setNativeMemo: (activityId: string, memo: string, expectedMemoRevision: string) => call<{ status: "updated" | "unchanged"; memoRevision: string }>("setActivityNativeMemo", { activityId, memo, expectedMemoRevision }),
    photos: (activityId: string) => call<{ photos: NonNullable<PublicActivityDetail["content"]["photos"]>; truncated: boolean }>("getActivityPublicPhotos", { activityId }),
    comments: (activityId: string, cursor: string | null = null) => call<PublicCommentsPage>("getActivityPublicComments", { activityId, ...(cursor ? { cursor } : {}) }),
    editComment: (activityId: string, commentId: string, text: string) => call<{ commentId: string; text: string }>("editActivityComment", { activityId, commentId, text }),
    deleteComment: (activityId: string, commentId: string) => call<{ deleted: boolean }>("deleteActivityComment", { activityId, commentId }),
    reportComment: (activityId: string, commentId: string, note: string) => call<{ reportId: string }>("reportActivitySocialContent", { activityId, commentId, reason: "other", note }),
    reportActivity: (activityId: string, note: string) => call<{ reportId: string }>("reportActivitySocialContent", { activityId, reason: "other", note }),
    async hideActivity(activityId: string) {
      const result = await call<{ activityId: string; hidden: boolean }>("setActivityHidden", { activityId, hidden: true });
      if (result.activityId !== activityId || result.hidden !== true) throw new Error("invalid_hide_response");
      window.dispatchEvent(new CustomEvent("orider:activity-safety-changed", { detail: { uid, activityId, hidden: true } }));
    },
    async blockAuthor(targetUid: string) {
      if (targetUid === uid) throw new Error("cannot_block_self");
      const result = await call<{ targetUid: string; blocked: boolean }>("setActivitySocialBlock", { targetUid, blocked: true });
      if (result.targetUid !== targetUid || result.blocked !== true) throw new Error("invalid_block_response");
      window.dispatchEvent(new CustomEvent("orider:activity-safety-changed", { detail: { uid, targetUid, blocked: true } }));
      window.dispatchEvent(new CustomEvent("orider:activity-subscriptions-changed", { detail: { uid } }));
    },
    setKudos: (activityId: string, enabled: boolean) => call<{ enabled: boolean }>("setActivityKudos", { activityId, enabled }),
    postComment: (activityId: string, text: string, clientRequestId: string) => call<{ commentId: string }>("postActivityComment", { activityId, text, parentId: null, clientRequestId }),
  };
}

export function isPublicActivityAccessError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return ["functions/permission-denied", "functions/not-found", "functions/failed-precondition"].includes(code);
}
