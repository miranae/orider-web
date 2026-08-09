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

/**
 * 저장된 위임 상태 읽기 결과.
 *
 * `corrupt` 를 별도로 돌려주는 이유: 값이 깨졌다고 배너를 숨기면 이 기능이 막으려던
 * "배너 없는 위임 세션" 이 그대로 재현된다. 대상 uid 를 모르더라도 위임 중임은 알린다.
 */
export type ImpersonationRead =
  | { status: "none" }
  | { status: "active"; state: ImpersonationState }
  | { status: "corrupt" };

/**
 * 스토리지가 막힌 환경의 마지막 방어선 — 저장에 실패해도 이 SPA 세션 동안은 배너가 뜬다.
 * (새로고침하면 사라지지만, localStorage 를 못 쓰는 브라우저는 Firebase auth 지속성도
 * 같이 잃어 위임 세션 자체가 남지 않는다.)
 */
let memoryFallback: ImpersonationState | null = null;

export function readImpersonation(): ImpersonationRead {
  if (typeof window === "undefined") return { status: "none" };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    // 스토리지 접근 자체가 막힌 환경 — 위임 여부를 판단할 근거가 없으므로 기록만 남긴다.
    logClientError("Impersonation.readBlocked", e, {});
    return memoryFallback ? { status: "active", state: memoryFallback } : { status: "none" };
  }
  if (!raw) {
    return memoryFallback ? { status: "active", state: memoryFallback } : { status: "none" };
  }
  try {
    const state = JSON.parse(raw) as ImpersonationState;
    // by/at 까지 검증한다 — by 가 객체면 배너가 React 자식으로 렌더하다 앱이 죽는다.
    if (
      typeof state?.targetUid !== "string" || !state.targetUid ||
      typeof state.by !== "string" ||
      typeof state.at !== "number" || !Number.isFinite(state.at)
    ) {
      throw new Error("impersonation/state-malformed");
    }
    return { status: "active", state };
  } catch (e) {
    logClientError("Impersonation.readCorrupt", e, { rawLength: raw.length });
    return { status: "corrupt" };
  }
}

export function readImpersonationState(): ImpersonationState | null {
  const read = readImpersonation();
  return read.status === "active" ? read.state : null;
}

/** 저장 성공 여부를 돌려준다 — 상태 없이 세션만 남으면 배너가 뜨지 않는다. */
function writeImpersonationState(state: ImpersonationState): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch (e) {
    // 호출자는 합성 에러만 기록하므로 QuotaExceededError·SecurityError 원본을 여기서 남긴다.
    logClientError("Impersonation.stateWriteThrew", e, { targetUid: state.targetUid });
    return false;
  }
}

export function clearImpersonationState() {
  memoryFallback = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // 삭제 실패를 삼키면 stale 상태가 남아, 이후 같은 uid 의 정상 로그인에 위임 배너가 뜬다.
    logClientError("Impersonation.clearFailed", e, {});
  }
}

/** URL 에 위임 토큰이 실려 있는지 — main 이 마운트 전에 await 할지 판단한다. */
export function hasImpersonationTokenInUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(TOKEN_PARAM);
}

let stashedToken: string | null = null;

/**
 * 모듈 로드 직후 동기 호출(main.tsx 본문): URL 에서 위임 토큰을 꺼내 내부 보관하고
 * 주소에서 제거한다. Sentry(특히 Replay) · 에러 리스너 · 후속 리소스 로드가 토큰이
 * 실린 URL 을 관측하는 창을 없앤다 — handoff 코드와 같은 계약이다.
 */
