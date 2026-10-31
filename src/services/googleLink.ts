import { GoogleAuthProvider, linkWithCredential, linkWithPopup, reauthenticateWithPopup, signInWithCredential, unlink, type AuthCredential, type User } from "firebase/auth";
import { auth, ensureAppCheckReady, googleProvider, withIsolatedAuth } from "./firebase";
import { authCallable } from "./authCallables";

export const GOOGLE_PROVIDER_ID = "google.com";

export function hasGoogleLogin(user: Pick<User, "providerData"> | null | undefined): boolean {
  return !!user?.providerData?.some((info) => info.providerId === GOOGLE_PROVIDER_ID);
}

export type GoogleLinkResult = "linked" | "connected" | "cancelled";

/**
 * 현재 계정에 Google 로그인을 연결한다.
 *
 * 그 Google 계정이 이미 다른(빈) O-Rider 계정에 연결돼 있으면 사용자 확인 뒤 서버
 * `connectExistingGoogleAccount` 가 빈 계정을 닫고 Google 을 풀어준다. 빈 계정 소유 증명은
 * 현재 세션과 분리된 메모리 전용 Auth 로 받은 ID 토큰이며, 이후 같은 자격증명을 현재 계정에 연결한다.
 * 빈 계정에 데이터가 있으면 서버가 `social-account-data-conflict` 로 거부하고 아무것도 바꾸지 않는다.
 */
export async function linkGoogleToCurrentUser(confirmConnectExisting: () => Promise<boolean>): Promise<GoogleLinkResult> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("auth/no-current-user");
  let credential: AuthCredential | null;
  try {
    await linkWithPopup(user, googleProvider);
    await user.reload();
    return "linked";
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/credential-already-in-use") throw error;
    credential = GoogleAuthProvider.credentialFromError(error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
    if (!credential) throw error;
  }
  if (!(await confirmConnectExisting())) return "cancelled";
  const googleCredential = credential;
  const sourceIdToken = await withIsolatedAuth(async (isolated) => (await signInWithCredential(isolated, googleCredential)).user.getIdToken());
  // 확인 대화상자 동안 다른 탭에서 계정이 바뀌었으면 다른 계정에 연결하지 않는다.
  if (auth.currentUser?.uid !== user.uid) throw new Error("auth/user-changed");
  await ensureAppCheckReady();
  await authCallable<{ sourceIdToken: string }, { connected: true }>("connectExistingGoogleAccount")({ sourceIdToken });
  if (auth.currentUser?.uid !== user.uid) throw new Error("auth/user-changed");
  await linkWithCredential(user, googleCredential);
  await user.reload();
  return "connected";
}

/**
 * Google 을 떼도 이 계정에 로그인할 수단이 남는가.
 * 서버 `socialAuthUnlink` 의 "마지막 로그인 수단" 규칙과 같다: Firebase 고유 로그인(이메일 등)이나
 * 연결된 소셜 로그인(네이버·카카오·Strava)이 하나라도 남아야 한다. 연결 목록을 모르면(null) 막는다.
 */
export function canUnlinkGoogle(user: Pick<User, "providerData">, linkedSocialCount: number | null): boolean {
  if (linkedSocialCount === null) return false;
  const others = user.providerData.filter((info) => info.providerId !== GOOGLE_PROVIDER_ID).length;
  return others > 0 || linkedSocialCount > 0;
}

/** 현재 계정에서 Google 로그인을 뗀다. 최근 로그인이 필요하면 Google 로 한 번 재인증한 뒤 다시 시도한다. */
export async function unlinkGoogleFromCurrentUser(): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("auth/no-current-user");
  try {
    await unlink(user, GOOGLE_PROVIDER_ID);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/requires-recent-login") throw error;
    await reauthenticateWithPopup(user, googleProvider);
    if (auth.currentUser?.uid !== user.uid) throw new Error("auth/user-changed");
    await unlink(user, GOOGLE_PROVIDER_ID);
  }
  await user.reload();
}
