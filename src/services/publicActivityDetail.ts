import { announceActivityContentChange } from "./activityContentChanged";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { ActivityFeedComment, ActivityFeedContent } from "@shared/types/activity-feed-content";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";

/** Explicit public contract: never load Activity, streams, or owner metrics as a fallback. */
export interface PublicActivityDetail {
  activity: {
    id: string; userId: string; nickname: string; profileImage: string | null;
    description: string; type: string; startTime: number; kudosCount: number; commentCount: number;
    summary: Record<string, unknown>;
    effectiveFacts: { status: string; powerSource?: "measured" | "estimated" | "unknown" | null; metrics: Record<string, number | null> | null };
  };
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
export function createPublicActivityClient(services: FirebaseServices) {
  const owner = services.auth.currentUser;
  const uid = owner?.uid ?? null;
  const assertAccount = () => {
    if (services.auth.currentUser !== owner) throw new Error("account_changed");
  };
  async function call<T>(name: string, payload: object): Promise<T> {
    assertAccount();
    if (!["getActivityPublicDetail", "getActivityPublicComments", "getActivityPublicPhotos"].includes(name) && (!uid || services.auth.currentUser?.isAnonymous)) throw new Error("sign_in_required");
    await services.ensureAppCheckReady();
    assertAccount();
    const functions = getRuntimeConfig().appEnvironment === "stage" ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
    if (isEmulatorRuntime() && !emulatorClients.has(functions)) {
      connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
      emulatorClients.add(functions);
    }
    const result = await httpsCallable<object, T>(functions, name, { timeout: 10000 })(payload);
    assertAccount();
    if (["editActivityComment", "deleteActivityComment", "setActivityCommentHidden"].includes(name) && "activityId" in payload && typeof payload.activityId === "string") announceActivityContentChange(payload.activityId);
    return result.data;
  }
  return {
    async load(activityId: string) {
      const data = await call<PublicActivityDetail>("getActivityPublicDetail", { activityId });
      if (data.activity?.id !== activityId || data.content?.activityId !== activityId || typeof data.viewerHasKudos !== "boolean") throw new Error("invalid_public_activity");
      return data;
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
