/**
 * 관리자 위임 로그인 — URL 토큰 핸들러 + 세션 상태.
 *
 * `?impersonateToken=<customToken>` 쿼리가 있으면 Firebase signInWithCustomToken 으로 그
 * 토큰의 사용자(=위임 대상)로 로그인하고 URL 에서 쿼리를 제거한다.
 *
 * 위임 상태는 localStorage 에 저장한다 — Firebase 는 토큰 자동 갱신 시 custom token 의
 * claims 를 보존하지 않아, 토큰 기반 검출은 새로고침·갱신 후 사라진다(영구 보존은
 * setCustomUserClaims 뿐). 그래서 sign-in 직후 claims 가 아직 살아있을 때 추출해 둔다.
 *
 * 토큰 발급 경로:
 *   - 웹: admin.orider.co.kr `/admin/impersonate` → CF `adminImpersonate`
 *     (admin claim 검증 + admin_audit 감사로그) → 이 앱으로 리다이렉트
 *   - CLI: `node functions/admin-impersonate.mjs <email>` (admin SDK 직접 발급)
 *
 * 보안 경계는 이 파일이 아니다 — 토큰 발급은 CF 의 admin claim 검증이, 데이터 접근은
 * Firestore rules 가 강제한다. 여기서는 발급된 토큰을 소비하고 위임 중임을 노출한다.
 */
import { signInWithCustomToken, signOut, type Auth } from "firebase/auth";

import { logClientError } from "./errorLogger";

const TOKEN_PARAM = "impersonateToken";
const STORAGE_KEY = "orider:impersonation";

export interface ImpersonationState {
  /** 위임을 시작한 관리자 식별자 (CLI=쉘 USER, 웹=adminUid). */
  by: string;
  /** 위임 시작 시각 (epoch ms). */
  at: number;
  /** 위임 대상 uid. */
  targetUid: string;
}

export function readImpersonationState(): ImpersonationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationState) : null;
  } catch { return null; }
}

function writeImpersonationState(state: ImpersonationState) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function clearImpersonationState() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** URL 에 위임 토큰이 실려 있는지 — main 이 마운트 전에 await 할지 판단한다. */
export function hasImpersonationTokenInUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(TOKEN_PARAM);
}

export async function applyImpersonationTokenFromUrl(auth: Auth): Promise<void> {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get(TOKEN_PARAM);
  if (!token) return;

  // 토큰은 읽은 즉시 주소에서 지운다 — 아래 비동기 구간(수 초) 동안 주소창·Referer·
  // 관측 시스템에 실제 자격증명이 남아 있지 않게 한다.
  url.searchParams.delete(TOKEN_PARAM);
  window.history.replaceState({}, "", url.toString());

  // 기존 세션이 있으면 먼저 signOut — 새 위임 세션으로 깔끔하게 전환.
  if (auth.currentUser) {
    try {
      await signOut(auth);
    } catch (e) {
      // 전환 실패를 삼키면 이전 계정 세션이 남은 채 위임이 시작된 것처럼 보인다.
      logClientError("Impersonation.signOutBeforeSwitch", e, { hadUser: true });
    }
  }
  clearImpersonationState();

  const tokenLength = token.length;
  try {
    const cred = await signInWithCustomToken(auth, token);
    let claims: Record<string, unknown>;
    try {
      ({ claims } = await cred.user.getIdTokenResult());
    } catch (e) {
      // claim 을 못 읽으면 위임 여부를 확정할 수 없다. 인증된 세션만 남으면 배너 없는
      // 위임 세션이 되므로 세션을 끊는다.
      await abandonUnverifiedImpersonation(auth, "Impersonation.getIdTokenResult", e, { tokenLength });
      return;
    }
    if (claims.impersonated !== true) {
      // 위임 토큰이 아닌 custom token 으로는 이 경로를 통과시키지 않는다.
      await abandonUnverifiedImpersonation(
        auth,
        "Impersonation.missingClaim",
        new Error("impersonation/claim-missing"),
        { tokenLength },
      );
      return;
    }
    writeImpersonationState({
      by: typeof claims.impersonatedBy === "string" ? claims.impersonatedBy : "admin",
      at: Date.now(),
      targetUid: cred.user.uid,
    });
  } catch (e) {
    // 만료(TTL 1시간)·잘못된 토큰이 대부분이라 사용자에게는 로그인 화면이 그대로 남는다.
    // 조용히 삼키면 "눌렀는데 아무 일도 없다"가 되므로 반드시 기록한다.
    logClientError("Impersonation.signInWithCustomToken", e, {
      hasToken: true,
      tokenLength,
    });
  }
}

/** 위임임을 확정하지 못한 세션은 남기지 않는다 — 배너 없는 위임 세션이 최악의 상태다. */
async function abandonUnverifiedImpersonation(
  auth: Auth,
  source: string,
  error: unknown,
  context: Record<string, unknown>,
): Promise<void> {
  clearImpersonationState();
  try {
    await signOut(auth);
  } catch (signOutError) {
    logClientError("Impersonation.signOutAfterUnverified", signOutError, context);
  }
  logClientError(source, error, context);
}
