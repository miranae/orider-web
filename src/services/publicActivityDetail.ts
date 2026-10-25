import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { ActivityFeedContent } from "@shared/types/activity-feed-content";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";

/** Explicit public contract: never load Activity, streams, or owner metrics as a fallback. */
export interface PublicActivityDetail {
  activity: {
    id: string; userId: string; nickname: string; profileImage: string | null;
    description: string; type: string; startTime: number; kudosCount: number; commentCount: number;
    summary: Record<string, unknown>;
    effectiveFacts: { status: string; metrics: Record<string, number | null> | null };
  };
  viewerHasKudos: boolean;
  mapPreview?: { imageUrl: string | null; encodedPolyline: string | null };
  uploadedPhotosTruncated?: boolean;
  content: Pick<ActivityFeedContent, "status" | "activityId" | "comments"> & Partial<ActivityFeedContent>;
}

const emulatorClients = new WeakSet<object>();
export function createPublicActivityClient(services: FirebaseServices) {
  const uid = services.auth.currentUser?.uid ?? null;
  const assertAccount = () => {
    if ((services.auth.currentUser?.uid ?? null) !== uid) throw new Error("account_changed");
  };
  async function call<T>(name: string, payload: object): Promise<T> {
    assertAccount();
    if (name !== "getActivityPublicDetail" && (!uid || services.auth.currentUser?.isAnonymous)) throw new Error("sign_in_required");
    await services.ensureAppCheckReady();
    assertAccount();
    const functions = getRuntimeConfig().appEnvironment === "stage" ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
    if (isEmulatorRuntime() && !emulatorClients.has(functions)) {
      connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
      emulatorClients.add(functions);
    }
    const result = await httpsCallable<object, T>(functions, name, { timeout: 10000 })(payload);
    assertAccount();
    return result.data;
  }
  return {
    async load(activityId: string) {
      const data = await call<PublicActivityDetail>("getActivityPublicDetail", { activityId });
      if (data.activity?.id !== activityId || data.content?.activityId !== activityId || typeof data.viewerHasKudos !== "boolean") throw new Error("invalid_public_activity");
      return data;
    },
    setKudos: (activityId: string, enabled: boolean) => call<{ enabled: boolean }>("setActivityKudos", { activityId, enabled }),
    postComment: (activityId: string, text: string, clientRequestId: string) => call<{ commentId: string }>("postActivityComment", { activityId, text, parentId: null, clientRequestId }),
  };
}

export function isPublicActivityAccessError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  return ["functions/permission-denied", "functions/not-found", "functions/failed-precondition"].includes(code);
}
