/**
 * 앱 → 웹 로그인 인계 (handoff) 소비측.
 *
 * 모바일 앱은 로그인 상태에서 orider.co.kr 링크를 열 때 `?handoff=<일회용코드>` 를
 * 붙인다. 여기서 그 코드를 `webHandoffRedeem` 콜러블로 custom token 과 교환해
 * `signInWithCustomToken` — 앱과 같은 계정으로 웹 세션이 시작된다.
 *
 * 호출 계약 (main.tsx):
 *   1. `stashHandoffCode()` — 모듈 본문 첫 문장에서 **동기** 호출. 에러 리스너·Sentry·
 *      추가 리소스 로드 전에 URL 에서 코드를 제거해 same-origin Referer / Sentry
 *      request.url·리플레이로 라이브 코드가 새는 창을 최소화한다.
 *   2. `consumeAppHandoffCode()` — initFirebase 후, AuthProvider 마운트 전에 await.
 *      (마운트 전에 끝내야 onAuthStateChanged/ensureUserProfile 이 인계 계정으로 흐른다.)
 *
 * 소비는 CONSUME_TIMEOUT_MS 로 상한 — reCAPTCHA(App Check) 로드가 애드블록/프록시
 * 환경에서 hang 해도 마운트가 무한 블로킹되지 않고 비로그인으로 계속한다(리뷰 MAJOR).
 * 실패는 `didHandoffFail()` 로 마운트 후 토스트 1회 노출.
 */
import { signInWithCustomToken } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, functions } from "./firebase";
import { logClientError } from "./errorLogger";

export const HANDOFF_PARAM = "handoff";
// base64url 32바이트 = 43자 (functions/web-auth-handoff.ts 와 동일 계약)
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
// App Check 토큰 획득 자체가 최대 12초를 기다린다(firebase.ts). 그보다 짧으면 정상적인
// 인계가 먼저 timeout 처리되므로, callable·custom-token 로그인을 위한 여유를 더한다.
// hang 은 catch 로 못 잡으므로 race 는 유지한다.
const CONSUME_TIMEOUT_MS = 15_000;

let stashedCode: string | null = null;
let handoffFailed = false;

/** URL 에서 handoff 코드를 꺼내고, 히스토리에 남지 않도록 즉시 파라미터를 제거한다. */
export function extractHandoffCode(
  url: string,
  replaceUrl: (cleaned: string) => void,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const code = parsed.searchParams.get(HANDOFF_PARAM);
  if (code === null) return null;
  parsed.searchParams.delete(HANDOFF_PARAM);
  replaceUrl(parsed.toString());
  return CODE_PATTERN.test(code) ? code : null;
}

/**
 * 모듈 로드 직후 동기 호출: 현재 페이지 URL 의 handoff 코드를 제거해 내부 보관한다.
 * 이 시점 이후로는 주소창·location.href 어디에도 코드가 남지 않는다.
 */
export function stashHandoffCode(): void {
  if (typeof window === "undefined") return;
  stashedCode = extractHandoffCode(window.location.href, (cleaned) => {
    window.history.replaceState(window.history.state, "", cleaned);
  });
}

/** 인계 시도가 실패했는지 — 마운트 후 안내 토스트용. 1회 읽으면 리셋된다. */
export function didHandoffFail(): boolean {
  const failed = handoffFailed;
  handoffFailed = false;
  return failed;
}

async function redeemAndSignIn(code: string): Promise<void> {
  await ensureAppCheckReady();
  const redeem = httpsCallable<{ code: string }, { token: string }>(functions, "webHandoffRedeem");
  const { data } = await redeem({ code });
  await signInWithCustomToken(auth, data.token);
}

/** 보관된 handoff 코드가 있으면 소비해 로그인한다. 실패·타임아웃은 무해하게 삼킨다. */
export async function consumeAppHandoffCode(): Promise<void> {
  if (typeof window === "undefined") return;
  // 방어: stash 가 누락된 채 호출돼도 동작하도록 (정상 경로는 main.tsx 최상단 stash)
  if (stashedCode === null) stashHandoffCode();
  const code = stashedCode;
  stashedCode = null;
  if (!code) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`handoff timeout (${CONSUME_TIMEOUT_MS}ms)`)), CONSUME_TIMEOUT_MS);
  });
  try {
    await Promise.race([redeemAndSignIn(code), timeout]);
  } catch (err) {
    // 만료/재사용 코드, 네트워크 오류, App Check hang 등 — 비로그인으로 계속
    handoffFailed = true;
    logClientError("appHandoff.consume", err);
  } finally {
    clearTimeout(timer);
  }
}
