import { collection, getCountFromServer, getDocs, limit, orderBy, query, startAfter } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, firestore, ensureAppCheckReady } from "./firebase";
import { getActivitySocialFunctions } from "./activitySocialFunctions";
import { getPublicUserProfiles, type PublicUserProfile } from "./publicProfiles";
import { activitySubscriptionsBackendReady } from "../config/activitySubscriptions";

export type SubscriptionKind = "subscriptions" | "subscribers";
export interface ActivitySubscriptionRelation { userId: string; nickname: string | null; profileImage: string | null }
export interface ActivitySubscriptionSummary { targetUid: string; subscribed: boolean; subscriberCount: number; subscriptionCount: number }
export const ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT = "orider:activity-subscriptions-changed";
function assertOwner(uid: string, expectedUser = auth.currentUser) {
  if (!uid || !expectedUser || auth.currentUser !== expectedUser || expectedUser.uid !== uid || expectedUser.isAnonymous) throw new Error("activity-subscriptions-owner-required");
  return expectedUser;
}
function assertReady(): void {
  if (!activitySubscriptionsBackendReady()) throw Object.assign(new Error("activity-subscriptions-not-deployed"), { code: "subscriptions/not-deployed" });
}
export function isSubscriptionsNotDeployed(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "subscriptions/not-deployed");
}
export async function readOwnFriendCount(uid: string): Promise<number> {
  const expectedUser = assertOwner(uid);
  const snapshot = await getCountFromServer(collection(firestore, "friends", uid, "users"));
  assertOwner(uid, expectedUser);
  return snapshot.data().count;
}
export async function readOwnSubscriptionPage(uid: string, kind: SubscriptionKind, cursor: string | null = null, options: { hydrateProfiles?: boolean } = {}) {
  return readOwnRelationshipPage(uid, kind, cursor, options);
}
export async function readOwnBlockedPage(uid: string, cursor: string | null = null) {
  return readOwnRelationshipPage(uid, "blocked", cursor, {});
}
async function readOwnRelationshipPage(uid: string, kind: SubscriptionKind | "blocked", cursor: string | null, options: { hydrateProfiles?: boolean }) {
  const expectedUser = assertOwner(uid); assertReady();
  const source = kind === "blocked" ? collection(firestore, "users", uid, "blocks") : collection(firestore, kind, uid, "users");
  const snapshot = await getDocs(query(source, orderBy("__name__"),
    ...(cursor ? [startAfter(cursor)] : []), limit(21)));
  assertOwner(uid, expectedUser);
  if (snapshot.metadata?.fromCache) throw new Error("activity-subscriptions-server-confirmation-required");
  const page = snapshot.docs.slice(0, 20);
  const profiles = options.hydrateProfiles === false ? new Map<string, PublicUserProfile>() : await getPublicUserProfiles(page.map(row => row.id));
  assertOwner(uid, expectedUser);
  return {
    items: page.map(row => {
      const profile = profiles.get(row.id);
      return { userId: row.id, nickname: profile?.nickname ?? null, profileImage: profile?.photoURL ?? null } satisfies ActivitySubscriptionRelation;
    }),
    cursor: page[page.length - 1]?.id ?? null,
    hasMore: snapshot.docs.length > 20,
  };
}
export async function getActivitySubscriptionSummary(uid: string, targetUid: string): Promise<ActivitySubscriptionSummary> {
  const expectedUser = assertOwner(uid); assertReady();
  await ensureAppCheckReady(); assertOwner(uid, expectedUser);
  const { data } = await httpsCallable<{ targetUid: string }, ActivitySubscriptionSummary>(getActivitySocialFunctions(), "getActivitySubscriptionSummary")({ targetUid });
  assertOwner(uid, expectedUser);
  if (data.targetUid !== targetUid || typeof data.subscribed !== "boolean" || !Number.isSafeInteger(data.subscriberCount)
    || data.subscriberCount < 0 || !Number.isSafeInteger(data.subscriptionCount) || data.subscriptionCount < 0) throw new Error("activity-subscriptions-invalid-response");
  return data;
}
export async function setActivitySubscription(uid: string, targetUid: string, subscribed: boolean) {
  const expectedUser = assertOwner(uid); assertReady();
  if (!targetUid || targetUid === uid || targetUid.includes("/")) throw new Error("activity-subscriptions-invalid-target");
  await ensureAppCheckReady(); assertOwner(uid, expectedUser);
  const { data } = await httpsCallable<{ targetUid: string; subscribed: boolean }, { targetUid: string; subscribed: boolean }>(getActivitySocialFunctions(), "setActivitySubscription")({ targetUid, subscribed });
  assertOwner(uid, expectedUser);
  if (data.targetUid !== targetUid || data.subscribed !== subscribed) throw new Error("activity-subscriptions-invalid-response");
  window.dispatchEvent(new CustomEvent(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, { detail: { uid } }));
  return data;
}

export async function unblockActivitySubscriptionTarget(uid: string, targetUid: string): Promise<void> {
  const expectedUser = assertOwner(uid); assertReady();
  await ensureAppCheckReady(); assertOwner(uid, expectedUser);
  const { data } = await httpsCallable<{ targetUid: string; blocked: boolean }, { targetUid: string; blocked: boolean }>(getActivitySocialFunctions(), "setActivitySocialBlock")({ targetUid, blocked: false });
  if (data.targetUid !== targetUid || data.blocked !== false) throw new Error("activity-subscriptions-invalid-response");
  assertOwner(uid, expectedUser);
  window.dispatchEvent(new CustomEvent(ACTIVITY_SUBSCRIPTIONS_CHANGED_EVENT, { detail: { uid } }));
}