export function stashImpersonationToken(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get(TOKEN_PARAM);
  if (token === null) return;
  stashedToken = token;
  url.searchParams.delete(TOKEN_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

export async function applyImpersonationTokenFromUrl(auth: Auth): Promise<void> {
  if (typeof window === "undefined") return;
  // stash 를 놓친 경로(테스트·직접 호출)도 여기서 동기적으로 URL 을 정리한다.
  if (stashedToken === null) stashImpersonationToken();
  const token = stashedToken;
  stashedToken = null;
  if (token === null) return;
  if (!token) {
    // `?impersonateToken=` 처럼 빈 값 — 잘못 만들어진 링크다. 조용히 넘기면 다른 실패와
    // 달리 아무 흔적이 남지 않는다.
    logClientError("Impersonation.emptyToken", new Error("impersonation/empty-token"), {});
    notifyImpersonationFailure("위임 링크에 토큰이 없습니다. 관리자 페이지에서 다시 발급해 주세요.");
    return;
  }

  // 기존 세션이 있으면 먼저 signOut — 새 위임 세션으로 깔끔하게 전환.
  // 실패하면 여기서 중단한다. 그대로 진행했다가 토큰 로그인까지 실패하면 이전 계정
  // (대개 관리자 본인) 세션이 남은 채 마운트돼, 위임된 줄 알고 자기 계정을 만지게 된다.
  if (auth.currentUser) {
    try {
      await signOut(auth);
    } catch (e) {
      logClientError("Impersonation.signOutBeforeSwitch", e, { hadUser: true });
      notifyImpersonationFailure(
        "이전 세션 로그아웃에 실패해 위임 로그인을 중단했습니다. 아직 기존 계정으로 로그인된 상태입니다.",
      );
      return;
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
      await abandonUnverifiedImpersonation(auth, "Impersonation.getIdTokenResult", e, {
        tokenLength,
        targetUid: cred.user.uid,
      });
      return;
    }
    if (claims.impersonated !== true) {
      // 위임 토큰이 아닌 custom token 으로는 이 경로를 통과시키지 않는다.
      await abandonUnverifiedImpersonation(
        auth,
        "Impersonation.missingClaim",
        new Error("impersonation/claim-missing"),
        { tokenLength, targetUid: cred.user.uid },
      );
      return;
    }
    const recorded = writeImpersonationState({
      by: typeof claims.impersonatedBy === "string" ? claims.impersonatedBy : "admin",
      at: Date.now(),
      targetUid: cred.user.uid,
    });
    if (!recorded) {
      // localStorage 가 막힌 환경(사파리 프라이빗·용량 초과·정책 차단)에서는 배너가 읽을
      // 상태가 없다. 세션만 남기면 위임 중임을 알 수 없으므로 시작하지 않는다.
      await abandonUnverifiedImpersonation(
        auth,
        "Impersonation.stateWriteFailed",
        new Error("impersonation/state-write-failed"),
        { tokenLength, targetUid: cred.user.uid },
      );
    }
  } catch (e) {
    // 만료(TTL 1시간)·잘못된 토큰이 대부분이라 사용자에게는 로그인 화면이 그대로 남는다.
    // 조용히 삼키면 "눌렀는데 아무 일도 없다"가 되므로 반드시 기록한다.
    logClientError("Impersonation.signInWithCustomToken", e, {
      hasToken: true,
      tokenLength,
    });
    // 만료·오류 사유를 알리지 않으면 관리자에게는 그대로 "눌렀는데 아무 일도 없다" 가 된다.
    notifyImpersonationFailure("위임 로그인에 실패했습니다. 링크가 만료됐을 수 있으니 다시 발급해 주세요.");
  }
}

let failureMessage: string | null = null;

/**
 * 위임 실패는 조용히 넘기지 않는다. 이 경로는 마운트 전이라 토스트 컨텍스트가 없으므로
 * handoff 와 같은 계약으로 플래그만 세우고, App 이 마운트 직후 1회 읽어 노출한다.
 */
function notifyImpersonationFailure(message: string): void {
  failureMessage = message;
}

/** 마운트 후 1회 읽고 리셋 — 읽지 않으면 다음 렌더에서 중복 노출된다. */
export function takeImpersonationFailure(): string | null {
  const message = failureMessage;
  failureMessage = null;
  return message;
}

/** 위임임을 확정하지 못한 세션은 남기지 않는다 — 배너 없는 위임 세션이 최악의 상태다. */
async function abandonUnverifiedImpersonation(
  auth: Auth,
  source: string,
  error: unknown,
  context: { tokenLength: number; targetUid?: string },
): Promise<void> {
  clearImpersonationState();
  try {
    await signOut(auth);
  } catch (signOutError) {
    logClientError("Impersonation.signOutAfterUnverified", signOutError, context);
    // 정리 로그아웃까지 실패하면 인증된 세션이 그대로 남는다. 조용히 마운트하면
    // 배너 없는 위임 세션이 되므로, 배너가 뜨도록 상태를 남기고 실패를 알린다.
    if (context.targetUid) {
      const state: ImpersonationState = { by: "확인 불가", at: Date.now(), targetUid: context.targetUid };
      // 저장이 실패해도(애초에 stateWriteFailed 로 들어온 경로라면 다시 실패한다) 배너는
      // 떠야 하므로 메모리 fallback 을 함께 세운다.
      memoryFallback = state;
      writeImpersonationState(state);
    }
    notifyImpersonationFailure(
      "위임 세션 정리에 실패했습니다. 아직 대상 사용자로 로그인된 상태이니 즉시 로그아웃해 주세요.",
    );
  }
  logClientError(source, error, context);
}
