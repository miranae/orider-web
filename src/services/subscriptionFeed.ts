import { httpsCallable } from "firebase/functions";
import type { Activity } from "@shared/types";
import { auth, ensureAppCheckReady } from "./firebase";
import { getActivitySocialFunctions } from "./activitySocialFunctions";
import { ACTIVITY_SUBSCRIPTIONS_ENABLED, activitySubscriptionsBackendReady } from "../config/activitySubscriptions";

/** 구독 후보는 서버의 최신 접근권한·숨김 판정을 통과하기 전 표시하지 않는다. */
export async function admitSubscriptionActivities(uid: string, items: Activity[]): Promise<Activity[]> {
  const assertViewer = () => {
    if (!ACTIVITY_SUBSCRIPTIONS_ENABLED || !activitySubscriptionsBackendReady() || auth.currentUser?.uid !== uid || auth.currentUser.isAnonymous) throw new Error("subscription-feed-viewer-changed");
  };
  assertViewer();
  if (!items.length) return [];
  await ensureAppCheckReady();
  assertViewer();
  const allowed = new Set<string>();
  for (let index = 0; index < items.length; index += 50) {
    const activityIds = items.slice(index, index + 50).map(item => item.id);
    const result = await httpsCallable<{ activityIds: string[]; publicOnly: boolean }, { schemaVersion: number; allowedActivityIds: string[] }>(getActivitySocialFunctions(), "validateActivitySocialFeedCandidates", { timeout: 10000 })({ activityIds, publicOnly: true });
    assertViewer();
    if (result.data.schemaVersion !== 1 || !Array.isArray(result.data.allowedActivityIds)
      || result.data.allowedActivityIds.some(id => typeof id !== "string" || !activityIds.includes(id))) throw new Error("subscription-feed-invalid-admission");
    result.data.allowedActivityIds.forEach(id => allowed.add(id));
  }
  return items.filter(item => allowed.has(item.id));
}
