import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "./firebase";
import { logClientError } from "./errorLogger";

/**
 * 네이버·카카오 로그인/계정 연결 (서버 custom token 흐름).
 *
 * Firebase Auth 가 네이버·카카오를 지원하지 않아 서버(`socialAuthStart`/`socialAuthComplete`)가
 * OAuth code 를 교환하고 custom token 을 준다. 동의 화면은 전체 페이지 이동이라
 * 돌아올 경로(returnTo)는 서버 state 에 실어 보낸다.
 */
export type SocialProvider = "naver" | "kakao";
export type SocialMode = "login" | "link";

export const SOCIAL_PROVIDERS: readonly SocialProvider[] = ["naver", "kakao"];
/** 언어 접두 없는 경로 — LocaleRedirect 가 쿼리를 보존해 /:lang/auth/social/callback 으로 보낸다. */
export const SOCIAL_CALLBACK_PATH = "/auth/social/callback";
const pendingStateKey = "orider.social-auth.state.v1";

/** 이 탭에서 시작한 OAuth 요청만 허용한다. 다른 브라우저가 발급받은 콜백의 세션 주입을 막는다. */
export function consumeSocialAuthState(state: string | null): boolean {
  if (!state) return false;
  try {
    if (sessionStorage.getItem(pendingStateKey) !== state) return false;
    sessionStorage.removeItem(pendingStateKey);
    return true;
  } catch {
    return false;
  }
}

export type SocialCompleteResult =
  | { mode: "login"; provider: SocialProvider; token: string; isNewUser: boolean; returnTo: string }
  | { mode: "link"; provider: SocialProvider; returnTo: string };

export function socialRedirectUri(): string {
  return `${window.location.origin}${SOCIAL_CALLBACK_PATH}`;
}

/** /ko/activity/1 → /activity/1. 서버는 언어 접두 없는 경로를 받고, 콜백이 현재 언어로 붙인다. */
export function currentReturnTo(): string {
  const { pathname, search, hash } = window.location;
  const stripped = pathname.replace(/^\/(ko|en)(?=\/|$)/, "") || "/";
  return `${stripped}${search}${hash}`;
}

/** 동의 화면으로 이동. 성공 시 페이지를 떠나므로 resolve 되지 않는다. */
export async function startSocialAuth(provider: SocialProvider, mode: SocialMode, returnTo = currentReturnTo()): Promise<void> {
  try {
    await ensureAppCheckReady();
    const start = httpsCallable<
      { provider: SocialProvider; mode: SocialMode; redirectUri: string; returnTo: string },
      { authorizeUrl: string }
    >(functions, "socialAuthStart");
    const { data } = await start({ provider, mode, redirectUri: socialRedirectUri(), returnTo });
    const state = new URL(data.authorizeUrl).searchParams.get("state");
    if (!state) throw new Error("social-auth/missing-state");
    // 저장소를 사용할 수 없으면 이동하지 않는다. 콜백에서 브라우저 일치를 확인할 수 없기 때문이다.
    sessionStorage.setItem(pendingStateKey, state);
    window.location.assign(data.authorizeUrl);
  } catch (err) {
    logClientError("socialAuth.start", err, { provider, mode });
    throw err;
  }
}

export async function completeSocialAuth(code: string, state: string): Promise<SocialCompleteResult> {
  await ensureAppCheckReady();
  const complete = httpsCallable<{ code: string; state: string }, SocialCompleteResult>(functions, "socialAuthComplete");
  const { data } = await complete({ code, state });
  return data;
}

export async function listSocialLinks(): Promise<Array<{ provider: SocialProvider; linkedAt: number | null }>> {
  await ensureAppCheckReady();
  const list = httpsCallable<void, { links: Array<{ provider: SocialProvider; linkedAt: number | null }> }>(functions, "socialAuthListLinks");
  const { data } = await list();
  return data.links;
}

export async function unlinkSocial(provider: SocialProvider): Promise<boolean> {
  await ensureAppCheckReady();
  const unlink = httpsCallable<{ provider: SocialProvider }, { unlinked: boolean }>(functions, "socialAuthUnlink");
  const { data } = await unlink({ provider });
  return data.unlinked;
}
