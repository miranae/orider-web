/**
 * 앱 → 웹 로그인 인계 (handoff) 소비측.
 *
 * 모바일 앱은 로그인 상태에서 orider.co.kr 링크를 열 때 `?handoff=<일회용코드>` 를
 * 붙인다. 여기서 그 코드를 `webHandoffRedeem` 콜러블로 custom token 과 교환해
 * `signInWithCustomToken` — 앱과 같은 계정으로 웹 세션이 시작된다.
 *
 * 호출 시점: main.tsx 에서 initFirebase 직후, AuthProvider 마운트 전에 await.
 * (마운트 전에 끝내야 onAuthStateChanged/ensureUserProfile 이 인계된 계정으로 흐른다.)
 * 코드는 2분 TTL·1회용이라 실패해도 조용히 비로그인 상태로 계속한다.
 */
import { signInWithCustomToken } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, ensureAppCheckReady, functions } from "./firebase";
import { logClientError } from "./errorLogger";

export const HANDOFF_PARAM = "handoff";
// base64url 32바이트 = 43자 (functions/web-auth-handoff.ts 와 동일 계약)
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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

/** 현재 페이지 URL 에 handoff 코드가 있으면 소비해 로그인한다. 실패는 무해하게 삼킨다. */
export async function consumeAppHandoffCode(): Promise<void> {
  if (typeof window === "undefined") return;
  const code = extractHandoffCode(window.location.href, (cleaned) => {
    window.history.replaceState(window.history.state, "", cleaned);
  });
  if (!code) return;
  try {
    await ensureAppCheckReady();
    const redeem = httpsCallable<{ code: string }, { token: string }>(functions, "webHandoffRedeem");
    const { data } = await redeem({ code });
    await signInWithCustomToken(auth, data.token);
  } catch (err) {
    // 만료/재사용 코드, 네트워크 오류 등 — 로그만 남기고 비로그인 상태로 계속
    logClientError("appHandoff.consume", err);
  }
}
