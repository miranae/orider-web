/** 로그인 선택 창을 닫았을 때 `signIn()` 이 던지는 코드 — Google 팝업을 닫은 것과 같게 다룬다. */
export const SIGN_IN_CANCELLED = "auth/popup-closed-by-user";

export function isSignInCancelled(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === SIGN_IN_CANCELLED;
}

export function signInCancelledError(): Error & { code: string } {
  return Object.assign(new Error("sign-in cancelled"), { code: SIGN_IN_CANCELLED });
}
