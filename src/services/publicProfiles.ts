import { collection, doc, getDoc, getDocs, limit, query, where, type DocumentData } from "firebase/firestore";
import type { UserStats } from "@shared/types";
import { firestore } from "./firebase";

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
  const pairs = await Promise.all(
    Array.from(new Set(userIds)).map(async (userId) => [userId, await getPublicUserProfile(userId)] as const),
  );
  return new Map(pairs.filter((pair): pair is readonly [string, PublicUserProfile] => pair[1] != null));
}

export async function searchPublicUserProfilesByNickname(searchText: string, maxResults = 10): Promise<PublicUserProfile[]> {
  const text = searchText.trim();
  if (!text) return [];
  const snap = await getDocs(query(
    collection(firestore, "users_public"),
    where("nickname", ">=", text),
    where("nickname", "<=", `${text}\uf8ff`),
    limit(maxResults),
  ));
  return snap.docs.map((item) => toPublicUserProfile(item.id, item.data()));
}
