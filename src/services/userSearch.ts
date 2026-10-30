import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { logClientError } from "./errorLogger";

/** 공개 프로필일 때만 서버가 채우는 상세 정보 */
export interface SearchUserDetails {
  bio?: string;
  primaryDiscipline?: "tri" | "bike" | "run" | "swim";
  /** users_public stats.totalDistance 와 같은 단위(미터) */
  totalDistance?: number;
  activityCount?: number;
  subscriptionCount?: number;
  subscriberCount?: number;
  friendCount?: number;
  /** startTime 은 epoch ms */
  lastActivity?: { id: string; title: string; startTime: number } | null;
}

/** 서버 `searchUsers` 호출 계약 — 자기 자신·차단 사용자는 서버가 제외한다. 비공개 프로필도 기본 정보로 포함된다. */
export interface SearchUserItem {
  id: string;
  nickname: string;
  photoURL: string | null;
  friendCode: string | null;
  friendRequestsAllowed: boolean;
  matchedBy: "email" | "friendCode" | "nickname";
  profilePublic: boolean;
  /** profilePublic 이 true 일 때만 존재 */
  details?: SearchUserDetails;
}

export interface SearchUsersResult {
  items: SearchUserItem[];
  nextCursor: string | null;
}

export const USER_SEARCH_MAX_LENGTH = 100;

export type UserSearchErrorKind = "unauthenticated" | "invalid" | "rateLimited" | "failed";

export function userSearchErrorKind(error: unknown): UserSearchErrorKind {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code.endsWith("unauthenticated")) return "unauthenticated";
  if (code.endsWith("invalid-argument")) return "invalid";
  if (code.endsWith("resource-exhausted")) return "rateLimited";
  return "failed";
}

export async function searchUsers(query: string, cursor: string | null = null): Promise<SearchUsersResult> {
  try {
    const call = httpsCallable<{ query: string; cursor: string | null }, Partial<SearchUsersResult> | null>(functions, "searchUsers");
    const { data } = await call({ query, cursor });
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextCursor: typeof data?.nextCursor === "string" && data.nextCursor ? data.nextCursor : null,
    };
  } catch (error) {
    // 검색어(이메일일 수 있음)는 남기지 않고 길이·페이지 여부만 기록한다.
    logClientError("userSearch.searchUsers", error, { queryLength: query.length, hasCursor: cursor !== null, kind: userSearchErrorKind(error) });
    throw error;
  }
}
