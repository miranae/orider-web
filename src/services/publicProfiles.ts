import { SEARCH_PAGE_SIZE } from "../constants/pagination";
import { collection, doc, getDoc, getDocs, limit, query, where, orderBy, startAfter, type QueryDocumentSnapshot, type DocumentData, type Firestore } from "firebase/firestore";
import type { UserStats } from "@shared/types";
import { firestore } from "./firebase";
import { isPermissionDeniedError } from "../utils/firebaseErrors";

export interface PublicUserProfile {
  id: string;
  nickname: string;
  photoURL: string | null;
  bio?: string;
  profilePublic?: boolean;
  friendRequestsAllowed?: boolean;
  primaryDiscipline?: "tri" | "bike" | "run" | "swim";
  stats?: UserStats;
  team?: string | null;
}

function readString(data: DocumentData, field: string): string | undefined {
  const value = data[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readBoolean(data: DocumentData, field: string): boolean | undefined {
  return typeof data[field] === "boolean" ? data[field] : undefined;
}

function toPublicUserProfile(id: string, data: DocumentData): PublicUserProfile {
  const nickname = readString(data, "nickname") ?? readString(data, "displayName") ?? id.slice(0, 8);
  const photoURL = readString(data, "photoURL") ?? null;
  const bio = readString(data, "bio");
  const primaryDiscipline = data.primaryDiscipline;
  return {
    id,
    nickname,
    photoURL,
    ...(bio ? { bio } : {}),
    ...(readBoolean(data, "profilePublic") != null ? { profilePublic: readBoolean(data, "profilePublic") } : {}),
    ...(readBoolean(data, "friendRequestsAllowed") != null ? { friendRequestsAllowed: readBoolean(data, "friendRequestsAllowed") } : {}),
    ...(primaryDiscipline === "tri" || primaryDiscipline === "bike" || primaryDiscipline === "run" || primaryDiscipline === "swim"
      ? { primaryDiscipline }
      : {}),
    ...(data.stats && typeof data.stats === "object" ? { stats: data.stats as UserStats } : {}),
    ...("team" in data ? { team: readString(data, "team") ?? null } : {}),
  };
}

export async function getPublicUserProfile(userId: string, database = firestore): Promise<PublicUserProfile | null> {
  const snap = await getDoc(doc(database, "users_public", userId));
  return snap.exists() ? toPublicUserProfile(snap.id, snap.data()) : null;
}

export async function getPublicUserProfiles(userIds: readonly string[]): Promise<Map<string, PublicUserProfile>> {
  const pairs = await Promise.allSettled(
    Array.from(new Set(userIds)).map(async (userId) => [userId, await getPublicUserProfile(userId)] as const),
  );
  return new Map(pairs.flatMap((result) => {
    if (result.status === "fulfilled") {
      const [userId, profile] = result.value;
      return profile ? [[userId, profile] as const] : [];
    }
    if (isPermissionDeniedError(result.reason)) return [];
    throw result.reason;
  }));
}

const AVATAR_CACHE_LIMIT = 256;
const AVATAR_MISSING_MAX_AGE_MS = 60_000;
type AvatarSession = {
  viewer: object | null;
  missing: Map<string, number>;
  pending: Map<string, Promise<PublicUserProfile | null>>;
};
const avatarSessions = new WeakMap<Firestore, WeakMap<object, AvatarSession>>();

/** 공유하는 것은 진행 중 조회와 아바타 부재뿐이다. 정상 프로필 결과는 전역 캐시하지 않는다. */
export async function getPublicUserAvatarProfiles(
  userIds: readonly string[], database: Firestore, authScope: object, viewer: object | null,
): Promise<Map<string, PublicUserProfile>> {
  let scopes = avatarSessions.get(database);
  if (!scopes) { scopes = new WeakMap(); avatarSessions.set(database, scopes); }
  let session = scopes.get(authScope);
  if (!session || session.viewer !== viewer) {
    session = { viewer, missing: new Map(), pending: new Map() };
    scopes.set(authScope, session);
  }
  const current = session;
  const pairs = await Promise.all(Array.from(new Set(userIds)).map(async userId => {
    if ((current.missing.get(userId) ?? 0) > Date.now()) return [userId, null] as const;
    current.missing.delete(userId);
    let pending = current.pending.get(userId);
    if (!pending) {
      const request = getPublicUserProfile(userId, database).then(profile => {
        if (!profile?.photoURL) {
          current.missing.set(userId, Date.now() + AVATAR_MISSING_MAX_AGE_MS);
          if (current.missing.size > AVATAR_CACHE_LIMIT) current.missing.delete(current.missing.keys().next().value!);
        }
        return profile;
      }).catch(error => {
        // 권한/네트워크 실패는 부재의 증거가 아니므로 세션 부재 캐시에 남기지 않는다.
        if (isPermissionDeniedError(error)) return null;
        throw error;
      });
      pending = request.finally(() => { if (current.pending.get(userId) === pending) current.pending.delete(userId); });
      current.pending.set(userId, pending);
      if (current.pending.size > AVATAR_CACHE_LIMIT) current.pending.delete(current.pending.keys().next().value!);
    }
    return [userId, await pending] as const;
  }));
  return new Map(pairs.flatMap(([uid, profile]) => profile?.photoURL ? [[uid, profile] as const] : []));
}

export async function searchPublicUserProfilesPage(searchText: string, cursor: QueryDocumentSnapshot<DocumentData> | null = null, maxResults = SEARCH_PAGE_SIZE, match: "prefix" | "exact" = "prefix") {
  const text = searchText.trim();
  if (!text) return { items: [], cursor: null, hasMore: false };
  const snap = await getDocs(query(
    collection(firestore, "users_public"),
    ...(match === "exact" ? [where("nickname", "==", text)] : [
      where("nickname", ">=", text),
      where("nickname", "<=", `${text}\uf8ff`),
    ]),
    orderBy("nickname"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(Math.min(maxResults, SEARCH_PAGE_SIZE)),
  ));
  return { items: snap.docs.map((item) => toPublicUserProfile(item.id, item.data())), cursor: snap.docs[snap.docs.length - 1] ?? null, hasMore: snap.docs.length === Math.min(maxResults, SEARCH_PAGE_SIZE) };
}

export async function searchPublicUserProfilesByNickname(searchText: string, maxResults = SEARCH_PAGE_SIZE): Promise<PublicUserProfile[]> {
  return (await searchPublicUserProfilesPage(searchText, null, maxResults)).items;
}
