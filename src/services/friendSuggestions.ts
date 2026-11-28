import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime, isFunctionsGatewayRuntime } from "./runtimeConfig";
import { logClientError } from "./errorLogger";

/** 서버 `listFriendSuggestions`(asia-northeast3, miranae/orider-g1-web#4235) 응답 항목. */
export interface FriendSuggestion {
  uid: string;
  nickname: string;
  profileImageUrl: string | null;
  coRideCount: number;
  clubNames: string[];
}

export type FriendSuggestionReason = { kind: "coRide"; count: number } | { kind: "club" };

/** 카드 근거 한 줄: 함께 탄 횟수가 우선, 없으면 같은 클럽. 둘 다 없으면 근거 없음. */
export function friendSuggestionReason(item: FriendSuggestion): FriendSuggestionReason | null {
  if (item.coRideCount > 0) return { kind: "coRide", count: item.coRideCount };
  return item.clubNames.length > 0 ? { kind: "club" } : null;
}

/** 응답을 계약 모양으로 거른다 — 모양이 다른 항목은 버린다. */
export function parseFriendSuggestions(data: unknown): FriendSuggestion[] {
  const items = typeof data === "object" && data !== null ? (data as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: FriendSuggestion[] = [];
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(item.uid) || seen.has(item.uid)) continue;
    seen.add(item.uid);
    const count = typeof item.coRideCount === "number" && Number.isSafeInteger(item.coRideCount) && item.coRideCount > 0 ? item.coRideCount : 0;
    result.push({
      uid: item.uid,
      nickname: typeof item.nickname === "string" ? item.nickname.trim() : "",
      profileImageUrl: typeof item.profileImageUrl === "string" && item.profileImageUrl ? item.profileImageUrl : null,
      coRideCount: count,
      clubNames: Array.isArray(item.clubNames) ? item.clubNames.filter((name): name is string => typeof name === "string" && !!name.trim()) : [],
    });
  }
  return result;
}

// 미배포(엔드포인트 없음 → not-found/internal)·일시 장애는 정상 경로로 보고 기록하지 않는다.
const QUIET_CODES = ["not-found", "internal", "unavailable", "unauthenticated", "deadline-exceeded", "cancelled"];
const connected = new WeakSet<object>();

/**
 * 친구 추천 목록. 비로그인·익명이면 부르지 않고, 콜러블이 없거나 어떤 오류든 빈 목록이다 —
 * 화면은 빈 목록이면 추천 줄을 숨긴다.
 */
export async function listFriendSuggestions(
  services: Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">,
  limit = 10,
): Promise<FriendSuggestion[]> {
  const viewer = services.auth.currentUser;
  if (!viewer || viewer.isAnonymous) return [];
  try {
    await services.ensureAppCheckReady();
    if (services.auth.currentUser !== viewer) return [];
    const functions = isFunctionsGatewayRuntime(getRuntimeConfig()) ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
    if (isEmulatorRuntime() && !connected.has(functions)) {
      connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
      connected.add(functions);
    }
    const { data } = await httpsCallable<{ limit: number }, unknown>(functions, "listFriendSuggestions", { timeout: 10000 })({ limit });
    if (services.auth.currentUser !== viewer) return [];
    return parseFriendSuggestions(data);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (!QUIET_CODES.some(quiet => code.endsWith(quiet))) logClientError("friendSuggestions.list", error, { code });
    return [];
  }
}
