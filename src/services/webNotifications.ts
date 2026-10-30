import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { Notification } from "@shared/types";
import type { ActivityFeedComment } from "@shared/types/activity-feed-content";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";
export interface NotificationPreferences { push: boolean; kudos: boolean; comment: boolean; weeklyDigestEmail: boolean }
const connected = new WeakSet<object>();
export function createWebNotificationClient(services: FirebaseServices) {
  const viewer = services.auth.currentUser;
  const assertAccount = () => {
    if (!viewer || viewer.isAnonymous) throw new Error("sign_in_required");
    if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  };
  async function call<T>(name: string, payload: object): Promise<T> {
    assertAccount(); await services.ensureAppCheckReady(); assertAccount();
    const functions = getRuntimeConfig().appEnvironment === "stage" ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
    if (isEmulatorRuntime() && !connected.has(functions)) {
      connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001)); connected.add(functions);
    }
    const result = await httpsCallable<object, T>(functions, name, { timeout: 10000 })(payload);
    assertAccount(); return result.data;
  }
  return {
    getPreferences: () => call<NotificationPreferences>("getNotificationPreferences", {}),
    setPreferences: (patch: Partial<NotificationPreferences>) => call<NotificationPreferences>("setNotificationPreferences", patch),
    async list(cursor: string | null = null) {
      const page = await call<{ items: Notification[]; nextCursor: string | null }>("getWebNotifications", { limit: 20, ...(cursor ? { cursor } : {}) });
      // Unavailable envelopes intentionally contain no actor, activity or comment identifiers.
      return { ...page, items: page.items.map(item => item.access === "unavailable" || item.type === "unavailable"
        ? { id: item.id, type: "unavailable" as const, access: "unavailable" as const, read: item.read, createdAt: item.createdAt,
          fromUserId: "", fromNickname: "", fromProfileImage: null, activityId: null, segmentId: null, message: "" }
        : item) };
    },
    markRead: (ids: string[]) => call<{ ids: string[] }>("markWebNotificationsRead", { ids }),
    comment: (activityId: string, commentId: string) => call<{ comment: ActivityFeedComment | null }>("getActivityPublicComment", { activityId, commentId }),
  };
}
