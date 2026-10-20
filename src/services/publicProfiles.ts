import { SEARCH_PAGE_SIZE } from "../constants/pagination";
import { collection, doc, getDoc, getDocs, limit, query, where, orderBy, startAfter, type QueryDocumentSnapshot, type DocumentData } from "firebase/firestore";
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

export async function getPublicUserProfile(userId: string): Promise<PublicUserProfile | null> {
  const snap = await getDoc(doc(firestore, "users_public", userId));
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
